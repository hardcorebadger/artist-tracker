import base64
import traceback
from datetime import timedelta, datetime

import requests
from google.cloud.firestore_v1 import Client, FieldFilter, SERVER_TIMESTAMP
from sqlalchemy import func, select, and_
from sqlalchemy.exc import DatabaseError

from .models import SpotifyToken
from .errors import ErrorResponse
from requests.exceptions import JSONDecodeError

from lib.config import SPOTIFY_CLIENT_SECRET, SPOTIFY_CLIENT_ID, SPOTIFY_ALT_CLIENT_ID, SPOTIFY_ALT_CLIENT_SECRET, SPOTIFY_USER_FACING_CLIENT_SECRET, SPOTIFY_USER_FACING_CLIENT_ID

last_artist = None
last_playlist = None
# spotify_playlists = dict()

class SpotifyClient():
  def __init__(self, db: Client):
    self.client_id = SPOTIFY_CLIENT_ID.value
    self.client_secret = SPOTIFY_CLIENT_SECRET.value
    self.alt_client_id = SPOTIFY_ALT_CLIENT_ID.value
    self.alt_client_secret = SPOTIFY_ALT_CLIENT_SECRET.value
    self.user_client_id = SPOTIFY_USER_FACING_CLIENT_ID.value
    self.user_client_secret = SPOTIFY_USER_FACING_CLIENT_SECRET.value
    self.access_token = None
    self.alt_token = None
    self.user_token = None
    self.authorized = False
    self.authorizedAlt = False
    self.authorizedUser = False
    self.db = db
    self.root_uri = "https://api.spotify.com/v1"

  def authorize(self, alt_token=False):
    headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
      "grant_type": "client_credentials",
      "client_id": self.alt_client_id if alt_token else self.client_id,
      "client_secret": self.alt_client_secret if alt_token else self.client_secret
    }
    print("Spotify Auth:" + (alt_token if alt_token else ' default'))

    response = requests.post(f"https://accounts.spotify.com/api/token", headers=headers, data=data).json()
    if 'error' in response:
      if alt_token == 'alt':
        self.alt_token = None
      elif alt_token == 'user':
        self.user_token = None
      else:
        self.access_token = None
    else:
      if alt_token == 'alt':
        self.authorizedAlt = True
        self.alt_token = response['access_token']
      elif alt_token == 'user':
        self.authorizedUser = True
        self.user_token = response['access_token']
      else:
        self.authorized = True
        self.access_token = response['access_token']

  def get(self, path, data=None, alt_token=False, attempt=1):
    if (self.authorizedAlt == False and alt_token == 'alt') or (self.authorized == False and alt_token == False) or (self.authorizedUser == False and alt_token == 'user'):
      self.authorize(alt_token=alt_token)
    print("Spotify Request: " + path + ' ' + (alt_token if alt_token else 'default'))
    res = requests.get(f"{self.root_uri}{path}", headers= {
      "Authorization": f"Bearer {self.alt_token if alt_token == 'alt' else (self.user_token if alt_token == 'user' else self.access_token)}"
    }, params=data)

    # error handling
    if res.status_code > 299:

      # Catch token expiration and get a new one
      if res.status_code == 401:
        before = self.alt_token if alt_token == 'alt' else ( self.user_token if alt_token == 'user' else self.access_token)
        print("Spotify Access Token Expired, Refreshing")
        self.authorize(alt_token)
        # If it worked, retry
        if (alt_token == 'alt' and self.alt_token != before) or (self.access_token != before and alt_token == False) or (self.user_token != before and alt_token == 'user'):
          return self.get(path, data, alt_token=alt_token)

      # Catch rate limits and switch to a 299 so the task doesn't restart
      if res.status_code == 429:
        print("Spotify Rate Limiting")
        if 'retry-after' in res.headers:
          print(f"Retry After: {res.headers['retry-after']}")
        if attempt == 1:
          print("trying with opposite token")
          return self.get(path, data, alt_token=('alt' if alt_token == False else False), attempt=attempt + 1)
        raise ErrorResponse({"error":res.text}, 299, "Spotify")
      
      # Throw back the errors
      try:
        jsone = res.json()
        raise ErrorResponse(jsone, res.status_code, "Spotify")
      except JSONDecodeError as e:
        raise ErrorResponse({"error":res.text}, res.status_code, "Spotify")
      
    return res.json()
  
  def get_artist(self, id, alt_token=False):
      check_cache = self.db.collection("spotify_cache").where(filter=FieldFilter(
        "spotify_id", "==", id
      )).where(filter=FieldFilter(
        'type', '==', 'artist'
      )).order_by('created_at', "DESCENDING").get()

      existing = check_cache.pop() if len(check_cache) > 0 else None
      if existing and existing.get('created_at') > datetime.now(existing.get('created_at').tzinfo) - timedelta(days=1):
        return existing.to_dict().get('data')
      else:
        artist = self.get(path=f"/artists/{id}", alt_token=alt_token)
        if existing:
          existing.reference.set({"id": existing.id, "data": artist, "created_at": SERVER_TIMESTAMP, "type": "artist", "spotify_id": id})
          print("Updated artist in cache: " + id)
        else:
          cache = {"data": artist, "spotify_id": id, "type": "artist", "created_at": SERVER_TIMESTAMP}
          update_time, cache_ref = self.db.collection("spotify_cache").add(cache)
          print("Added artist to cache: " + id)
        return artist

  def get_artist_top_tracks(self, id):
    return self.get(f"/artists/{id}/top-tracks", data={"market":"US"})

  def get_album(self, id):
    return self.get(f"/albums/{id}")
  
  def get_artist_albums(self, id):
    return self.get(f"/artists/{id}/albums", data={'include_groups':'album,single'})
  
  def get_albums(self, ids):

    check_cache = self.db.collection("spotify_cache").where(filter=FieldFilter(
        "spotify_id", "in", ids
      )).where(filter=FieldFilter(
      'type', '==', 'album'
    )).get()
    album_data = []
    missing_ids = []
    for id in ids:
      found = False
      for check in check_cache:
        if check.get('spotify_id') == id:
          found = True
          album_data.append(check.get('data'))
      if found == False:
        missing_ids.append(id)
    if len(missing_ids) > 0:
      idp = ",".join(id for id in missing_ids)
      albums = self.get(f"/albums", data={'ids': idp})
      for album in albums['albums'] if 'albums' in albums else []:
        album_data.append(album)
        cache = {"data": album, "spotify_id": album.get('id'), "type": "album", "created_at": SERVER_TIMESTAMP}
        update_time, cache_ref = self.db.collection("spotify_cache").add(cache)
        print(f"Added cache with id {cache_ref.id}: " + album.get('id'))

    return album_data

  def get_artists(self, ids):

    check_cache = self.db.collection("spotify_cache").where(filter=FieldFilter(
      "spotify_id", "in", ids
    )).where(filter=FieldFilter(
      'type', '==', 'artist'
    )).get()
    artist_data = []
    missing_ids = []
    for id in ids:
      found = False
      for check in check_cache:
        if check.get('spotify_id') == id and check.get('created_at') > datetime.now(check.get('created_at').tzinfo) - timedelta(days=1):
          found = True
          artist_data.append(check.get('data'))
      if found == False:
        missing_ids.append(id)
    if len(missing_ids) > 0:
      idp = ",".join(id for id in missing_ids)
      artists = self.get(f"/artists", data={'ids': idp})
      for artist in artists['artists'] if 'artists' in artists else []:
        artist_data.append(artist)
        cache = {"data": artist, "spotify_id": artist.get('id'), "type": "artist", "created_at": SERVER_TIMESTAMP}
        update_time, cache_ref = self.db.collection("spotify_cache").add(cache)
        print(f"Added cache with id {cache_ref.id}: " + artist.get('id'))

    return artist_data
  
  def get_playlist(self, id, alt_token=False):
    global last_playlist
    if last_playlist is not None and last_playlist['id'] == id:
      return last_playlist
    playlist = self.get(f"/playlists/{id}", alt_token=alt_token)
    last_playlist = playlist
    return playlist

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
    for album in albums:
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
    for album in albums:
      copyrights = album['copyrights']
      for c in copyrights:
        if c['type'] == 'P':
          plines.append({'line': c['text'], 'date': album['release_date']})
    return plines
  
  def get_playlist_artists(self, id, alt_token=False):
    p = self.get_playlist(id, alt_token=alt_token)
    artist_ids = []
    dedupe_set = set()
    for i in p['tracks']['items']:
      if i['track'] != None:
        id = i['track']['artists'][0]['id']
        if id not in dedupe_set:
          dedupe_set.add(id)
          artist_ids.append(id)
    image = None
    if len(p.get('images', list())) > 0:
      image = p.get('images')[0]['url']
    return artist_ids, p['name'], image
  
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

  def get_token_from_code(self, sql_session, uid, org_id, code, redirect_uri, state):
    client_id = self.alt_client_id
    existing = sql_session.scalars(select(SpotifyToken).where(and_(SpotifyToken.state == state, SpotifyToken.client_id == client_id))).first()
    if existing is not None:
      return existing.as_dict()
    res = requests.post("https://accounts.spotify.com/api/token", headers= {
      "Authorization": f"{self.encode_client_credentials(client_id, self.alt_client_secret)}",
      'Content-Type': 'application/x-www-form-urlencoded',
      "Accept": "application/json"
    }, data={
      "grant_type": "client_credentials",
      "code": code,
      "redirect_uri": redirect_uri,
    })

    json = res.json()
    if 'access_token' in json:
      try:
        expires_in = json['expires_in']
        expires_at = func.now() + timedelta(seconds=(int(expires_in) - 10))
        refresh = json['refresh_token'] if 'refresh_token' in json else None
        token_record = SpotifyToken(user_id=uid, organization_id=org_id, token=json['access_token'], refresh_token=refresh, expires_at=expires_at, client_id=client_id, state=state)
        sql_session.add(token_record)
        sql_session.commit()
      except Exception as e:
        sql_session.rollback()
        existing = sql_session.scalars(
          select(SpotifyToken).where(and_(SpotifyToken.state == state, SpotifyToken.client_id == client_id))).first()
        if existing is not None:
          return existing.as_dict()
        else:
          print(e)
          return {'error': 'could not insert token'}
      return token_record.as_dict()
    else:
      return json


  def encode_client_credentials(self, client_id, client_secret):
    credentials = f"{client_id}:{client_secret}"
    credentials_bytes = credentials.encode('ascii')
    base64_credentials = base64.b64encode(credentials_bytes).decode('ascii')
    return "Basic " + base64_credentials