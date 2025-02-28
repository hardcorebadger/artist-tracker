import json

import math

from firebase_admin import initialize_app, firestore, functions, auth, credentials
from firebase_admin.auth import UserRecord, UserNotFoundError, ExpiredIdTokenError, InvalidIdTokenError
from firebase_functions import https_fn, scheduler_fn, tasks_fn, options
from firebase_functions.options import RetryConfig, MemoryOption
from flask import jsonify
from google.cloud.firestore_v1 import FieldFilter, Or
from openai import organization
from sqlalchemy import select, or_, update, text, and_
from sqlalchemy.orm import joinedload, close_all_sessions
from sqlalchemy.util.preloaded import sql_dml

from controllers.artists import ArtistController
from controllers.playlists import PlaylistController
from controllers.twilio import TwilioController
from cron_jobs import eval_cron, stats_cron, onboarding_cron, spotify_cron
from lib.stripe_client import StripeController
from lib.utils import get_function_url
from lib.config import *
from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, OrganizationArtist, StatisticType, \
    ArtistTag, Playlist, Subscription, pop_default, Attribution, Import, ImportArtist, Statistic, ArtistLink, Lookalike
from controllers import AirtableV1Controller, TaskController, TrackingController, EvalController, LookalikeController
import flask
from datetime import datetime, timedelta
import traceback
from firebase_functions.params import IntParam, StringParam

# MIN_INSTANCES = IntParam("HELLO_WORLD_MIN_INSTANCES")

# from local_scripts import dump_unclean

#################################
# App Initialization
#################################
app = initialize_app()

#################################
# Globals
#################################

# spotify_client = None
stat_types = None
link_sources = None
# twilio_client = None
youtube_client = None
# task_controller = None


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

sql = CloudSQLClient(PROJECT_ID, LOCATION, SQL_INSTANCE, SQL_USER, SQL_PASSWORD, SQL_DB)
songstats = SongstatsClient(SONGSTATS_API_KEY)

@tasks_fn.on_task_dispatched(retry_config=RetryConfig(max_attempts=5, max_backoff_seconds=60), memory=MemoryOption.MB_512)
def addartisttask(req: tasks_fn.CallableRequest) -> str:
    db = firestore.client(app)
    spotify = get_spotify_client()
    twilio = get_twilio_client()
    tracking_controller = TrackingController(spotify, songstats, db, twilio)
    uid = req.data.get('uid')
    spotify_id = req.data.get('spotify_id')
    playlist_id = req.data.get('playlist_id', None)
    import_id = req.data.get('import_id', None)
    user_data = get_user(uid, db)

    organization_id = req.data.get('organization', user_data['organization_id'] if 'organization_id' in user_data else None)
    tags = req.data.get('tags', None)
    sql_session = sql.get_session()
    message, code = tracking_controller.add_artist(sql_session, spotify_id, uid, organization_id, playlist_id, tags, import_id)
    sql_session.close()
    return message

@tasks_fn.on_task_dispatched(retry_config=RetryConfig(max_attempts=5, max_backoff_seconds=60), memory=MemoryOption.MB_512)
def lookaliketask(req: tasks_fn.CallableRequest) -> str:
    db = firestore.client(app)
    lookalike_id = req.data.get('lookalike_id')
    sql_session = sql.get_session()
    lookalike_controller = LookalikeController(get_spotify_client(), songstats, get_youtube_client(), sql_session, db)

    import_obj = sql_session.query(Import).options(joinedload(Import.lookalike)).filter(Import.lookalike_id == lookalike_id).first()
    lookalike = import_obj.lookalike
    
    if (lookalike.status > 0):
        return "Already processed"
    
    # Set status to 1 to indicate task has started
    lookalike.status = 1
    sql_session.add(lookalike)
    sql_session.commit()

    try:
        result = lookalike_controller.mine_lookalikes(lookalike.target_artist_id)
        
        # Extract all spotify IDs for bulk lookup
        spotify_ids = [item['spotify_id'] for item in result['queue'] if "spotify_id" in item]
        
        # Find existing artists to get their IDs
        existing_artists = {}
        if spotify_ids:
            artists = sql_session.query(Artist).filter(Artist.spotify_id.in_(spotify_ids)).all()
            for artist in artists:
                existing_artists[artist.spotify_id] = artist.id
        
        # Prepare data for bulk insert
        import_artist_mappings = []
        for queueable in result['queue']:
            mapping = {
                'import_id': import_obj.id,
                'artist_id': None,
                'spotify_id': queueable['spotify_id'],
                'name': queueable['name'],
                'track_spotify_id': queueable['track_id'] if "track_id" in queueable else None,
                'track_data': { "name": queueable['track_name'] if "track_name" in queueable else None},
                'status': 0
            }
            
            # If the artist already exists in the database, set the artist_id
            if queueable['spotify_id'] in existing_artists:
                mapping['artist_id'] = existing_artists[queueable['spotify_id']]
            
            import_artist_mappings.append(mapping)
        
        # Perform chunked bulk insert operations
        chunk_size = 1000  # Adjust based on your database's capabilities
        total_inserted = 0
        
        for i in range(0, len(import_artist_mappings), chunk_size):
            chunk = import_artist_mappings[i:i + chunk_size]
            if chunk:
                sql_session.bulk_insert_mappings(ImportArtist, chunk)
                total_inserted += len(chunk)
        sql_session.commit()
        
        # If auto_add is enabled, queue artist add tasks
        if lookalike.auto_add:
            queue_artist_add_tasks(
                spotify_ids=spotify_ids,
                user_id=import_obj.user_id,
                import_id=import_obj.id,
                organization_id=import_obj.organization_id
            )
        
        # Update lookalike status to complete (3)
        lookalike.status = 3
        sql_session.add(lookalike)
        sql_session.commit()
        
        message = f"Successfully processed {total_inserted} lookalike artists using chunked bulk inserts"
    except Exception as e:
        # Update lookalike status to failed (2)
        print(f"Failed to process lookalike artists: {str(e)}")
        print(traceback.format_exc())
        lookalike.status = 2
        sql_session.add(lookalike)
        sql_session.commit()
        message = f"Failed to process lookalike artists: {str(e)}"
    finally: 
        sql_session.close()
    print(message)
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
    spotify = get_spotify_client()

    tracking_controller = TrackingController(spotify, songstats, db)
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
            tracking_controller.import_sql(sql_session, artist)
    if len(evalIds) > 0:
        sql_session.commit()

    sql_session.close()
    return page, updated, found, new


def bulk_update(sql_session, ids: list, set: str):
    list_str = ', '.join("'" + str(item) + "'" for item in ids)
    sql_query = text('UPDATE artists SET '+set+' WHERE artists.id IN (' + list_str + ')')
    sql_session.execute(sql_query)
    sql_session.commit()

