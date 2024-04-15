from lib import SongstatsClient, ErrorResponse, SpotifyClient, get_user
from datetime import datetime, timedelta

HOT_TRACKING_FIELDS = {
  "spotify__streams_current": "rel",
  "youtube__video_views_total": "rel",
  "tiktok__views_total": "rel",
  "shazam__shazams_total": "rel",
  "instagram__followers_total": "rel"
}

class TrackingController():
  def __init__(self, spotify: SpotifyClient, songstats : SongstatsClient, db):
    self.spotify = spotify
    self.songstats = songstats
    self.db = db
  
  # #####################
  # Onboarding
  # #####################
  
  def add_ingest_update_artist(self, spotify_id, user_id, org_id):
    msg, status = self.add_artist(spotify_id, user_id, org_id)
    if status != 200:
      return msg, status
    return self.ingest_artist(spotify_id)
  
  def add_artist(self, spotify_id, user_id, org_id):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()

    # if artist exists add the user/org to tracking
    if doc.exists:
      data = doc.to_dict()
      user = get_user(user_id, self.db)
      new_orgs = list(set(data['organizations'] + [{
        "org_id": org_id,
        "favorite": False
      }]))
      new_users = list(set(data['found_by'] + [{
        "organization": org_id,
        "user_id": user_id,
        "user_first": user['first_name'],
        "user_last": user['last_name'],
        "found_on": datetime.now().strftime("%Y-%m-%d")
      }]))
      ref.update({
          "organizations": new_orgs,
          "found_by": new_users,
      })
      return 'Artist exists, added to tracking', 200
    
    # check if the ID is valid (this will raise a 400 if the artist is invalid)
    artist = self.spotify.get_artist(spotify_id)
    user = get_user(user_id, self.db)
    
    # create an artist
    new_schema = {
        "id": spotify_id,
        "spotify_id": spotify_id,
        "spotify_url": f"https://open.spotify.com/artist/{spotify_id}",
        "name": artist['name'],
        "genres": artist['genres'],
        "ob_status": "needs_ingest",
        "ob_wait_till": None,
        "avatar": None,
        "stat_as_of": [],
        "eval_status": "no_eval",
        "eval_distro_type": "unknown",
        "eval_distro": "",
        "eval_label": "",
        "eval_prios": "unknown",
        "organizations": [
          {
            "org_id": org_id,
            "favorite": False
          }
        ],
        "found_by": [
          {
            "organization": org_id,
            "user_id": user_id,
            "user_first": user['first_name'],
            "user_last": user['last_name'],
            "found_on": datetime.now().strftime("%Y-%m-%d")
          }
        ],
    }
    for s in HOT_TRACKING_FIELDS:
      new_schema[f"stat_{s}__{HOT_TRACKING_FIELDS[s]}"] = []
    ref.set(new_schema)
    return 'success', 200
  
  def ingest_artist(self, spotify_id : str):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')
    
    data = doc.to_dict()

    # hit SS for the info
    try:
      info = self.songstats.get_artist_info(spotify_id)
    except ErrorResponse as e:
      # Artist didn't exist in songstats, need to requeue 
      if e.status_code == 404:
          ref.update({
            "ob_status": "waiting_ingest",
            "ob_wait_till": datetime.now() + timedelta(minutes=10)
          })
          return 'Waiting for data', 201
      raise e
    
    # get the stats now that we know the artist is in SS
    self.update_artist(spotify_id, is_ob=True)
    
    # add the additional info
    ref.update({
      "avatar": info['artist_info']['avatar'],
      "links": info['artist_info']['links'],
      "ob_status": "needs_eval" if data['ob_status'] != "onboarded" else "onboarded"
    })
    return 'success', 200
  
  # #####################
  # Stats
  # #####################
  
  def update_artist(self, spotify_id : str, is_ob=False):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')
    # check the artist is ingested
    data = doc.to_dict()
    if data['ob_status'] != 'ingested' and not is_ob:
      raise ErrorResponse('Artist not ingested', 401, 'Tracking')

    # hit SS for the historic stats going back 8 weeks rel (9 abs) from as_of
    stats = self.songstats.get_stat_weeks(spotify_id, 9)
    
    #  update the hot tracking stats on the artist
    update = {"stat_as_of": stats['as_of']}
    for s in HOT_TRACKING_FIELDS:
      update[f"stat_{s}__{HOT_TRACKING_FIELDS[s]}"] = stats['stats'][s][HOT_TRACKING_FIELDS[s]] if s in stats['stats'] else []
    ref.update(update)
    # TODO Add the deep stats subcollection
    return 'success', 200
    