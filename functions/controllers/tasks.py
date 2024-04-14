import json
from google.cloud import tasks_v2
from lib import ErrorResponse
import traceback

class TaskController():
  def __init__(self, project_id, location, api_root, queue):
    self.project_id = project_id
    self.location = location
    self.api_root = api_root
    self.queue = queue
    
  
  def enqueue_task(self, path, data={}):
    try:
        tasks_client = tasks_v2.CloudTasksClient()
        queue = f"projects/{self.project_id}/locations/{self.location}/queues/{self.queue}"
        task = tasks_v2.Task(http_request={
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{self.api_root}{path}",
            "headers": {
                "Content-type": "application/json"
            },
            "body": json.dumps(data).encode()
        })
        tasks_client.create_task(parent=queue, task=task)
        return True
    except Exception as e:
        traceback.print_exc()
        raise ErrorResponse("Failed to enqueue task", 500)