def get_stripe():
    return StripeController(STRIPE_KEY, STRIPE_WEBHOOK_SECRET)


#############################
# V2 API
# ##############################

@https_fn.on_request(memory=512)
def fn_v2_api(req: https_fn.Request) -> https_fn.Response:
    sql_session = sql.get_session()
    db = firestore.client(app)
    spotify = get_spotify_client()
    twilio = get_twilio_client()
    youtube = get_youtube_client()
    tracking_controller = TrackingController(spotify, songstats, db, twilio)

    eval_controller = EvalController(spotify, youtube, db, tracking_controller)
    lookalike_controller = LookalikeController(spotify, songstats, youtube, sql_session, db)
    # artist_controller = ArtistController(PROJECT_ID, LOCATION, sql)

    v2_api = flask.Flask(__name__)

    @v2_api.errorhandler(Exception)
    def invalid_api_usage(e : Exception):
        print(str(e))
        if isinstance(e, ErrorResponse):
            print(str(e.to_json()))
            return e.respond()
        traceback.print_exc()
        return flask.jsonify({'error': "An unknown error occurred (500, responding 299 to cancel retry)"}), 299

    @v2_api.post("/stripe")
    def stripe_route():
        return get_stripe().webhook(flask.request, sql_session)

    @v2_api.post("/debug")
    def debug():
        res = lookalike_controller.mine_lookalikes('16a7d3eb-16c6-4e64-a4ec-5ed6bde80315')
        print(res)
        # data = flask.request.get_json()
        # users = db.collection("users").get()
        # for user in users:
        #     print(user.id + " " + user.get('first_name'))
        #     user_dict = user.to_dict()
        #     user_org = user_dict.get('organization')
        #     if user_org is not None:
        #         if user_dict.get('organization_id') != user_org:
        #             user.reference.update({'organization_id': user_org})
            # else:
                # user.reference.update({'organizations':[]})
        # for org in user_orgs.keys():
        #     print(org + " " + str(len(user_orgs[org])))
        #     for user in user_orgs[org]:
        #         print("   " + user.get('first_name'))
        return "Yay"
        # return get_artists_controller().get_artists('q9HMKTU1S7hUlpNdtBB5braS1VJ3', {"filterModel": {"items": [], "muted": 'hide'}}, app, sql_session, True)

        # for org in organizations:
        #     if org.id == '0dhwhAKcEVTX4kQILMZD':
        #         continue
        #     attributions = sql_session.execute(text('SELECT DISTINCT(attribution.user_id) FROM attribution WHERE attribution.organization_id = \'' + org.id+'\''))
        #     real_users = load_users(org.id)
        #     final_ids = []
        #     for user in real_users:
        #         if user.get('id') not in final_ids:
        #             final_ids.append(user.get('id'))
        #     for attribution in attributions:
        #         if attribution.user_id not in final_ids:
        #             final_ids.append(attribution.user_id)
        #     print(org.id, org.get('name'), final_ids)
        #     newUsers = {}
        #     for id in final_ids:
        #         newUsers[id] = {
        #             "active": True,
        #             "admin": False
        #         }
        #     org.reference.update({
        #         "users": newUsers
        #     })
        return "", 200
        # playlists = sql_session.query(Playlist).options(joinedload(Playlist.imports)).all()
        # generate imports from attrib
        # for playlist in playlists:
        #     if len(playlist.imports) == 0:
        #         attrs = sql_session.query(Attribution).options(joinedload(Attribution.artist)).filter(Attribution.playlist_id == playlist.id).all()
        #         import_artists = []
        #         for attr in attrs:
        #             import_artists.append(ImportArtist(
        #                 spotify_id=attr.artist.spotify_id,
        #                 artist_id=attr.artist.id,
        #                 status=2,
        #                 created_at=attr.created_at,
        #                 updated_at=attr.created_at,
        #
        #             ))
        #         playlist.imports.append(
        #             Import(
        #                 organization_id=playlist.organization_id,
        #                 playlist_id=playlist.id,
        #                 status="complete",
        #                 user_id=playlist.first_user,
        #                 completed_at=playlist.updated_at,
        #                 created_at=playlist.created_at,
        #                 updated_at=playlist.updated_at,
        #                 artists=import_artists,
        #             )
        #         )
        #         sql_session.add(playlist)
        #         sql_session.commit()
        #         print("Done with playlist: "+  str(playlist.id))
        #     # user = sql_session.query(Attribution).order_by(Attribution.id.desc()).filter(Attribution.playlist_id == playlist.id).first()
        #     # if user is None:
        #     #     print ("??? " + str(playlist.id) + " has no attribution")
        #     #     continue
        #     # playlist.first_user = user.user_id
        #     # playlist.last_user = user.user_id

        # return "",200
        # artists_controller = ArtistController(PROJECT_ID, LOCATION, sql)
        # return artists_controller.queues(sql_session, app, 'q9HMKTU1S7hUlpNdtBB5braS1VJ3')
        # return "artists"
        # return json.dumps(body).encode()
        # return spotify.get_playlist('3WxQaPZsG56Tl6Wrllkqas')
        # return lookalike_controller.mine_lookalikes('94b2e9a9-b2e7-4750-8be0-9c3432991a4f')
        #https://open.spotify.com/artist/7rRz5zPounzREHN0cIrYhS?si=f7dcf5b7322346bb
        #https://open.spotify.com/artist/0PxzGnCYBpSuaI49OR94cA?si=68189be134ec4688
        #https://open.spotify.com/playlist/3WxQaPZsG56Tl6Wrllkqas?si=85dee54659ef43ef
        # return twilio.receive_message(db, '+19493385918', 'https://open.spotify.com/artist/1UKNeJ3wk2fCZEi0Bzb30O?si=86bfc38017b04740', process_spotify_link, sql_session)


        # spotify = get_spotify_client()
        # return tracking_controller.find_needs_stats_refresh(sql_session, 10)
        # return eval_controller.evaluate_copyrights('7uelPzv7TB20x3wtDt95E9', sql_session, None)
        # return spotify.get_artist('55ZKRn4w3oNhBMV7sgG1PP')

    @v2_api.post("/twilio")
    def twilio_endpoint():
        data = flask.request.form.to_dict()
        from_number = data.get('From', None)
        message = data.get('Body', None)
        print("Received twilio message: " + message)

        return twilio.receive_message(db, from_number, message, process_spotify_link, sql_session) if from_number is not None else {"error": "Malformed request"}

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



        imported, skipped, avg, fails = tracking_controller.import_sql(sql_session, old_artists)

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
    @v2_api.post("/spotify-cache")
    def spotify_cache():
        data = flask.request.get_json()
        if 'artist_ids' not in data :
            raise ErrorResponse("Invalid payload. Must include 'artist_ids' ", 500)
        if len(data['artist_ids']) == 0:
            return 'Cached 0 artists', 200
        artists_data = list(sql_session.scalars(select(Artist).filter(Artist.id.in_(data['artist_ids']))).unique())
        spotify_ids = list(map(lambda a: a.spotify_id, artists_data))
        spotify_id_to_artist_id = {}

        for artist in artists_data:
            spotify_id_to_artist_id[artist.spotify_id] = artist.id
        artists = get_spotify_client().get_cached(spotify_ids, 'artist', timedelta(days=1))
        artist_ids_to_update = []
        for artist in artists:
            artist_ids_to_update.append(str(spotify_id_to_artist_id[artist['id']]))

        if (len(artist_ids_to_update) > 0):
            bulk_update(sql_session, artist_ids_to_update, 'spotify_cached_at = NOW(), spotify_queued_at = NULL')
        return 'Cached ' + str(len(artists)) + " artist(s)", 200

    @v2_api.post("/spotify-cache-ids")
    def spotify_cache_ids():
        data = flask.request.get_json()
        if 'spotify_ids' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_ids' ", 500)
        if len(data['spotify_ids']) == 0:
            return 'Cached 0 artists', 200
        spotify_ids = data['spotify_ids']

        artists = get_spotify_client().get_cached(spotify_ids, 'artist', timedelta(days=1))

        return 'Cached ' + str(len(artists)) + " artist(s)", 200

    @v2_api.post("/eval-artist")
    def eval_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data and 'id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id' or 'id'", 500)

        return eval_controller.evaluate_copyrights(spotify_id=data['spotify_id'] if 'spotify_id' in data else None, sql_session=sql_session, artist_id=data['id'] if 'id' in data else None)

    @v2_api.post("/eval-artists-lookup")
    def eval_artist_lookup():
        data = flask.request.get_json()
        limit = data.get('limit', 100)
        return eval_controller.find_needs_eval_refresh(sql_session, limit)

    # @v2_api.post('/import-artists-csv')
    # def import_artists_csv():
    #     df = pandas.read_csv('/Users/qrcf/Downloads/tagged 2.csv')
    #     sql_session = sql.get_session()
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
    #     sql_session = sql.get_session()
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
        print('spotify_id', str(data['spotify_id']))

        return tracking_controller.add_ingest_update_artist(sql_session, data['spotify_id'], 'yb11Ujv8JXN9hPzWjcGeRvm9qNl1', '33EkD6zWBJcKcgdS9kIn')

    @v2_api.post("/add-artist")
    def add_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

        return tracking_controller.add_artist(sql_session, data['spotify_id'], 'URTJbErZ7YTCwzSyoXvF4vBd9Xj1', '8AasHpt0Y2CNmogY6TpM')

    @v2_api.post("/ingest-artist")
    def ingest_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)
        print('spotify_id', str(data['spotify_id']))
        return tracking_controller.ingest_artist(sql_session, data['spotify_id'])

    @v2_api.post("/update-artist")
    def update_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data and 'id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id' or 'id'", 500)

        spotify_id = data['spotify_id'] if 'spotify_id' in data else None
        artist_id = data['id'] if 'id' in data else None
        print('spotify_id/artist_id',str(spotify_id),str(artist_id))
        return tracking_controller.update_artist(sql_session, spotify_id, artist_id, datetime.now() - timedelta(days=1))

    # @v2_api.errorhandler(500)
    # def internal_server_error(error):
    #     return flask.Response(json.dumps({'error': error.description}), error.status_code, error.mimetype)
    @v2_api.after_request
    def after_request(response):
        # Code to run after each request
        sql_session.close()

        return response

    with v2_api.request_context(req.environ):
        resp = v2_api.full_dispatch_request()
        sql_session.close()
        return resp
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
    youtube = get_youtube_client()
    spotify = get_spotify_client()
    twilio = get_twilio_client()
    tracking_controller = TrackingController(spotify, songstats, db, twilio)
    eval_controller = EvalController(spotify, youtube, db, tracking_controller)
    task_controller = get_task_controller()
    sql_session = sql.get_session()

    try:
        spotify_cron(sql_session, task_controller, eval_controller, bulk_update)

        # does 300 evals per hours, doesn't care where they are in OB, TODO prios by oldest first so new artists go first
        eval_cron(sql_session, task_controller, eval_controller, 10, bulk_update)

        # deals with messiness of waiting for songstats to ingest, pulls info and stats for the artist for first time, 1.5k per hr
        onboarding_cron(sql_session, task_controller, tracking_controller, 50)
        # only looks at artists who are ingested, updates 750 stats per hour
        stats_cron(sql_session, task_controller, tracking_controller, 25, bulk_update)

    except Exception as e:
        print(str(e))
        print(traceback.format_exc())
        sql_session.close()

    sql_session.close()

