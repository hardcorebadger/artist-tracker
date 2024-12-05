import requests
import json
from .errors import ErrorResponse
from requests.exceptions import JSONDecodeError

class SpotifyClient():
  def __init__(self, client_id, client_secret):
    self.client_id = client_id
    self.client_secret = client_secret
    self.access_token = None
    self.root_uri = "https://api.spotify.com/v1"

  def authorize(self):
    headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
      "grant_type": "client_credentials",
      "client_id": self.client_id,
      "client_secret": self.client_secret
    }

    response = requests.post(f"https://accounts.spotify.com/api/token", headers=headers, data=data).json()
    if 'error' in response:
      self.access_token = None
    else:
      self.access_token = response['access_token']

  def get(self, path, data=None):
    res = requests.get(f"{self.root_uri}{path}", headers= {
      "Authorization": f"Bearer {self.access_token}"
    },
    params=data)

    # error handling
    if res.status_code > 299:

      # Catch token expiration and get a new one
      if res.status_code == 401:
        before = self.access_token
        print("Spotify Access Token Expired, Refreshing")
        self.authorize()
        # If it worked, retry
        if self.access_token != before:
          return self.get(path, data)
      
      # Catch rate limits and switch to a 299 so the task doesn't restart
      if res.status_code == 429:
        print("Spotify Rate Limiting")
        if 'retry-after' in res.headers:
          print(f"Retry After: {res.headers['retry-after']}")
        raise ErrorResponse({"error":res.text}, 299, "Spotify")
      
      # Throw back the errors
      try:
        jsone = res.json()
        raise ErrorResponse(jsone, res.status_code, "Spotify")
      except JSONDecodeError as e:
        raise ErrorResponse({"error":res.text}, res.status_code, "Spotify")
      
    return res.json()
  
  def get_artist(self, id):
    return self.get(f"/artists/{id}")
  
  def get_artist_top_tracks(self, id):
    return self.get(f"/artists/{id}/top-tracks", data={"market":"US"})

  def get_album(self, id):
    return self.get(f"/albums/{id}")
  
  def get_artist_albums(self, id):
    return self.get(f"/artists/{id}/albums", data={'include_groups':'album,single'})
  
  def get_albums(self, ids):
    idp = ",".join(id for id in ids)
    return self.get(f"/albums", data={'ids':idp})
  
  def get_playlist(self, id):
    return self.get(f"/playlists/{id}")

  def trim_link_id(self, url):
    return url.split('/')[-1]

  def get_artist_recent_plines(self, id):
    album_page = self.get_artist_albums(id)
    if len(album_page['items']) == 0:
      return []
    ids = []
    for a in album_page['items']:
      ids.append(a['id'])

    ids = ids[:4]
    albums = self.get_albums(ids)
    plines=[]
    for album in albums['albums']:
      copyrights = album['copyrights']
      for c in copyrights:
        if c['type'] == 'P':
          plines.append(c['text'])
    return plines
  
  def get_artist_recent_plines_with_dates(self, id):
    album_page = self.get_artist_albums(id)
    if len(album_page['items']) == 0:
      return []
    ids = []
    for a in album_page['items']:
      ids.append(a['id'])

    ids = ids[:4]
    albums = self.get_albums(ids)
    plines=[]
    for album in albums['albums']:
      copyrights = album['copyrights']
      for c in copyrights:
        if c['type'] == 'P':
          plines.append({'line': c['text'], 'date': album['release_date']})
    return plines
  
  def get_playlist_artists(self, id):
    p = self.get_playlist(id)
    artist_ids = []
    dedupe_set = set()
    for i in p['tracks']['items']:
      if i['track'] != None:
        id = i['track']['artists'][0]['id']
        if id not in dedupe_set:
          dedupe_set.add(id)
          artist_ids.append(id)
    return artist_ids, p['name']
  
  def find_artist(self, name):
    search = self.get('/search', {
      "q":name,
      "type":"artist",
      "market":"US",
      "limit":1
    })
    return search['artists']['items'][0] if len(search['artists']['items']) > 0 else None
  
  def url_to_id(self, url, prefix='artist'):
    # Splitting the URL at "playlist/"
    parts = url.split(f"{prefix}/")
    if len(parts) > 1:
        # Further split the resulting string at "?" to isolate the ID
        id_part = parts[1].split("?")[0]
        return id_part
    else:
        return 'invalid'