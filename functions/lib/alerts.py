import requests
import json
import os
from .errors import ErrorResponse

class SendblueClient():
  def __init__(self, key, secret):
    self.key = key
    self.secret = secret
    self.root_uri = f"https://api.sendblue.co/api"

  def post(self, path, data=None):
    headers = {
        "sb-api-key-id": self.key,
        "sb-api-secret-key": self.secret,
        "content-type": "application/json"
    }
    res = requests.post(f"{self.root_uri}{path}", headers=headers,
    json=data)
    if res.status_code > 299:
      raise ErrorResponse(res.json(), res.status_code, "Airtable")
    return res.json()

  def send_message(self, number, message):
      self.post('/send-message', data={
        "number": number,
        "content": message,
        # "send_style": "invi",
        # "media_url": "https://picsum.photos/200/300.jpg",
        # "status_callback": "https://example.com/message-status/1234abcd"
      })