#################################
# App Function Definitions
#################################
def add_artist(sql_session, uid, spotify_url = None, identifier = False, tags = None, preview = False):
    db = firestore.client(app)
    songstats = SongstatsClient(SONGSTATS_API_KEY)
    spotify = get_spotify_client()
    tracking_controller = TrackingController(spotify, songstats, db)
    print(uid, identifier, spotify_url, str(tags), preview)
    if identifier:

        user_data = get_user(uid, db)
        if tags is not None:
            tracking_controller.set_tags(sql_session, user_data['organization'], identifier, tags)

        return {'message': 'success', 'status': 200}

    # Message text passed from the client.
    try:
        return process_spotify_link(sql_session, uid, spotify_url, tags, preview)
    except Exception as e:
        print(str(e))
        return {
            "found": False,
            "error": e
        }


def sort_ordered(l):
    return l.get('order', 0)

def load_link_sources(sql_session):
    sources = sql_session.scalars(select(LinkSource)).all()
    list_sorted_sources = list((source.as_dict() for source in sources))
    list_sorted_sources.sort(key=sort_ordered)
    return list_sorted_sources

def load_stat_types(sql_session):
    types = sql_session.scalars(select(StatisticType)).all()
    list_sorted = list((stat_type.as_dict() for stat_type in types))
    list_sorted.sort(key=sort_ordered)
    return list_sorted

def load_users(organization_id):
    db = firestore.client(app)
    users_ref = db.collection("users").where(
        filter=Or(
            [
                FieldFilter("organizations", "array_contains", organization_id),
                FieldFilter("organization",  "==", organization_id),
                FieldFilter("admin", "==", True),
            ]
        )
    )

    users = []
    docs = users_ref.limit(10).stream()  # Fetch the first batch of documents
    while True:
        chunk = list(docs)
        users.extend(chunk)  # Extend the users list with the current batch
        if len(chunk) < 10:  # If fewer than 100 results, we've reached the end
            break

        # Fetch the next batch using the last document as a cursor
        last_document = chunk[-1]
        docs = users_ref.start_after(last_document).limit(10).stream()
    return [
        {
            "id": user.id,
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "admin": user.get("admin") if "admin" in user.to_dict() else False,
        }
        for user in users
    ]

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
    except ExpiredIdTokenError as e:
        return None
    except UserNotFoundError as e:
        return None
    except InvalidIdTokenError as e:
        return None

