import time
from datetime import datetime

from sqlalchemy import bindparam, update

from controllers import AirtableV1Controller, TaskController, TrackingController, EvalController
from lib import Artist


# def ob_eval_cron(task_controller : TaskController, tracking_controller: TrackingController, batch_size : int):
#    artist_ids = tracking_controller.find_needs_ob_eval(batch_size)
#    for aritst_id in artist_ids:
#         body = {"spotify_id": aritst_id}
#         task_controller.enqueue_task('EvalQueue', 2, '/eval-artist', body)

def onboarding_cron(sql_session, task_controller : TaskController, tracking_controller: TrackingController, batch_size : int):
   artist_ids = tracking_controller.find_needs_ob_ingest(sql_session, batch_size)
   if len(artist_ids) == 0:
       print("No artists need onboarding ingest")
   else:
       print("queueing onboards:", artist_ids)
   for aritst_id in artist_ids:
        body = {"spotify_id": aritst_id}
        task_controller.enqueue_task('IngestQueue', 2, '/ingest-artist', body)

def spotify_cron(sql_session, task_controller : TaskController, eval_controller: EvalController, bulk_update):
    artist_ids = eval_controller.find_needs_shopify_for_eval(sql_session, 50)
    artist_id_strs = []
    for artist_id in artist_ids:
        artist_id_strs.append(str(artist_id))
    if len(artist_ids) == 0:
        print("No artists need cache")
        return

    body = {"artist_ids": list(map(lambda x: str(x), artist_ids))}
    task_controller.enqueue_task('SpotifyQueue', 2, '/spotify-cache', body)
    bulk_update(sql_session, artist_id_strs, 'spotify_queued_at = NOW()')


def eval_cron(sql_session, task_controller : TaskController, eval_controller: EvalController, batch_size : int, bulk_update):

    artist_ids = eval_controller.find_needs_eval_refresh(sql_session, batch_size)
    artist_id_strs = []
    if len(artist_ids) == 0:
        print("No artists need eval refresh")
        return
    else:
        print("queueing eval:", artist_ids)
    for artist_id in artist_ids:
        artist_id_strs.append(str(artist_id))
        body = {"id": str(artist_id)}
        task_controller.enqueue_task('EvalQueue', 2, '/eval-artist', body)
    bulk_update(sql_session, artist_id_strs, 'eval_queued_at = NOW()')



def stats_cron(sql_session, task_controller : TaskController, tracking_controller: TrackingController, batch_size : int, bulk_update):
    artist_ids = tracking_controller.find_needs_stats_refresh(sql_session, batch_size)
    artist_id_strs = []
    if len(artist_ids) == 0:
        print("No artists need stats refresh")
        return
    else:
        print("queueing stats:", artist_ids)
    for artist_id in artist_ids:
        artist_id_strs.append(str(artist_id))
        body = {"id": str(artist_id)}
        task_controller.enqueue_task('StatsQueue', 2, '/update-artist', body)

    bulk_update(sql_session, artist_id_strs, 'stats_queued_at = NOW()')


def airtable_v1_cron(task_controller : TaskController, airtable_v1_controller: AirtableV1Controller):
    jobs_added = 0

    # link spotify
    records = airtable_v1_controller.find_missing_spotify_links()
    if len(records) > 0:
      for r in records[:60]:
        if jobs_added >= 60:
            break
        body = {"record_id": r['id']}
        # task_controller.enqueue_task('IngestQueue', 1, '/link-spotify', body)
        jobs_added = jobs_added + 1
      # wait till next job to move onto new task types
      return

    # copyright evals
    records = airtable_v1_controller.find_new_evals()
    if len(records) > 0:
      for r in records[:15]:
        if jobs_added >= 15:
            break
        body = {"record_id": r['id']}
        # task_controller.enqueue_task('IngestQueue', 1, '/copyright-eval', body)
        jobs_added = jobs_added + 1
      # wait till next job to move onto new task types
      return
