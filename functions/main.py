from array import array

from firebase_admin import initialize_app, firestore
from firebase_functions import https_fn, scheduler_fn, tasks_fn, params, logger, options
from google.cloud.firestore_v1 import FieldFilter
from openai import organization
from sqlalchemy import select

from cron_jobs import airtable_v1_cron, eval_cron, stats_cron, onboarding_cron
from tmp_keys import *
from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, ArtistLink, OrganizationArtist, Evaluation, StatisticType, Statistic, UserArtist
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

# ##############################
# V2 API
# ##############################

@https_fn.on_request(memory=512)
def fn_v2_api(req: https_fn.Request) -> https_fn.Response:

    db = firestore.client(app)
    tracking_controller = TrackingController(spotify, songstats, sql, db)
    eval_controller = EvalController(spotify, youtube, db)
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
        old_artists = db.collection("artists_v2").limit(15).get()
        import_sql(old_artists, db.collection('users').get())
        # dump_unclean(db)
        # migrate_add_favs_and_tags(db)
        # migrate_from_v1(airtable, spotify, tracking_controller)
        # wipe_collection(db, 'artists_v2')
        # reset_update_as_of(db)
        # aids = spotify.get_playlist_artists('37i9dQZF1E4A2FqXjcsyRn')
        # for a in aids:
        #     tracking_controller.add_artist(a, 'yb11Ujv8JXN9hPzWjcGeRvm9qNl1', '33EkD6zWBJcKcgdS9kIn')
        return 'success', 200

    @v2_api.post("/eval-artist")
    def eval_artist():
        data = flask.request.get_json()
        if 'spotify_id' not in data:
            raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

        return eval_controller.evaluate_copyrights(data['spotify_id'])

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

# Figures out how many artists to do per batch given an update interval and minimum SLA

def convert_artist_link(link, sources):
    sources = list(filter(lambda s: s.key == link.get('source'), sources))
    if len(sources) == 0:
        print("No valid source: " + link.get('source'))
        exit(1)

    source: LinkSource = sources[0]
    source_parts = source.url_scheme.split('{identifier}')
    scheme_part_one = (source_parts[0]
                     .replace('https://', '')
                     .replace('http://', '')
                     .replace('www.', ''))
    scheme_part_two = source_parts[1]


    url_identifier = (link.get("url")
                      .replace('https://', '')
                     .replace('http://', '')
                     .replace('www.', '')
                      .replace(scheme_part_one, ''))
    if len(scheme_part_two) > 0:
        url_identifier = url_identifier.split(scheme_part_two)[0]
    url_identifier = url_identifier.split("?")[0]

    return ArtistLink(
            link_source_id = sources[0].id,
            path = url_identifier,
        )

