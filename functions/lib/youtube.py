import requests
import json
from ytmusicapi import YTMusic
from .errors import ErrorResponse
from .evaluation import CopyrightEvaluator

class YoutubeClient():
  def __init__(self, token, alt_token):
    self.token = token
    self.alt_token = alt_token
    self.ytmusic = YTMusic()
    self.root_uri = "https://www.googleapis.com/youtube/v3"
    self.evaluator = CopyrightEvaluator()
  
  def get(self, path, data=None, alt_token = False):
    data['key'] = self.token if alt_token == False else self.alt_token
    res = requests.get(f"https://www.googleapis.com/youtube/v3{path}", headers= {
      "Content-Type": "application/json"
    },
    params=data)
    if res.status_code > 299:
      if res.status_code == 429:
        print("Youtube Rate Limiting")
      if res.status_code == 403:
        if alt_token == False:
          print("Youtube Quota Limiting - trying again with token")
          return self.get(path, data, True)
        else:
          print("Youtube Quota Limiting Alt - failed")
      raise ErrorResponse(res.json(), res.status_code, "Youtube")
    return res.json()
  
  def get_video(self, id):
    return self.get('/videos', data={
      'part':'snippet',
      'id':id
    })
  
  def get_description_from_video(self, video_id):
    res = self.get_video(video_id)
    video = res['items'][0]
    return video['snippet']['description']

  def get_description(self, artist, track):
    res = self.ytmusic.search(f"{artist} - {track}", 'songs', ignore_spelling=True)
    return self.get_description_from_video(res[0]['videoId'])
  
  def find_song(self, artist, track):
    print("finding song " + str(artist) + " " + str(track))
    res = self.ytmusic.search(f"{artist} - {track}", 'songs', ignore_spelling=True)
    print('res', res)
    if len(res) == 0:
      return None
    
    res = self.get_video(res[0]['videoId'])

    for video in res['items'][:5]:
      title = video['snippet']['title']
      channel_title = video['snippet']['channelTitle']
      print("comparing " + str(title) + " " + str(channel_title))
      if self.evaluator.is_probably_same_track(title, track, channel_title, artist):
        return video
    
    return None
  
  def get_watch_playlist(self, vid_id):
    res = self.ytmusic.get_watch_playlist(videoId=vid_id)
    return res
  
  def get_song(self, vid_id):
    res = self.ytmusic.get_song(videoId=vid_id)
    return res
  
  def get_artist(self, channel_id):
    res = self.ytmusic.get_artist(channelId=channel_id)
    return res

    