from lib import SongstatsClient, ErrorResponse
from datetime import datetime, timedelta

class TrackingController():
  def __init__(self, songstats : SongstatsClient, db):
    self.songstats = songstats
    self.db = db
  
  def add_ingest_update_artist(self, spotify_id, user_id, org_id):
    msg, status = self.add_artist(spotify_id, user_id, org_id)
    if status != 200:
      return msg, status
    msg, status = self.ingest_artist(spotify_id)
    if status != 200:
      return msg, status
    return self.update_artist(spotify_id, datetime.now()-timedelta(days=1))
  
  def ingest_update_artist(self, spotify_id):
    msg, status = self.ingest_artist(spotify_id)
    if status != 200:
      return msg, status
    return self.update_artist(spotify_id, datetime.now()-timedelta(days=1))

  def add_artist(self, spotify_id, user_id, org_id):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()

    # if artist exists add the user/org to tracking
    if doc.exists:
      data = doc.to_dict()
      new_orgs = list(set(data['organizations'] + [org_id]))
      new_users = list(set(data['found_by'] + [user_id]))
      ref.update({
          "organizations": new_orgs,
          "found_by": new_users,
      })
      return 'Artist exists, added to tracking', 200
    
    # create an artist
    ref.set({
        "name": "Unknown",
        "spotify_url": f'https://open.spotify.com/artist/{spotify_id}',
        "spotify_id": spotify_id,
        "organizations": [org_id],
        "found_by": [user_id],
        "songstat_state": "new"
    })
    return 'success', 200
  
  def ingest_artist(self, spotify_id : str):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')
    
    # hit SS for the info
    try:
      res = self.songstats.get_artist_info(spotify_id)
    except ErrorResponse as e:
      # Artist didn't exist in songstats, need to requeue 
      if e.status_code == 404:
          ref.update({"songstat_state": "waiting"})
          return 'Waiting for data', 201
      raise e
  
    # if we got it, update the record
    ref.update({
      "name": res['artist_info']['name'],
      "avatar": res['artist_info']['avatar'],
      "links": res['artist_info']['links'],
      "songstat_state": "ingested"
    })
    return 'success', 200
  
  def update_artist(self, spotify_id : str, as_of : datetime):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')
    # check the artist is ingested
    data = doc.to_dict()
    if data['songstat_state'] != 'ingested':
      raise ErrorResponse('Artist not ingested', 401, 'Tracking')

    # hit SS for the historic stats going back 8 weeks rel (9 abs) from as_of
    stats = self.songstats.get_stat_weeks(spotify_id, as_of, 9)
    #  update the stats on the artist
    r = ref.update({"stats": stats})
    return 'success', 200
  