import math
from array import array

from firebase_admin import initialize_app, firestore, functions
from firebase_functions import https_fn, scheduler_fn, tasks_fn, params, logger, options
from firebase_functions.options import RetryConfig, RateLimits, MemoryOption
from flask import jsonify
from google.cloud.firestore_v1 import FieldFilter
from openai import organization
from sqlalchemy import select, update, or_
from sqlalchemy.orm import joinedload, subqueryload

from controllers.artists import ArtistController
from cron_jobs import airtable_v1_cron, eval_cron, stats_cron, onboarding_cron
from lib.utils import get_function_url
from tmp_keys import *
from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, ArtistLink, OrganizationArtist, Evaluation, StatisticType, Statistic, UserArtist, \
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

spotify = SpotifyClient(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
spotify.authorize()
airtable = AirtableClient(AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLES)
youtube = YoutubeClient(YOUTUBE_TOKEN)
songstats = SongstatsClient(SONGSTATS_API_KEY)
sql = CloudSQLClient(PROJECT_ID, LOCATION, SQL_INSTANCE, SQL_USER, SQL_PASSWORD, SQL_DB)
artists = ArtistController(PROJECT_ID, LOCATION, sql)

stat_types = None
link_sources = None

tag_types = dict({
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

@tasks_fn.on_task_dispatched(retry_config=RetryConfig(max_attempts=5, min_backoff_seconds=60), memory=MemoryOption.MB_512)
def reimportsql(req: tasks_fn.CallableRequest) -> str:

    count = int(req.data.get('size', 50))
    page = int(req.data.get('page', 0))

    page, updated, found, new = reimport_artists_eval(page, count)
    print("Page: " + str(page) + " Found: " + str(found) + " Updated: " + str(updated) + " new: " + str(new))
    return "Page: " + str(page) + " Found: " + str(found) + " Updated: " + str(updated) + " new: " + str(new)

def reimport_artists_eval(page = 0, page_size = 50):
    db = firestore.client(app)
    tracking_controller = TrackingController(spotify, songstats, sql, db)
    offset = page * page_size
    old_artists = db.collection("artists_v2").limit(page_size).offset(offset).get()
    spotifys = list(map(lambda x: x.get('spotify_id'), old_artists))

    sql_session = sql.get_session()
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
    tracking_controller = TrackingController(spotify, songstats, sql, db)
    eval_controller = EvalController(spotify, youtube, db, sql, tracking_controller)
    artist_controller = ArtistController(PROJECT_ID, LOCATION, sql)

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
        if (flask.request.is_json):
            data = flask.request.get_json()
        else:
            data = {}
        spotify_id = spotify.url_to_id(data.get('spotify_url'), 'playlist')
        if spotify_id == 'invalid':
            return {'message': 'Invalid URL, try copy pasting an artist or playlist URL from Spotify directly.',
                    'status': 400, 'added_count': 0}
        else:
            aids, name = spotify.get_playlist_artists(spotify_id)
            return {'message': 'sucess', 'status': 200, 'added': name}

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
        return tracking_controller.find_needs_ob_ingest(limit)

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
    tracking_controller = TrackingController(spotify, songstats, sql, db)
    eval_controller = EvalController(spotify, youtube, db, sql, tracking_controller)
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

@https_fn.on_call()
def add_artist(req: https_fn.CallableRequest):
    db = firestore.client(app)
    tracking_controller = TrackingController(spotify, songstats, sql, db)
    preview = req.data.get('preview', False)
    # Message text passed from the client.
    try:
        spotify_url = req.data["spotify_url"]
        spotify_id = spotify.url_to_id(spotify_url)
        if spotify_id == 'invalid':
            spotify_id = spotify.url_to_id(spotify_url, 'playlist')
            if spotify_id == 'invalid':
                return {'message': 'Invalid URL, try copy pasting an artist or playlist URL from Spotify directly.', 'status': 400, 'added_count': 0}
            else:
                uid = req.auth.uid
                user_data = get_user(uid, db)
                try:
                    aids, playlist_name = spotify.get_playlist_artists(spotify_id)

                    sql_session = sql.get_session()
                    sql_playlist = sql_session.scalars(select(Playlist).where(Playlist.spotify_id == spotify_id)).first()
                    if sql_playlist is None:
                        sql_playlist = Playlist(
                            spotify_id=spotify_id,
                            name=playlist_name,
                        )
                        sql_session.add(sql_playlist)
                        sql_session.commit()
                        sql_session.refresh(sql_playlist)
                    sql_session.close()

                    for a in aids:
                        tracking_controller.add_artist(a, uid, user_data['organization'], sql_playlist.id)
                    return {'message': 'sucess', 'status': 200, 'added_count': len(aids)}
                except Exception as e:
                    print(e)
                    return {
                        'message': 'failed', 'status': 500, 'error': traceback.format_exc()
                    }
        else:
            uid = req.auth.uid
            user_data = get_user(uid, db)
            msg, status = tracking_controller.add_ingest_update_artist(spotify_id, uid, user_data['organization'])
            return {'message': msg, 'status': status, 'added_count': 1}
    except ErrorResponse as e:
        raise e.to_https_fn_error()


def sort_ordered(l):
    return l.get('order', 0)

def load_link_sources():
    sql_session = sql.get_session()
    sources = sql_session.scalars(select(LinkSource)).all()
    list_sorted_sources = list(map(lambda type: type.as_dict(), sources))
    sql_session.close()
    list_sorted_sources.sort(key=sort_ordered)
    return list_sorted_sources

def load_stat_types():
    sql_session = sql.get_session()
    types = sql_session.scalars(select(StatisticType)).all()
    list_sorted = list(map(lambda type: type.as_dict(), types))
    sql_session.close()
    list_sorted.sort(key=sort_ordered)
    return list_sorted

def load_users(organization_id):
    db = firestore.client(app)
    users = db.collection('users').where(filter=FieldFilter('organization', '==', organization_id)).get()
    return list(map(lambda user: {
        "id": user.id,
        "first_name": user.get('first_name'),
        "last_name": user.get('last_name')
    }, users))


@https_fn.on_call(min_instances=1)
def get_type_definitions(req: https_fn.CallableRequest):
    global stat_types, link_sources
    if link_sources is None:
        link_sources = load_link_sources()
    if stat_types is None:
        stat_types = load_stat_types()
    return {
        "statistic_types": stat_types,
        "link_sources": link_sources,
        "tag_types": tag_types
    }

@https_fn.on_call(min_instances=1)
def get_existing_tags(req: https_fn.CallableRequest):
    db = firestore.client(app)
    uid = req.auth.uid
    user_data = get_user(uid, db)
    sql_session = sql.get_session()
    records = select(ArtistTag).distinct(ArtistTag.tag_type_id, ArtistTag.tag).filter(or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None))
    records = sql_session.scalars(records).all()
    records = list(map(lambda type: type.as_tag_dict(), records))
    sql_session.close()
    return {
        "tags": records,
        "users": load_users(user_data.get('organization'))
    }


@https_fn.on_call(min_instances=1,cors=options.CorsOptions(
        cors_origins="*",
            cors_methods=["get", "post", "options"]))
def get_artists(req: https_fn.CallableRequest):
    return artists.get_artists(req.auth.uid, req.data, app)