@https_fn.on_request(min_instances=2, memory=MemoryOption.MB_512, cors=options.CorsOptions(
        cors_origins="*",
            cors_methods=["get", "post", "options"]))
def fn_v3_api(request: https_fn.Request) -> https_fn.Response:
    user = user_from_request(request)
    v3_api = flask.Flask(__name__)
    sql_session = sql.get_session()
    if user is None:
        return '{"status": 401}', 401
    playlist_controller = PlaylistController(sql_session)

    print(request.path)
    @v3_api.get('/get-type-defs')
    def get_type_definitions_request():
        response = jsonify(get_type_definitions(sql_session))
        response.headers.add('Cache-Control', 'public, max-age=600')
        return response

    @v3_api.post('/checkout')
    def checkout_request():
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        stripe = get_stripe()
        existing = sql_session.scalars(select(Subscription).where(Subscription.organization_id == user_data['organization']).where(Subscription.status != 'cancelled').order_by(Subscription.created_at.desc())).first()
        if existing:
            if existing.status == 'active':
                return {
                    'subscription': existing.as_dict()
                }, 400
            elif existing.status == 'open':
                try:
                    stripe.cancel_checkout(existing.checkout_id)
                    existing.status = 'cancelled'
                    sql_session.add(existing)
                    sql_session.commit()
                except Exception as e:
                    print(str(e))
        is_admin = user_data.get('admin') if 'admin' in user_data else False
        return {'checkout': stripe.generate_checkout(user_data.get('organization'), is_admin, sql_session)}, 200

    @v3_api.post('/artists/export')
    def export_request():
        try:
            req = flask.request.get_json()
            artist_ids = req.get('ids', None)
            filter_model = req.get('filterModel', None)
            
            db = firestore.client(app)
            user_data = get_user(user.uid, db)
            
            # Get artists based on IDs or filter model
            if filter_model is None and artist_ids is not None:
                if isinstance(artist_ids, str):
                    artist_ids = [artist_ids]
                # Query for specific artist IDs
                query = (select(Artist).options(
                    joinedload(Artist.statistics).joinedload(Statistic.type, innerjoin=True),
                    joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True),
                    joinedload(Artist.evaluation, innerjoin=False),
                    joinedload(Artist.organizations, innerjoin=False),
                    joinedload(Artist.tags, innerjoin=False),
                    joinedload(Artist.users, innerjoin=False)
                ).where(Artist.id.in_(artist_ids)))
                artists = sql_session.scalars(query).unique().all()
            else:
                # Use the filter model to get artist IDs
                artists_controller = get_artists_controller()
                artist_ids = artists_controller.get_artists(user.uid, {"filterModel": filter_model}, app, sql_session, True)
                
                if not artist_ids or len(artist_ids) == 0:
                    return flask.jsonify({"error": "No artists found matching the filter criteria"}), 404
                
                # Query for artists with these IDs
                query = (select(Artist).options(
                    joinedload(Artist.statistics).joinedload(Statistic.type, innerjoin=True),
                    joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True),
                    joinedload(Artist.evaluation, innerjoin=False),
                    joinedload(Artist.organizations, innerjoin=False),
                    joinedload(Artist.tags, innerjoin=False),
                    joinedload(Artist.users, innerjoin=False)
                ).where(Artist.id.in_(artist_ids)))
                artists = sql_session.scalars(query).unique().all()
            
            if not artists or len(artists) == 0:
                return flask.jsonify({"error": "No artists found with the provided IDs"}), 404

            # Get all statistic types and link sources for column headers
            stat_types_list = load_stat_types(sql_session)
            link_sources_list = load_link_sources(sql_session)
            
            # Create CSV header row
            headers = [
                "artist_id", "name", "spotify_id", "avatar", "created_at", "updated_at", "onboarded",
                "distributor", "distributor_type", "label", "status", "back_catalog", 
                "evaluation_updated_at", "evaluation_created_at"
            ]
            
            # Add link source headers
            for link_source in link_sources_list:
                headers.append(f"link_{link_source.get('key')}")
            
            # Add statistic headers
            for stat_type in stat_types_list:
                source = stat_type.get('source')
                key = stat_type.get('key')
                headers.append(f"{source}_{key}-latest")
                headers.append(f"{source}_{key}-previous")
                headers.append(f"{source}_{key}-week_over_week")
                headers.append(f"{source}_{key}-month_over_month")
                headers.append(f"{source}_{key}-min")
                headers.append(f"{source}_{key}-max")
                headers.append(f"{source}_{key}-avg")
            
            # Add tags and added_by headers
            headers.append("tags")
            headers.append("added_by")
            headers.append("added_on")
            
            # Create CSV rows
            rows = []
            rows.append(",".join(headers))
            
            # Map for distributor type and status values
            distributor_type_map = {
                0: "DIY",
                1: "Indie",
                2: "Major",
                None: "Unknown"
            }
            
            status_map = {
                0: "Unsigned",
                1: "Signed",
                None: "Unknown"
            }
            
            back_catalog_map = {
                0: "Clean",
                1: "Dirty",
                None: "Unknown"
            }
            
            # Load user data for added_by field
            users_data = {}
            users = load_users(user_data.get('organization'))
            for user_info in users:
                users_data[user_info.get('id')] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip()
            
            # Helper function to escape CSV fields
            def escape_csv_field(field):
                if field is None:
                    return ""
                field_str = str(field)
                if "," in field_str or '"' in field_str or "\n" in field_str:
                    return f'"{field_str.replace('"', '""')}"'
                return field_str
            
            for artist in artists:
                row = []
                
                # Basic artist fields
                row.append(escape_csv_field(artist.id))
                row.append(escape_csv_field(artist.name))
                row.append(escape_csv_field(artist.spotify_id))
                row.append(escape_csv_field(artist.avatar))
                row.append(escape_csv_field(artist.created_at.isoformat() if artist.created_at else ""))
                row.append(escape_csv_field(artist.updated_at.isoformat() if artist.updated_at else ""))
                row.append(escape_csv_field(artist.onboarded))
                
                # Evaluation fields
                if artist.evaluation:
                    row.append(escape_csv_field(artist.evaluation.distributor))
                    row.append(escape_csv_field(distributor_type_map.get(artist.evaluation.distributor_type, "Unknown")))
                    row.append(escape_csv_field(artist.evaluation.label))
                    row.append(escape_csv_field(status_map.get(artist.evaluation.status, "Unknown")))
                    row.append(escape_csv_field(back_catalog_map.get(artist.evaluation.back_catalog, "Unknown")))
                    row.append(escape_csv_field(artist.evaluation.updated_at.isoformat() if artist.evaluation.updated_at else ""))
                    row.append(escape_csv_field(artist.evaluation.created_at.isoformat() if artist.evaluation.created_at else ""))
                else:
                    row.extend(["", "Unknown", "", "Unknown", "Unknown", "", ""])
                
                # Link fields
                link_dict = {}
                for link in artist.links:
                    if hasattr(link, 'source') and hasattr(link.source, 'key'):
                        link_dict[link.source.key] = link.url
                
                for link_source in link_sources_list:
                    key = link_source.get('key')
                    row.append(escape_csv_field(link_dict.get(key, "")))
                
                # Statistic fields
                stat_dict = {}
                for stat in artist.statistics:
                    if hasattr(stat, 'type') and hasattr(stat.type, 'source') and hasattr(stat.type, 'key'):
                        key = f"{stat.type.source}_{stat.type.key}"
                        stat_dict[key] = {
                            "latest": stat.latest,
                            "previous": stat.previous,
                            "week_over_week": stat.week_over_week,
                            "month_over_month": stat.month_over_month,
                            "min": stat.min,
                            "max": stat.max,
                            "avg": stat.avg
                        }
                
                for stat_type in stat_types_list:
                    key = f"{stat_type.get('source')}_{stat_type.get('key')}"
                    if key in stat_dict:
                        row.append(escape_csv_field(stat_dict[key]["latest"]))
                        row.append(escape_csv_field(stat_dict[key]["previous"]))
                        row.append(escape_csv_field(stat_dict[key]["week_over_week"]))
                        row.append(escape_csv_field(stat_dict[key]["month_over_month"]))
                        row.append(escape_csv_field(stat_dict[key]["min"]))
                        row.append(escape_csv_field(stat_dict[key]["max"]))
                        row.append(escape_csv_field(stat_dict[key]["avg"]))
                    else:
                        row.extend(["", "", "", "", "", "", ""])
                
                # Tags field
                tags = [tag.tag for tag in artist.tags if tag.organization_id == user_data.get('organization')]
                row.append(escape_csv_field(",".join(tags) if tags else ""))
                
                # Added by and added on fields
                org_artist = next((org for org in artist.organizations if org.organization_id == user_data.get('organization')), None)
                if org_artist:
                    added_by_names = []
                    if hasattr(org_artist, 'added_by') and org_artist.added_by in users_data:
                        added_by_names.append(users_data[org_artist.added_by])
                    row.append(escape_csv_field(",".join(added_by_names) if added_by_names else ""))
                    row.append(escape_csv_field(org_artist.created_at.isoformat() if org_artist.created_at else ""))
                else:
                    row.extend(["", ""])
                
                rows.append(",".join(row))
            
            # Create CSV content
            csv_content = "\n".join(rows)
            
            # Create response with CSV content
            response = flask.Response(csv_content, mimetype='text/csv')
            response.headers.set('Content-Disposition', 'attachment', filename='artist_export.csv')
            return response
        except Exception as e:
            print(str(e))
            print(traceback.format_exc())
            return flask.jsonify({"error": "An error occurred while generating the export", "details": str(e)}), 500

    @v3_api.post('/edit-organization')
    def edit_organization():
        req = flask.request.get_json()
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        is_admin = user_data.get('admin') if 'admin' in user_data else False

        if is_admin == False:
            return 'Unauthorized', 401
        org = db.collection('organizations').document(req['id']).get()
        org.reference.update({'free_mode': req['free_mode']})
        return org.to_dict()

    @v3_api.post('/admin-organizations')
    def get_organizations_admin():
        db = firestore.client(app)
        data = flask.request.get_json()
        ids = data.get('ids', None)
        organizations = dict()
        subs = sql_session.scalars(select(Subscription).where(Subscription.organization_id.in_(ids)).where(Subscription.status.in_(['active', 'paused'])).order_by(Subscription.created_at.desc())).all()
        list_str = ', '.join("'" + str(item) + "'" for item in ids)

        sql_query = text('SELECT organization_artists.organization_id, artists.active, COUNT(*) FROM organization_artists LEFT JOIN artists ON artists.id = organization_artists.artist_id WHERE organization_id IN ('+list_str+') GROUP BY organization_artists.organization_id, artists.active')
        resp = sql_session.execute(sql_query).all()
        users = list(map(lambda x: x.to_dict(), db.collection('users').where(filter=FieldFilter(
        "organization", "in", ids
        )).get()))

        for sub in subs:
            if sub.organization_id not in organizations:
                organizations[sub.organization_id] = {
                    'id': sub.organization_id,
                    'subscription': sub.as_dict(),
                    'active_artists': pop_default(list(filter(lambda x: x[0] == sub.organization_id and x[1] == True, resp)), ['', '', 0])[2],
                    'inactive_artists': pop_default(list(filter(lambda x: x[0] == sub.organization_id and x[1] == False, resp)), ['', '', 0])[2],
                    "users": len(list(filter(lambda x: x.get('organization') == sub.organization_id, users)))
                }
            else:
                continue
        for org_id in ids:
            if org_id not in organizations:
                organizations[org_id] = {
                    'id': org_id,
                    'subscription': None,
                    'active_artists': pop_default(list(filter(lambda x: x[0] == org_id and x[1] == True, resp)), ['', '', 0])[2],
                    'inactive_artists': pop_default(list(filter(lambda x: x[0] == org_id and x[1] == False, resp)), ['', '', 0])[2],
                    "users": len(list(filter(lambda x: x.get('organization') == org_id, users)))
                }
        return list(organizations.values())

    @v3_api.get('/subscriptions')
    def load_subscriptions():
        try:
            db = firestore.client(app)
            user_data = get_user(user.uid, db)
            query = (select(Subscription)
                     .where(Subscription.organization_id == user_data['organization'])
                     .where(or_(Subscription.status.in_(['active', 'paused']), and_(Subscription.status == 'canceled', Subscription.renews_at > datetime.now())))
                     .order_by(Subscription.created_at.desc()))
            subs = sql_session.scalars(query)

            return list(map(lambda x: x.as_dict(), subs))
        except Exception as e:
            print(str(e))
            print(traceback.format_exc())
            return {"error": str(e)}, 500

    @v3_api.post('/subscription-portal')
    def billing_portal_url():
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        subscription = sql_session.scalars(select(Subscription).where(Subscription.organization_id == user_data['organization']).where(Subscription.id == flask.request.get_json()['subscription_id'])).first()
        if subscription is None:
            return 'Failed', 400

        return get_stripe().portal_url(subscription.customer_id), 200

    @v3_api.get('/organizations')
    def get_organizations_request():
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        admin = user_data['admin'] if 'admin' in user_data else False
        if admin == False:
            return 'Unauthorized', 401
        return list(map(lambda org: {"id": org.id, "name": org.get('name')}, db.collection('organizations').get()))

    @v3_api.post('/set-organization')
    def set_organization_request():
        db = firestore.client(app)
        user_data = get_user(user.uid, db, False)
        user_dict = user_data.to_dict()
        admin = user_dict['admin'] if 'admin' in user_dict else False
        if admin == False:
            return 'Unauthorized', 401
        data = flask.request.get_json()

        user_data.reference.update({'organization': data.get('organization')})

        return {"organization": data.get('organization')}, 200



    @v3_api.get('/imports')
    def get_imports():
        organization_id = request.headers.get('X-Organization')
        req = flask.request.args.to_dict()
        page_size = int(req.get('pageSize', 10))
        page = int(req.get('page', 0))

        import_id = req.get('id', None)
        if import_id is None:
            imports, total = playlist_controller.get_imports(organization_id, page, page_size)
            response = jsonify({
                "imports": imports,
                "page": page,
                "pageSize": page_size,
                "total": total
            })
        else:
            import_obj, total = playlist_controller.get_import(organization_id, int(import_id), page, page_size)
            response = jsonify({
                "import": import_obj,
                "page": page,
                "pageSize": page_size,
                "total": total
            })
        # response.headers.add('Cache-Control', 'private, max-age=5')
        # response.headers.add('X-Organization', request.headers.get('X-Organization'))
        # response.headers.add('Vary', 'X-Organization')
        return response


    @v3_api.get('/playlists')
    def get_playlists():
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        req = flask.request.args.to_dict()
        page_size = req.get('pageSize', 10)
        page = req.get('page', 0)
        playlists, total = playlist_controller.get_playlists(user_data.get('organization'), page, page_size)
        response = jsonify({
            "playlists": playlists,
            "page": page,
            "pageSize": page_size,
            "total": total
        })
        # response.headers.add('Cache-Control', 'private, max-age=5')
        # response.headers.add('X-Organization', request.headers.get('X-Organization'))
        # response.headers.add('Vary', 'X-Organization')
        return response


    @v3_api.get('/get-existing-tags')
    def get_existing_tags_request():
        response = jsonify(get_existing_tags(sql_session, user))
        # response.headers.add('Cache-Control', 'public, max-age=60')
        # response.headers.add('X-Organization', request.headers.get('X-Organization'))
        # response.headers.add('Vary', 'X-Organization')
        return response

    @v3_api.get('/get-existing-tags-light')
    def get_existing_tags_request_light():
        response = jsonify(get_existing_tags(sql_session, user, True))
        # response.headers.add('Cache-Control', 'public, max-age=60')
        # response.headers.add('X-Organization', request.headers.get('X-Organization'))
        # response.headers.add('Vary', 'X-Organization')
        return response

    def artist_ids_from_filters(filter_model):
        return get_artists_controller().get_artists(user.uid, {"filterModel": filter_model}, app, sql_session, True)

    def artist_mute(artist_ids, value):
        if isinstance(artist_ids, str):
            artist_ids = [artist_ids]
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        stmt = update(OrganizationArtist).where(and_(OrganizationArtist.organization_id == user_data.get('organization'), OrganizationArtist.artist_id.in_(artist_ids))).values(muted=value)
        sql_session.execute(stmt)
        sql_session.commit()

    def artist_archive(artist_ids, uid, value):
        if isinstance(artist_ids, str):
            artist_ids = [artist_ids]
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        stmt = update(OrganizationArtist).where(and_(OrganizationArtist.organization_id == user_data.get('organization'), OrganizationArtist.artist_id.in_(artist_ids))).values(archived=value, archived_at=datetime.now(), archived_by=uid)
        sql_session.execute(stmt)
        sql_session.commit()

    @v3_api.post('/artists/mute')
    def artist_bulk_mute_request():
        req = flask.request.get_json()
        artist_ids = req.get('ids', None)
        filter_model = req.get('filterModel', None)
        value = req.get('muted', True)
        if filter_model is None:
            artist_mute(artist_ids, value)
        else:
            ids = artist_ids_from_filters(filter_model)
            artist_mute(ids, value)

        return {"status": "success"}, 200

    @v3_api.delete('/artists')
    def artist_bulk_archive_request():
        req = flask.request.get_json()
        artist_ids = req.get('ids', None)
        filter_model = req.get('filterModel', None)
        if filter_model is None:
            artist_archive(artist_ids, user.uid, True)
        else:
            ids = artist_ids_from_filters(filter_model)
            artist_archive(ids, user.uid,True)

        return {"status": "success"}, 200

    @v3_api.post('/artists/<artist_id>/mute')
    def artist_mute_request(artist_id):
        artist_mute(artist_id, True)
        return {"status": "success"}, 200

    @v3_api.post('/artists/<artist_id>/unmute')
    def artist_unmute_request(artist_id):
        artist_mute(artist_id, False)
        return {"status": "success"}, 200

    @v3_api.get('/artists')
    def get_artists_request():
        artists_controller = get_artists_controller()
        args = request.args.to_dict()
        filterModel = json.loads(args.get('filterModel', None)) if args.get('filterModel', None) else None
        if filterModel is not None:
            args['filterModel'] = filterModel
        sortModel = json.loads(args.get('sortModel', None)) if args.get('sortModel', None) else None
        if sortModel is not None:
            args['sortModel'] = sortModel
        artists = artists_controller.get_artists(user.uid, args, app, sql_session)
        response = jsonify(artists )
        if artists.get('error', None) is not None:
            response.status_code = 500

        # else:
            # response.headers.add('Cache-Control', 'public, max-age=1')
        # response.headers.add('X-Organization', request.headers.get('X-Organization'))
        # response.headers.add('Vary', 'X-Organization')
        return response

    @v3_api.post('/add-artist')
    def add_artist_request():
        data = flask.request.get_json()
        print(data.get('spotify_url'), data.get('tags'))
        return add_artist(sql_session, user.uid, data.get('spotify_url', None), data.get('id', False), data.get('tags', None), data.get('preview', False))


    @v3_api.post('/sms')
    def sms_setup():
        db = firestore.client(app)
        uid = user.uid
        spotify = get_spotify_client()
        data = flask.request.get_json()
        twilio = get_twilio_client()
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
    @v3_api.get('/organization')
    def get_organization():
        db = firestore.client(app)
        user_data = get_user(user.uid, db)
        org = db.collection('organizations').document(user_data['organization']).get()
        org_dict = org.to_dict()
        sub = sql_session.scalars(select(Subscription).where(Subscription.organization_id == user_data['organization']).where(Subscription.status.in_(['active', 'paused'])).order_by(Subscription.created_at.desc())).first()
        org_dict['subscription'] = sub.as_dict() if sub else None
        response = jsonify(org_dict )

        response.headers.add('Cache-Control', 'public, max-age=5')
        response.headers.add('X-Organization', request.headers.get('X-Organization'))
        response.headers.add('Vary', 'X-Organization')
        return response

    @v3_api.post('/spotify-auth')
    def spotify_auth():
        spotify = get_spotify_client()
        db = firestore.client(app)

        data = flask.request.get_json()
        code = data.get('code', None)
        state = data.get('state', None)
        user_data = get_user(user.uid, db)
        redirect_uri = data.get('redirect_uri', None)
        return spotify.get_token_from_code(sql_session, user.uid, user_data.get('organization'), code, redirect_uri, state)

    @v3_api.get('/artists/label-counts')
    def get_label_counts():
        try:
            data = request.args.to_dict()
            filterModel = json.loads(data.get('filterModel', None)) if data.get('filterModel', None) else None
            if filterModel is not None:
                data['filterModel'] = filterModel
            artists_controller = get_artists_controller()
            counts = artists_controller.get_label_type_counts(user.uid, data, app, sql_session)
            return flask.jsonify(counts)
        except Exception as e:
            print(str(e))
            print(traceback.format_exc())
            return flask.jsonify({"error": "An error occurred while getting label counts", "details": str(e)}), 500

    @v3_api.post('/lookalike/queue')
    def queue_lookalike_task():
        try:
            data = flask.request.get_json()
            lookalike_id = data.get('lookalike_id')
            
            if not lookalike_id:
                return flask.jsonify({"error": "Missing lookalike_id parameter"}), 400
                
            # Validate lookalike exists and check status
            lookalike = sql_session.query(Lookalike).filter(Lookalike.id == lookalike_id).first()
            
            if not lookalike:
                return flask.jsonify({"error": f"Lookalike with ID {lookalike_id} not found"}), 404
                
            if lookalike.status > 0:
                return flask.jsonify({"error": f"Lookalike with ID {lookalike_id} already processed (status: {lookalike.status})"}), 400
                
            # Queue the task
            task_queue = functions.task_queue("lookaliketask")
            target_uri = get_function_url("lookaliketask")
            
            body = {"data": {"lookalike_id": lookalike_id}}
            task_options = functions.TaskOptions(
                schedule_time=datetime.now(),
                uri=target_uri
            )
            
            task_queue.enqueue(body, task_options)
            
            return flask.jsonify({
                "message": f"Successfully queued lookalike task for ID {lookalike_id}",
                "lookalike_id": lookalike_id
            }), 200
            
        except Exception as e:
            print(str(e))
            print(traceback.format_exc())
            return flask.jsonify({"error": "An error occurred while queuing lookalike task", "details": str(e)}), 500
            
    @v3_api.post('/lookalike/add-artists')
    def queue_lookalike_add_artists():
        try:
            data = flask.request.get_json()
            lookalike_id = data.get('lookalike_id')
            
            if not lookalike_id:
                return flask.jsonify({"error": "Missing lookalike_id parameter"}), 400
                
            # Find import with this lookalike ID
            import_obj = sql_session.query(Import).options(
                joinedload(Import.lookalike),
                joinedload(Import.artists)
            ).filter(Import.lookalike_id == lookalike_id).first()
            
            if not import_obj:
                return flask.jsonify({"error": f"Import with lookalike ID {lookalike_id} not found"}), 404
                
            lookalike = import_obj.lookalike
            
            if not lookalike:
                return flask.jsonify({"error": f"Lookalike with ID {lookalike_id} not found"}), 404
                
            # Validate status and auto_add
            if lookalike.status != 3:
                return flask.jsonify({
                    "error": f"Lookalike must have status 3 (completed) to add artists. Current status: {lookalike.status}"
                }), 400
                
            if lookalike.auto_add:
                return flask.jsonify({
                    "error": "Artists were already automatically added for this lookalike (auto_add=true)"
                }), 400
                
            # Get all Spotify IDs from import artists
            spotify_ids = [artist.spotify_id for artist in import_obj.artists if artist.spotify_id]
            
            if not spotify_ids:
                return flask.jsonify({"error": "No valid artists found to add"}), 400
                
            # Queue artist add tasks
            count = queue_artist_add_tasks(
                spotify_ids=spotify_ids,
                user_id=import_obj.user_id,
                import_id=import_obj.id,
                organization_id=import_obj.organization_id
            )
            
            return flask.jsonify({
                "message": f"Successfully queued {count} artists for addition",
                "lookalike_id": lookalike_id,
                "import_id": import_obj.id,
                "artists_queued": count
            }), 200
            
        except Exception as e:
            print(str(e))
            print(traceback.format_exc())
            return flask.jsonify({"error": "An error occurred while queuing artist additions", "details": str(e)}), 500

    @v3_api.after_request
    def after_request(response):
        # Code to run after each request

        return response

    with v3_api.request_context(request.environ):
        resp = v3_api.full_dispatch_request()
        sql_session.close()
        return resp