def import_sql(old_artists, users):

    link_sources = sql.load_all_for_model(LinkSource)
    sql_session = sql.get_session()
    stat_types = list(sql_session.scalars(select(StatisticType)).all())
    userOrgs = dict()
    for user in users:
        id = user.id
        user = user.to_dict()
        userOrgs[id] = user.get('organization')

    spotifys = list(map(lambda x: x.get('spotify_id'), old_artists))
    existing = sql_session.scalars(select(Artist).where(Artist.spotify_id.in_(spotifys))).all()
    for artist in old_artists:
        spotify_id = artist.get('spotify_id')
        add_batch = list()
        existingMatches = list(filter(lambda x: x.spotify_id == spotify_id, existing))
        if len(existingMatches) > 0:
            print("Skipping existing artist: " + spotify_id + ' ' + str(existingMatches[0].id))
            continue
        else:
            print("Adding artist: " + spotify_id)
            orgs = list()
            for orgId, watchDetails in artist.get('watching_details').items():
                orgs.append(OrganizationArtist(
                    organization_id = orgId,
                    favorite = watchDetails.get('favorite'),
                    created_at = watchDetails.get('added_on'),
                ))
            evals = list()
            if artist.get('eval_as_of') != None:
                status = 1
                if artist.get('eval_status') == 'dirty':
                    status = 2
                elif artist.get('eval_status') == 'unsigned':
                    status = 0

                if artist.get('eval_distro_type') == 'indie':
                    distributor_type = 1
                elif artist.get('eval_distro_type') == 'major':
                    distributor_type = 2
                elif artist.get('eval_distro_type') == 'diy':
                    distributor_type = 0
                else:
                    distributor_type = 3
                evals.append(Evaluation(
                    distributor = artist.get('eval_distro'),
                    distributor_type = distributor_type,
                    label = artist.get('eval_label'),
                    created_at = artist.get('eval_as_of'),
                    status = status
                ))
            stats = list()
            stat_dates = artist.get('stat_dates')
            for key, value in artist.to_dict().items():
                keyStr: str = key

                if not keyStr.startswith('stat_'):
                    continue
                if keyStr == 'stat_dates':
                    continue
                statSource = keyStr.split('_')[1].split('__')[0]
                statName = keyStr.split('__')[1]
                newStatType = None
                for statType in stat_types:
                    if statType.source == statSource and statType.key == statName:
                        newStatType = statType
                        break

                if newStatType == None:
                    newStatType = StatisticType(
                        name = statName,
                        key = statName,
                        source = statSource,
                        format = 'int'
                    )
                    sql_session.add(newStatType)
                    sql_session.commit()
                    print("ADDING TYPE: " + statName)
                    stat_types = list(sql_session.scalars(select(StatisticType)).all())

                if len(value) == 0:
                    continue
                if newStatType.format == 'int':
                    valueSet = list(map(int, value))
                    latest: int = valueSet[len(valueSet) - 1]
                    before_latest: int = valueSet[len(valueSet) - 2]
                else:
                    valueSet = list(map(float, value))
                    latest: float = valueSet[len(valueSet) - 1]
                    before_latest: float = valueSet[len(valueSet) - 2]

                wow = 0 if before_latest <= 0 else (latest - before_latest) / before_latest
                mom = 0 if valueSet[3] <= 0 else  (valueSet[7] - valueSet[3]) / valueSet[3]
                stats.append(Statistic(
                    type = newStatType,
                    latest = latest,
                    before_latest = before_latest,
                    max = max(valueSet),
                    min = min(valueSet),
                    avg = sum(valueSet) / len(valueSet),
                    data = valueSet,
                    week_over_week = wow,
                    month_over_month = mom,
                    created_at = stat_dates[len(stat_dates) - 1],
                ))
            userArtists = list()
            for user_id, found_details in artist.get('found_by_details').items():
                userArtists.append(UserArtist(
                    user_id = user_id,
                    organization_id=userOrgs[user_id],
                    created_at=found_details.get('found_on')
                ))
            add_batch.append(Artist(
                spotify_id = spotify_id,
                name = artist.get('name'),
                avatar = artist.get('avatar'),
                onboard_wait_until = None,
                links = list(map(lambda x: convert_artist_link(x, link_sources), artist.get('links'))),
                organizations = orgs,
                evaluations = evals,
                statistics = stats,
                users = userArtists
            ))


        if len(add_batch) > 0:
            sql_session.add_all(add_batch)
            sql_session.commit()
            add_batch.clear()


    sql_session.close()


@scheduler_fn.on_schedule(schedule=f"*/2 * * * *", memory=512)
def fn_v2_update_job(event: scheduler_fn.ScheduledEvent) -> None:
    db = firestore.client(app)
    tracking_controller = TrackingController(spotify, songstats, db)
    eval_controller = EvalController(spotify, youtube, db)
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
    tracking_controller = TrackingController(spotify, songstats, db)
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
                aids = spotify.get_playlist_artists(spotify_id)
                for a in aids:
                    tracking_controller.add_artist(a, uid, user_data['organization'])
                return {'message': 'sucess', 'status': 200, 'added_count': len(aids)}
        else:
            uid = req.auth.uid
            user_data = get_user(uid, db)
            msg, status = tracking_controller.add_ingest_update_artist(spotify_id, uid, user_data['organization'])
            return {'message': msg, 'status': status, 'added_count': 1}
    except ErrorResponse as e:
        raise e.to_https_fn_error()

@https_fn.on_call()
def get_artists(req: https_fn.CallableRequest):    

    # request schema from MUI
    # req.data = {'groupKeys': [], 'paginationModel': {'page': 0, 'pageSize': 10}, 'sortModel': [], 'filterModel': {'items': [], 'logicOperator': 'and', 'quickFilterValues': [], 'quickFilterLogicOperator': 'and'}, 'start': 0, 'end': 9}
    print(req.data)

    # How to get the user and the org IDs
    db = firestore.client(app)
    uid = req.auth.uid
    user_data = get_user(uid, db)
    print(user_data)

    # Mock response format
    return {
        "rows": [
            {
              'id': 1,
              'name': 'fake artist',
              'eval_distro': 'Vydia',
              'eval_status': 'signed',
              'spotify_url': 'httsp://play.spotify.com/artist/b947fg73g8v',
              'genres': [],
              "stat_spotify__monthly_listeners_current__abs-latest": 8947784
            }
        ],
        "rowCount": 1
    }