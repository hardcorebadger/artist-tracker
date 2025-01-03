import json
import math

from firebase_admin import initialize_app, firestore, functions, auth
from firebase_admin.auth import UserRecord
from firebase_functions import https_fn, scheduler_fn, tasks_fn, options
from firebase_functions.options import RetryConfig, MemoryOption
from flask import jsonify
from google.cloud.firestore_v1 import FieldFilter
from sqlalchemy import select, or_
from sqlalchemy.orm import joinedload

from controllers.artists import ArtistController
from controllers.twilio import TwilioController
from cron_jobs import eval_cron, stats_cron, onboarding_cron
from lib.utils import get_function_url
from tmp_keys import *
from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, OrganizationArtist, StatisticType, \
    ArtistTag, Playlist
from controllers import AirtableV1Controller, TaskController, TrackingController, EvalController
import flask
from datetime import datetime, timedelta
import traceback
# from local_scripts import dump_unclean

#################################
# App Initialization
#################################

app = initialize_app()

#################################
# Globals
#################################

spotify_client = None
stat_types = None
link_sources = None

sql = None

def get_tag_types():
    return dict({
        1: {
            "id": 1,
            "name": "User Tag",
            "key": "user"
        },
        2: {
            "id": 2,
            "name": "Genre",
            "key": "genre"
        }
    })

def get_sql() -> CloudSQLClient:
    global sql
    if sql is None:
        sql = CloudSQLClient(PROJECT_ID, LOCATION, SQL_INSTANCE, SQL_USER, SQL_PASSWORD, SQL_DB)
    return sql

@tasks_fn.on_task_dispatched(retry_config=RetryConfig(max_attempts=5, max_backoff_seconds=60), memory=MemoryOption.MB_512)
def addartisttask(req: tasks_fn.CallableRequest) -> str:
    db = firestore.client(app)
    songstats = SongstatsClient(SONGSTATS_API_KEY)
    spotify = get_spotify_client()
    tracking_controller = TrackingController(spotify, songstats, get_sql(), db)
    uid = req.data.get('uid')
    spotify_id = req.data.get('spotify_id')
    playlist_id = req.data.get('playlist_id', None)
    tags = req.data.get('tags', None)
    user_data = get_user(uid, db)

    message, code = tracking_controller.add_artist(spotify_id, uid, user_data['organization'], playlist_id, tags)
    return message


@tasks_fn.on_task_dispatched(retry_config=RetryConfig(max_attempts=5, min_backoff_seconds=60), memory=MemoryOption.MB_512)
def reimportsql(req: tasks_fn.CallableRequest) -> str:

    count = int(req.data.get('size', 50))
    page = int(req.data.get('page', 0))

    page, updated, found, new = reimport_artists_eval(page, count)
    print("Page: " + str(page) + " Found: " + str(found) + " Updated: " + str(updated) + " new: " + str(new))
    return "Page: " + str(page) + " Found: " + str(found) + " Updated: " + str(updated) + " new: " + str(new)

def reimport_artists_eval(page = 0, page_size = 50):
    db = firestore.client(app)
    songstats = SongstatsClient(SONGSTATS_API_KEY)
    spotify = get_spotify_client()

    tracking_controller = TrackingController(spotify, songstats, get_sql(), db)
    offset = page * page_size
    old_artists = db.collection("artists_v2").limit(page_size).offset(offset).get()
    spotifys = list(map(lambda x: x.get('spotify_id'), old_artists))

    sql_session = get_sql().get_session()
    found = 0
    updated = 0
    new = 0
    existing = sql_session.scalars(
        select(Artist).options(joinedload(Artist.evaluation)).where(Artist.spotify_id.in_(spotifys))).all()
    evalIds = list()
    for artist in old_artists:
        spotify_id = artist.get('spotify_id')
        add_batch = list()
        existingMatches = list(filter(lambda x: x.spotify_id == spotify_id, existing))

        if len(existingMatches) > 0:
            found += 1
            existingMatch = existingMatches[0]
            status = 1
            if artist.get('eval_status') == 'unsigned':
                status = 0
            back_catalog = 0
            if artist.get('eval_prios') == 'dirty':
                back_catalog = 1
            if existingMatch.evaluation and (existingMatch.evaluation.status != status or existingMatch.evaluation.back_catalog != back_catalog):
                updated += 1
                existingMatch.evaluation.status = status
                existingMatch.evaluation.back_catalog = back_catalog
                evalIds.append(existingMatch.evaluation.id)
                sql_session.add(existingMatch.evaluation)
                if len(evalIds) > 50:
                    sql_session.commit()
                    evalIds = list()
                continue
            else:
                continue
        else:
            new += 1
            print("Adding artist: " + spotify_id)
            tracking_controller.import_sql(artist)
    if len(evalIds) > 0:
        sql_session.commit()

    sql_session.close()
    return page, updated, found, new
