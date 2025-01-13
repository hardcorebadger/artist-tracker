import json
from google.cloud import tasks_v2
import traceback

from lib import ErrorResponse


class TaskController():
  def __init__(self, project_id, location, v1_api_root, v2_api_root, v3_api_root):
    self.project_id = project_id
    self.location = location
    self.v1_api_root = v1_api_root
    self.v2_api_root = v2_api_root
    self.v3_api_root = v3_api_root
    
  
  def enqueue_task(self, queue_name, version, path, data={}):
    api_root = self.v1_api_root if version == 1 else (self.v2_api_root if version == 2 else self.v3_api_root)
    try:
        tasks_client = tasks_v2.CloudTasksClient()
        queue = f"projects/{self.project_id}/locations/{self.location}/queues/{queue_name}"
        task = tasks_v2.Task(http_request={
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{api_root}{path}",
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