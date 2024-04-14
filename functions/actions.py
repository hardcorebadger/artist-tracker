
from controllers import AirtableV1Controller, TaskController

def get_user(uid, db):
    ref = db.collection("users").document(uid)
    doc = ref.get()
    data = doc.to_dict()
    return data

def airtable_v1_cron(task_controller : TaskController, airtable_v1_controller: AirtableV1Controller):
    jobs_added = 0

    # link spotify
    records = airtable_v1_controller.find_missing_spotify_links()
    if len(records) > 0:
      for r in records[:60]:
        if jobs_added >= 60:
            break
        body = {"record_id": r['id']}
        task_controller.enqueue_task('/link-spotify', body)
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
        task_controller.enqueue_task('/copyright-eval', body)
        jobs_added = jobs_added + 1
      # wait till next job to move onto new task types
      return