#############################
# V2 API
# ##############################

@https_fn.on_request(memory=512)
def fn_v2_api(req: https_fn.Request) -> https_fn.Response:

    db = firestore.client(app)
    songstats = SongstatsClient(SONGSTATS_API_KEY)
    spotify = get_spotify_client()

    tracking_controller = TrackingController(spotify, songstats, get_sql(), db)
    twilio = TwilioController(get_sql(), spotify)
    youtube = YoutubeClient(YOUTUBE_TOKEN)
    eval_controller = EvalController(spotify, youtube, db, get_sql(), tracking_controller)
    # artist_controller = ArtistController(PROJECT_ID, LOCATION, get_sql())

    v2_api = flask.Flask(__name__)

    @v2_api.errorhandler(Exception)
    def invalid_api_usage(e : Exception):
        print(e)
        if isinstance(e, ErrorResponse):
            print(e.to_json())
            return e.respond()
        traceback.print_exc()
        return flask.jsonify({'error': "An unknown error occurred (500, responding 299 to cancel retry)"}), 299

    @v2_api.post("/debug")
    def debug():
        sql_session = get_sql().get_session()
        records = select(ArtistTag).distinct(ArtistTag.tag_type_id, ArtistTag.tag)
        records = sql_session.scalars(records).all()
        records = list(map(lambda type: type.as_tag_dict(), records))
        sql_session.close()
        return {
            'response': records
        }

    @v2_api.post("/twilio")
    def twilio_endpoint():

        data = flask.request.form.to_dict()
        from_number = data.get('From', None)
        message = data.get('Body', None)

        return twilio.receive_message(db, from_number, message, process_spotify_link) if from_number is not None else {"error": "Malformed request"}

    @v2_api.post("/reimport-artists")
    def reimport_artists():
        if (flask.request.is_json):
            data = flask.request.get_json()
        else:
            data = {}
        total = int(db.collection('artists_v2').count().get()[0][0].value)
        count = data.get('pageSize', 500)
        total_pages = math.ceil(total / count)
        if data.get('page', None) is not None:
            page, updated, found, new = reimport_artists_eval(page = data.get('page', 0), page_size = data.get('pageSize', 250))
            return {
                "page": page,
                "updated": updated,
                "new": new,
                "found": found,
                "total_pages": total_pages,
            }
        task_queue = functions.task_queue("reimportsql")
        target_uri = get_function_url("reimportsql")

        for i in range(total_pages + 1):
            body = {"data": {"page": i, "size": count}}
            task_options = functions.TaskOptions(schedule_time=datetime.now(),
                                                 uri=target_uri)
            task_queue.enqueue(body, task_options)
        return https_fn.Response(status=200, response=f"Enqueued {total_pages + 1} tasks")


    @v2_api.post("/import-artists")
    def import_artists():
        if (flask.request.is_json):
            data = flask.request.get_json()
        else:
            data = {}

        count = int(data.get('size', 50))
        page = int(data.get('page', 0))
        offset = page * count
        total = int(db.collection('artists_v2').count().get()[0][0].value)
        old_artists = db.collection("artists_v2").limit(count).offset(offset).get()



        imported, skipped, avg, fails = tracking_controller.import_sql(old_artists)

        return {
            'totalPages': math.ceil(total / count),
            'page': page,
            'size': count,
            'imported': imported,
            'skipped': skipped,
            'avgTime': avg,
            'errors': fails
        }, 200
        # return 'success'
        # dump_unclean(db)
        # migrate_add_favs_and_tags(db)
        # migrate_from_v1(airtable, spotify, tracking_controller)
        # wipe_collection(db, 'artists_v2')
        # reset_update_as_of(db)
        # aids = spotify.get_playlist_artists('37i9dQZF1E4A2FqXjcsyRn')
        # for a in aids:
        #     tracking_controller.add_artist(a, 'yb11Ujv8JXN9hPzWjcGeRvm9qNl1', '33EkD6zWBJcKcgdS9kIn')
        #
        # return {
        #     "sql": query.compile(compile_kwargs={"literal_binds": True}).string,
        #     "rows": list(map(lambda artist: artist.as_dict(), artists))
        # }

    @v2_api.post("/eval-artist")
    def eval_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

        return eval_controller.evaluate_copyrights(data['spotify_id'])

    @v2_api.post("/eval-artists-lookup")
    def eval_artist_lookup():
        data = flask.request.get_json()
        limit = data.get('limit', 100)
        return eval_controller.find_needs_eval_refresh(limit)

    # @v2_api.post('/import-artists-csv')
    # def import_artists_csv():
    #     df = pandas.read_csv('/Users/qrcf/Downloads/tagged 2.csv')
    #     sql_session = get_sql().get_session()
    #     tags = list()
    #     for index, row in df.iterrows():
    #         tags.append(ArtistTag(
    #             artist_id=row.get('id'),
    #             tag=row.get('genre'),
    #             tag_type_id=1,
    #             organization_id='0dhwhAKcEVTX4kQILMZD',
    #         ))
    #         if len(tags) > 500:
    #             print("Adding tags", len(tags))
    #             sql_session.add_all(tags)
    #             sql_session.commit()
    #             tags.clear()
    #     if len(tags) > 0:
    #         print("Adding tags", len(tags))
    #         sql_session.add_all(tags)
    #         sql_session.commit()
    #         tags.clear()
    #     sql_session.close()
    #     return {}

    # @v2_api.post("/get-artists-csv")
    # def get_artists_csv():
    #     sql_session = get_sql().get_session()
    #     artists_query = artist_joined_query()
    #     artists_query = artists_query.outerjoin(Statistic, Artist.statistics).filter(Statistic.statistic_type_id == 30)
    #     dynamic_eval = aliased(Evaluation)
    #     artists_query = artists_query.outerjoin(dynamic_eval, Artist.evaluation_id == dynamic_eval.id)
    #
    #     artists_query = artists_query.where(or_(dynamic_eval.distributor_type == 0, dynamic_eval.distributor_type == None))
    #     artists = sql_session.scalars(artists_query).unique()
    #     df = pandas.DataFrame(list(map(lambda x: dict({
    #         'id': x.id,
    #         'spotify_id': x.spotify_id,
    #         'name': x.name,
    #         'distributor': x.evaluation.distributor,
    #         'distributor_type': 'Unknown' if x.evaluation is None or x.evaluation.distributor_type is None else 'DIY' if x.evaluation.distributor_type == 0 else 'Major' if x.evaluation.distributor_type == 2 else 'Indie',
    #         'back_catalog': 'Clean' if x.evaluation.back_catalog == 0 else 'Dirty',
    #         'label': x.evaluation.label,
    #         'spotify_listeners': pop_default(list(map(lambda x: x.latest, filter(lambda x: x.statistic_type_id == 30, x.statistics))), 'N/A'),
    #         'spotify_link': pop_default(list(map(lambda x: x.url, filter(lambda x: x.link_source_id == 1, x.links))), 'N/A'),
    #         'soundcloud_link': pop_default(list(map(lambda x: x.url, filter(lambda x: x.link_source_id == 5, x.links))),'N/A'),
    #         'youtube_link': pop_default(list(map(lambda x: x.url, filter(lambda x: x.link_source_id == 4, x.links))),'N/A'),
    #         'insta_link': pop_default(list(map(lambda x: x.url, filter(lambda x: x.link_source_id == 8, x.links))), 'N/A'),
    #         'tags': ''
    #     }), filter(lambda x: x.evaluation is None or ((x.evaluation.distributor_type == 0 or x.evaluation.distributor_type is None) and (x.evaluation.back_catalog == 0 or x.evaluation.back_catalog is None)) ,artists))))
    #     df.to_csv('data.csv', index=False)
    #     return {
    #             "count": len(df.all()),
    #     }

    @v2_api.post("/add-ingest-update-artist")
    def add_ingest_update_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

        return tracking_controller.add_ingest_update_artist(data['spotify_id'], 'yb11Ujv8JXN9hPzWjcGeRvm9qNl1', '33EkD6zWBJcKcgdS9kIn')

    @v2_api.post("/add-artist")
    def add_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

        return tracking_controller.add_artist(data['spotify_id'], 'URTJbErZ7YTCwzSyoXvF4vBd9Xj1', '8AasHpt0Y2CNmogY6TpM')

    @v2_api.post("/ingest-artist")
    def ingest_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)
        
        return tracking_controller.ingest_artist(data['spotify_id'])

    @v2_api.post("/update-artist")
    def update_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)
        
        return tracking_controller.update_artist(data['spotify_id'], datetime.now() - timedelta(days=1))

    with v2_api.request_context(req.environ):
        return v2_api.full_dispatch_request()