def get_type_definitions(sql_session):
    global stat_types, link_sources
    print("get type defs")
    if link_sources is None:
        print("load link defs")
        link_sources = load_link_sources(sql_session)
    if stat_types is None:
        print("load stat type")
        stat_types = load_stat_types(sql_session)
    return {
        "statistic_types": stat_types,
        "link_sources": link_sources,
        "tag_types": get_tag_types()
    }

def get_existing_tags(sql_session, user, light = False):
    db = firestore.client(app)
    if user is None:
        return {
            "tags": [],
            "users": [],
            "current_user": None
        }
    uid = user.uid
    user_snap = get_user(uid, db, False)
    user_data = user_snap.to_dict()
    #
    # if ('email' not in user_data or user_data['email'] is None):
    #     user_snap.update({'email': user.email})
    records = select(ArtistTag.tag).distinct(ArtistTag.tag).filter(ArtistTag.organization_id == user_data.get('organization'))
    records = sql_session.scalars(records).all()
    records = ({"tag": tag_type, "tag_type_id":1} for tag_type in records)
    return {
        "tags": list(records),
        "users": [] if light == True else list(load_users(user_data.get('organization'))),
        "current_user": user_data,
    }

def get_twilio_client():
    twilio_client = TwilioController(get_spotify_client(), TWILIO_ACCOUNT, TWILIO_TOKEN, TWILIO_VERIFY_SERVICE, TWILIO_MESSAGE_SERVICE)
    return twilio_client

