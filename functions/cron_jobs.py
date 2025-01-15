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

def onboarding_cron(task_controller : TaskController, tracking_controller: TrackingController, batch_size : int):
   artist_ids = tracking_controller.find_needs_ob_ingest(batch_size)
   for aritst_id in artist_ids:
        body = {"spotify_id": aritst_id}
        task_controller.enqueue_task('StatsQueue', 2, '/ingest-artist', body)

def eval_cron(task_controller : TaskController, eval_controller: EvalController, batch_size : int, sql):
    sql_session = sql.get_session()

    artist_ids = eval_controller.find_needs_eval_refresh(sql_session, batch_size)
    maps = []
    for artist_id in artist_ids:
        maps.append({'id': artist_id, 'eval_queued_at': datetime.now()})
        body = {"id": str(artist_id)}
        task_controller.enqueue_task('EvalQueue', 2, '/eval-artist', body)
    sql_session.execute(
        update(Artist),
        maps,
    )
    sql_session.close()


def stats_cron(task_controller : TaskController, tracking_controller: TrackingController, batch_size : int, sql):
    sql_session = sql.get_session()
    artist_ids = tracking_controller.find_needs_stats_refresh(sql_session, batch_size)
    maps = []
    for artist_id in artist_ids:
        maps.append({'id': artist_id, 'stats_queued_at': datetime.now()})
        body = {"id": str(artist_id)}
        task_controller.enqueue_task('StatsQueue', 2, '/update-artist', body)       
    sql_session.execute(
        update(Artist),
        maps,
    )
    sql_session.close()

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