##############################
# V1 API 
# ###########################

@https_fn.on_request()
def fn_v1_api(req: https_fn.Request) -> https_fn.Response:
    youtube = YoutubeClient(YOUTUBE_TOKEN)
    airtable = AirtableClient(AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLES)
    spotify = get_spotify_client()

    v1_controller = AirtableV1Controller(airtable, spotify, youtube)
    v1_api = flask.Flask(__name__)

    @v1_api.errorhandler(Exception)
    def invalid_api_usage(e : Exception):
        print(e)
        if isinstance(e, ErrorResponse):
            print(e.to_json())
            return e.respond()
        traceback.print_exc()
        return flask.jsonify({'error': "An unknown error occurred (500, responding 299 to cancel retry)"}), 299

    @v1_api.get("/debug")
    def get_debug():
        record = v1_controller.find_new_evals()[0]
        v1_controller.copyright_eval(record['id'])
        return 'success', 200

    @v1_api.post("/link-spotify")
    def post_link_spotify():
        data = flask.request.get_json()

        if 'record_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'record_id'", 500)
        
        record_id = data['record_id']
        v1_controller.artist_link_spotify(record_id)
        
        return 'Success', 200

    @v1_api.post("/copyright-eval")
    def post_copyright_eval():
        data = flask.request.get_json()

        if 'record_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'record_id'", 500)
        
        record_id = data['record_id']
        v1_controller.copyright_eval(record_id)
        
        return 'Success', 200

    with v1_api.request_context(req.environ):
        return v1_api.full_dispatch_request()
    
