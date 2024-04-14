from firebase_admin import initialize_app, firestore
from firebase_functions import https_fn, scheduler_fn, tasks_fn, params, logger, options
from actions import airtable_v1_cron, get_user
from tmp_keys import *
from lib import SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse
from controllers import AirtableV1Controller, TaskController, TrackingController, EvalController
import flask
from datetime import datetime, timedelta
import traceback


#################################
# App Initialization
#################################

app = initialize_app()
db = firestore.client(app)

#################################
# Globals
#################################

spotify = SpotifyClient(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
spotify.authorize()
airtable = AirtableClient(AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLES)
youtube = YoutubeClient(YOUTUBE_TOKEN)
songstats = SongstatsClient(SONGSTATS_API_KEY)
v1_controller = AirtableV1Controller(airtable, spotify, youtube)
task_controller = TaskController(PROJECT_ID, LOCATION, API_ROOT, DEFAULT_QUEUE)
tracking_controller = TrackingController(songstats, db)
eval_controller = EvalController(spotify, youtube, db)

# ##############################
# V2 API Routes
# ##############################

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
    return 'debug', 200

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

@v2_api.post("/ingest-update-artist")
def ingest_update_artist():
    data = flask.request.get_json()
    if 'spotify_id' not in data:
        raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

    return tracking_controller.ingest_update_artist(data['spotify_id'])


@v2_api.post("/add-artist")
def add_artist():
    data = flask.request.get_json()
    if 'spotify_id' not in data:
        raise ErrorResponse("Invalid payload. Must include 'spotify_id'", 500)

    return tracking_controller.add_artist(data['spotify_id'], 'yb11Ujv8JXN9hPzWjcGeRvm9qNl1', '33EkD6zWBJcKcgdS9kIn')


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

##############################
# V1 API Routes
# ###########################

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

#################################
# API Function Definitions
#################################

@https_fn.on_request()
def fn_v1_api(req: https_fn.Request) -> https_fn.Response:
    with v1_api.request_context(req.environ):
        return v1_api.full_dispatch_request()
    
@https_fn.on_request()
def fn_v2_api(req: https_fn.Request) -> https_fn.Response:
    with v2_api.request_context(req.environ):
        return v2_api.full_dispatch_request()
    
#################################
# Cron Job Definitions
#################################

@scheduler_fn.on_schedule(schedule="*/1 * * * *")
def fn_v1_cron_job(event: scheduler_fn.ScheduledEvent) -> None:
    airtable_v1_cron(task_controller, v1_controller)

#################################
# App Function Definitions
#################################

@https_fn.on_call()
def add_artist(req: https_fn.CallableRequest):
    # Message text passed from the client.
    try:
        spotify_url = req.data["spotify_url"]
        spotify_id = spotify.url_to_id(spotify_url)
        uid = req.auth.uid
        user_data = get_user(uid, db)
        msg, status = tracking_controller.add_ingest_update_artist(spotify_id, uid, user_data['organization'])
        return {'message': msg, 'status': status}
    except ErrorResponse as e:
        raise e.to_https_fn_error()