def get_artists_controller():
    artists_controller = ArtistController(PROJECT_ID, LOCATION)
    return artists_controller


def get_task_controller():
    task_controller = TaskController(PROJECT_ID, LOCATION, V1_API_ROOT, V2_API_ROOT, V3_API_ROOT)

    return task_controller

def get_spotify_client():
    # if spotify_client is None:
    spotify_client = SpotifyClient(firestore.client(app), SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_ALT_CLIENT_ID, SPOTIFY_ALT_CLIENT_SECRET, SPOTIFY_USER_FACING_CLIENT_ID, SPOTIFY_USER_FACING_CLIENT_SECRET)

    return spotify_client

def get_youtube_client():
    global youtube_client
    if youtube_client is None:
        youtube_client = YoutubeClient(YOUTUBE_TOKEN, YOUTUBE_TOKEN_ALT)

    return youtube_client

def process_spotify_link(sql_session, uid, spotify_url, tags = None, preview = False ):
    spotify = get_spotify_client()
    task_controller = get_task_controller()
    try:
        db = firestore.client(app)
        songstats = SongstatsClient(SONGSTATS_API_KEY)

        tracking_controller = TrackingController(spotify, songstats, db, None)

        spotify_id = spotify.url_to_id(spotify_url)
        if spotify_id == 'invalid':
            spotify_id = spotify.url_to_id(spotify_url, 'playlist')
            if spotify_id == 'invalid':
                return {'message': 'Invalid URL, try copy pasting an artist or playlist URL from Spotify directly.',
                        'status': 400, 'added_count': 0}
            else:
                user_data = get_user(uid, db)
                try:
                    aids, playlist_name, playlist_picture, artists = spotify.get_playlist_artists(spotify_id, "user")

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
                            first_user=uid,
                            last_user=uid,
                            image=playlist_picture
                        )
                        sql_session.add(sql_playlist)
                        sql_session.commit()
                        sql_session.refresh(sql_playlist)
                    else:
                        sql_playlist.last_user = uid
                        sql_playlist.updated_at = datetime.now()
                        sql_playlist.image = playlist_picture
                        sql_session.add(sql_playlist)
                        sql_session.commit()

                    sql_playlist_dict = sql_playlist.as_dict()

                    import_obj = Import(
                        organization_id=user_data.get('organization'),
                        user_id=uid,
                        playlist_id=sql_playlist_dict.get('id'),
                        status='pending',
                        artists=[]
                    )
                    for artist in artists:
                        import_obj.artists.append(ImportArtist(
                            spotify_id=artist['id'],
                            name=artist['name'],
                            status=0
                        ))
                    sql_session.add(import_obj)
                    sql_session.commit()
                    sql_session.refresh(import_obj)
                    artist_chunks = spotify.chunk_list(artists, 50)
                    for aid_chunk in artist_chunks:
                        body = {"spotify_ids": list(map(lambda x: str(x['id']), aid_chunk))}
                        task_controller.enqueue_task('SpotifyQueue', 2, '/spotify-cache-ids', body)
                    for a in aids:
                        task_queue = functions.task_queue("addartisttask")
                        target_uri = get_function_url("addartisttask")
                        body = {"data": {"spotify_id": a, "uid": uid, "organization": user_data.get("organization_id"), "import_id": import_obj.id,  "playlist_id": sql_playlist.id, "tags": tags}}
                        task_options = functions.TaskOptions(schedule_time=datetime.now() + timedelta(seconds=20), uri=target_uri)
                        task_queue.enqueue(body, task_options)
                    return {'message': 'success', 'status': 200, 'added_count': len(aids), "import_id": import_obj.id}
                except ErrorResponse as e:
                    print(str(e))
                    if preview:
                        return {
                            "found": False,
                            "type": "playlist",
                            "spotify_id": spotify_id,
                            "url": spotify_url.split('?')[0],
                            "error": "failed"
                        }
                    return {
                        'message': 'failed', 'status': 500, 'error': traceback.format_exc()
                    }
        else:
            user_data = get_user(uid, db)
            if preview:
                try:
                    artist = spotify.get_artist(spotify_id, 'user')
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
                    print('Exception from link proc', str(e))
                    return {

                        "found": False,
                        "url": spotify_url.split('?')[0],
                        "error": e.status_code if e is ErrorResponse else str(e),
                        "spotify_id": spotify_id,

                    }

            msg, status = tracking_controller.add_ingest_update_artist(sql_session, spotify_id, uid, user_data['organization'], tags)
            return {'message': msg, 'status': status, 'added_count': 1}
    except Exception as e:
        print("error response from link proc", str(e))
        print(traceback.format_exc())
        if preview:
            return {
                "found": False,

            }

        raise e