#################################
# Cron Job Definitions
#################################

# @scheduler_fn.on_schedule(schedule="*/1 * * * *")
# def fn_v1_cron_job(event: scheduler_fn.ScheduledEvent) -> None:
#   task_controller = TaskController(PROJECT_ID, LOCATION, V1_API_ROOT, V2_API_ROOT)
#   airtable_v1_cron(task_controller, v1_controller)



@scheduler_fn.on_schedule(schedule=f"*/2 * * * *", memory=512)
def fn_v2_update_job(event: scheduler_fn.ScheduledEvent) -> None:
    db = firestore.client(app)
    youtube = YoutubeClient(YOUTUBE_TOKEN)
    songstats = SongstatsClient(SONGSTATS_API_KEY)
    spotify = get_spotify_client()

    tracking_controller = TrackingController(spotify, songstats, get_sql(), db)
    eval_controller = EvalController(spotify, youtube, db, get_sql(), tracking_controller)
    task_controller = TaskController(PROJECT_ID, LOCATION, V1_API_ROOT, V2_API_ROOT)

    # does 300 evals per hours, doesn't care where they are in OB, TODO prios by oldest first so new artists go first
    eval_cron(task_controller, eval_controller, 10)
    # only looks at artists who are ingested, updates 750 stats per hour
    stats_cron(task_controller, tracking_controller, 25)

    # deals with messiness of waiting for songstats to ingest, pulls info and stats for the artist for first time, 1.5k per hr
    onboarding_cron(task_controller, tracking_controller, 50)


#################################
# App Function Definitions
#################################
def add_artist(uid, spotify_url = None, identifier = False, tags = None, preview = False):
    db = firestore.client(app)
    songstats = SongstatsClient(SONGSTATS_API_KEY)
    spotify = get_spotify_client()
    tracking_controller = TrackingController(spotify, songstats, get_sql(), db)
    if identifier:

        user_data = get_user(uid, db)
        if tags is not None:
            tracking_controller.set_tags(user_data['organization'], identifier, tags)

        return {'message': 'success', 'status': 200}

    # Message text passed from the client.

    return process_spotify_link(uid, spotify_url, tags, preview)



def sort_ordered(l):
    return l.get('order', 0)

def load_link_sources():
    sql_session = get_sql().get_session()
    sources = sql_session.scalars(select(LinkSource)).all()
    list_sorted_sources = list((source.as_dict() for source in sources))
    sql_session.close()
    list_sorted_sources.sort(key=sort_ordered)
    return list_sorted_sources

def load_stat_types():
    sql_session = get_sql().get_session()
    types = sql_session.scalars(select(StatisticType)).all()
    list_sorted = list((stat_type.as_dict() for stat_type in types))
    sql_session.close()
    list_sorted.sort(key=sort_ordered)
    return list_sorted

def load_users(organization_id):
    db = firestore.client(app)
    users = db.collection('users').where(filter=FieldFilter('organization', '==', organization_id)).get()
    return ({
        "id": user.id,
        "first_name": user.get('first_name'),
        "last_name": user.get('last_name')
    } for user in users)

def user_from_request(request: https_fn.Request) -> None|UserRecord:
    auth_header = request.headers.get('Authorization', "")
    auth_token = auth_header.split("Bearer ")
    id_token = auth_token[1] if len(auth_token) > 1 else None
    try:
        decoded_token = auth.verify_id_token(id_token)
        user_id = decoded_token['uid']
        # Access user data
        return auth.get_user(user_id)
    except ValueError as e:
        return None

@https_fn.on_request(min_instances=2, memory=MemoryOption.MB_512, cors=options.CorsOptions(
        cors_origins="*",
            cors_methods=["get", "post", "options"]))
def fn_v3_api(request: https_fn.Request) -> https_fn.Response:
    user = user_from_request(request)
    v3_api = flask.Flask(__name__)

    if user is None:
        return 'Unauthorized', 401

    @v3_api.get('/get-type-defs')
    def get_type_definitions_request():
        response = jsonify(get_type_definitions())
        response.headers.add('Cache-Control', 'public, max-age=600')
        return response

    @v3_api.get('/get-existing-tags')
    def get_existing_tags_request():
        response = jsonify(get_existing_tags(user))
        response.headers.add('Cache-Control', 'public, max-age=60')
        response.headers.add('X-Organization', request.headers.get('X-Organization'))
        response.headers.add('Vary', 'X-Organization')
        return response

    @v3_api.get('/artists')
    def get_artists_request():
        artists_controller = ArtistController(PROJECT_ID, LOCATION, get_sql())
        args = request.args.to_dict()
        filterModel = json.loads(args.get('filterModel', None)) if args.get('filterModel', None) else None
        if filterModel is not None:
            args['filterModel'] = filterModel
        sortModel = json.loads(args.get('sortModel', None)) if args.get('sortModel', None) else None
        if sortModel is not None:
            args['sortModel'] = sortModel
        artists = artists_controller.get_artists(user.uid, args, app)
        response = jsonify(artists )
        if artists.get('error', None) is not None:
            response.status_code = 500
        else:
            response.headers.add('Cache-Control', 'public, max-age=30')
        response.headers.add('X-Organization', request.headers.get('X-Organization'))
        response.headers.add('Vary', 'X-Organization')
        return response

    @v3_api.post('/add-artist')
    def add_artist_request():
        data = flask.request.get_json()
        return add_artist(user.uid, data.get('spotify_url', None), data.get('id', False), data.get('tags', None), data.get('preview', False))


    @v3_api.post('/sms')
    def sms_setup():
        db = firestore.client(app)
        uid = user.uid
        spotify = get_spotify_client()
        data = flask.request.get_json()
        twilio = TwilioController(get_sql(), spotify)
        code = data.get('code', None)
        if code is not None:
            success, status = twilio.verify_code(uid, db, data.get('number'), code)
            return {
                "success": success,
                "reason": status
            }
        else:
            return {
                "id": twilio.send_code(uid, db, data.get('number'))
            }

    with v3_api.request_context(request.environ):
        return v3_api.full_dispatch_request()

def get_type_definitions():
    global stat_types, link_sources
    print("get type defs")
    if link_sources is None:
        print("load link defs")
        link_sources = load_link_sources()
    if stat_types is None:
        print("load stat type")
        stat_types = load_stat_types()
    return {
        "statistic_types": stat_types,
        "link_sources": link_sources,
        "tag_types": get_tag_types()
    }

def get_existing_tags(user):
    db = firestore.client(app)
    if user is None:
        return {
            "tags": [],
            "users": []
        }
    uid = user.uid
    user_data = get_user(uid, db)
    sql_session = get_sql().get_session()
    records = select(ArtistTag).distinct(ArtistTag.tag_type_id, ArtistTag.tag).filter(or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None))
    records = sql_session.scalars(records).all()
    records = (tag_type.as_tag_dict() for tag_type in records)
    sql_session.close()
    return {
        "tags": list(records),
        "users": list(load_users(user_data.get('organization')))
    }