##############################
# V1 API
# ###########################
#
# @https_fn.on_request()
# def fn_v1_api(req: https_fn.Request) -> https_fn.Response:
#     youtube = YoutubeClient(YOUTUBE_TOKEN)
#     airtable = AirtableClient(AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLES)
#     spotify = get_spotify_client()
#
#     v1_controller = AirtableV1Controller(airtable, spotify, youtube)
#     v1_api = flask.Flask(__name__)
#
#     @v1_api.errorhandler(Exception)
#     def invalid_api_usage(e: Exception):
#         print(e)
#         if isinstance(e, ErrorResponse):
#             print(e.to_json())
#             return e.respond()
#         traceback.print_exc()
#         return flask.jsonify({'error': "An unknown error occurred (500, responding 299 to cancel retry)"}), 299
#
#     @v1_api.get("/debug")
#     def get_debug():
#         record = v1_controller.find_new_evals()[0]
#         v1_controller.copyright_eval(record['id'])
#         return 'success', 200
#
#     @v1_api.post("/copyright-eval")
#     def post_copyright_eval():
#         data = flask.request.get_json()
#
#         if 'record_id' not in data:
#             raise ErrorResponse("Invalid payload. Must include 'record_id'", 500)
#
#         record_id = data['record_id']
#         v1_controller.copyright_eval(record_id)
#
#         return 'Success', 200
#
#     with v1_api.request_context(req.environ):
#         return v1_api.full_dispatch_request()

# Extract reusable function for queueing artist add tasks
def queue_artist_add_tasks(spotify_ids, user_id, import_id, organization_id):
    """
    Queue tasks to add artists to an organization
    
    Args:
        spotify_ids: List of Spotify IDs to add
        user_id: User ID who is adding the artists
        import_id: Import ID for attribution
        organization_id: Organization ID to add artists to
    
    Returns:
        Number of tasks queued
    """
    count = 0
    for spotify_id in spotify_ids:
        task_queue = functions.task_queue("addartisttask")
        target_uri = get_function_url("addartisttask")
        
        body = {
            "data": {
                "spotify_id": spotify_id,
                "uid": user_id,
                "import_id": import_id,
                "organization": organization_id
            }
        }
        
        task_options = functions.TaskOptions(
            schedule_time=datetime.now() + timedelta(seconds=20),
            uri=target_uri
        )
        task_queue.enqueue(body, task_options)
        count += 1
    
    return count