def get_spotify_client():
    global spotify_client
    if spotify_client is None:
        spotify_client = SpotifyClient()

    return spotify_client

def process_spotify_link(uid, spotify_url, tags = None, preview = False ):
    spotify = get_spotify_client()
    try:
        db = firestore.client(app)
        songstats = SongstatsClient(SONGSTATS_API_KEY)

        tracking_controller = TrackingController(spotify, songstats, get_sql(), db)

        spotify_id = spotify.url_to_id(spotify_url)
        if spotify_id == 'invalid':
            spotify_id = spotify.url_to_id(spotify_url, 'playlist')
            if spotify_id == 'invalid':
                return {'message': 'Invalid URL, try copy pasting an artist or playlist URL from Spotify directly.',
                        'status': 400, 'added_count': 0}
            else:
                user_data = get_user(uid, db)
                try:
                    aids, playlist_name, playlist_picture = spotify.get_playlist_artists(spotify_id)
                    sql_session = get_sql().get_session()
                    sql_playlist = sql_session.scalars(
                        select(Playlist).where(Playlist.spotify_id == spotify_id).where(Playlist.organization_id == user_data.get('organization'))).first()
                    if preview:
                        return {
                            "found": True,
                            "type": "playlist",
                            "name": playlist_name,
                            "avatar": playlist_picture,
                            "url": spotify_url.split('?')[0],
                            "existing": sql_playlist.id if sql_playlist else None,
                            "existing_created_at": sql_playlist.created_at if sql_playlist else None,
                        }

                    if sql_playlist is None:
                        sql_playlist = Playlist(
                            spotify_id=spotify_id,
                            name=playlist_name,
                            organization_id=user_data.get('organization'),
                        )
                        sql_session.add(sql_playlist)
                        sql_session.commit()
                        sql_session.refresh(sql_playlist)
                    sql_session.close()

                    for a in aids:
                        task_queue = functions.task_queue("addartisttask")
                        target_uri = get_function_url("addartisttask")
                        body = {"data": {"spotify_id": a, "uid": uid, "playlist_id": sql_playlist.id, "tags": tags}}
                        task_options = functions.TaskOptions(schedule_time=datetime.now(), uri=target_uri)
                        task_queue.enqueue(body, task_options)
                    return {'message': 'sucess', 'status': 200, 'added_count': len(aids)}
                except Exception as e:
                    print(e)

                    if preview:
                        return {
                            "found": False,
                            "spotify_id": spotify_id,
                            "url": spotify_url.split('?')[0],
                            "error": e
                        }
                    return {
                        'message': 'failed', 'status': 500, 'error': traceback.format_exc()
                    }
        else:
            user_data = get_user(uid, db)
            if preview:
                try:
                    sql_session = get_sql().get_session()
                    artist = spotify.get_artist(spotify_id, True)
                    image = None
                    if len(artist.get('images', list())) > 0:
                        image = artist.get('images')[0]['url']

                    artist_query = (select(Artist)
                        .options(
                            joinedload(Artist.organizations, innerjoin=True),
                        )
                        .where(Artist.spotify_id == spotify_id)
                        .where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
                    artist_existing = sql_session.scalars(artist_query).unique().first()
                    org = None
                    if artist_existing is not None:
                        org = list(filter(lambda x: x.organization_id == user_data.get('organization'), artist_existing.organizations)).pop()
                    sql_session.close()

                    return {
                        "found": True,
                        "type": "artist",
                        "name": artist['name'],
                        "avatar": image,
                        "url": spotify_url.split('?')[0],
                        "existing": artist_existing.id if artist_existing else None,
                        "existing_created_at": org.created_at if org else None,
                    }
                except Exception as e:
                    print('Exception from link proc', e)
                    return {
                        "found": False,
                        "url": spotify_url.split('?')[0],
                        "error": e,
                        "spotify_id": spotify_id,

                    }

            msg, status = tracking_controller.add_ingest_update_artist(spotify_id, uid, user_data['organization'], tags)
            return {'message': msg, 'status': status, 'added_count': 1}
    except ErrorResponse as e:
        print("error response from link proc", e)
        if preview:
            return {
                "found": False
            }

        raise e