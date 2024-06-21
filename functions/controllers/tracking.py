from lib import SongstatsClient, ErrorResponse, SpotifyClient, get_user
from datetime import datetime, timedelta
from google.cloud.firestore_v1.base_query import FieldFilter, BaseCompositeFilter, StructuredQuery

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

      if org_id not in data['watching']:
        data['watching'].append(org_id)
        data['watching_details'][org_id] = {
          "added_on": datetime.now().strftime("%Y-%m-%d")
        }
        if user_id not in data['found_by_first']:
          data['found_by_first'].append(user_id)
      
      if user_id not in data['found_by']:
        data['found_by'].append(user_id)
        data['found_by_details'][user_id] = {
          "found_on": datetime.now().strftime("%Y-%m-%d")
        }
      
      ref.update({
          "watching": data['watching'],
          "watching_details": data['watching_details'],
          "found_by_first": data['found_by_first'],
          "found_by": data['found_by'],
          "found_by_details": data['found_by_details'],
      })

      return 'Artist exists, added to tracking', 200
    
    # check if the ID is valid (this will raise a 400 if the artist is invalid)
    artist = self.spotify.get_artist(spotify_id)
    
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
        "stats_as_of": datetime(2000, 1, 1, 1, 1, 1, 1),
        "stat_dates": [],
        "eval_as_of": datetime(2000, 1, 1, 1, 1, 1, 1),
        "eval_status": "no_eval",
        "eval_distro_type": "unknown",
        "eval_distro": "",
        "eval_label": "",
        "eval_prios": "unknown",
        "watching": [org_id],
        "watching_details": {
          org_id: {
            "added_on": datetime.now().strftime("%Y-%m-%d"),
            "favorite": False,
            "tags": []
          }
        },
        "found_by": [user_id],
        "found_by_first": [user_id],
        "found_by_details": {
          user_id: {
            "found_on": datetime.now().strftime("%Y-%m-%d")
          }
        }
        # "organizations": [
        #   {
        #     "org_id": org_id,
        #     "favorite": False
        #   }
        # ],
        # "found_by": [
        #   {
        #     "organization": org_id,
        #     "user_id": user_id,
        #     "user_first": user['first_name'],
        #     "user_last": user['last_name'],
        #     "found_on": datetime.now().strftime("%Y-%m-%d")
        #   }
        # ],
    }
    for s in HOT_TRACKING_FIELDS:
      new_schema[f"stat_{s}__{HOT_TRACKING_FIELDS[s]}"] = []
    ref.set(new_schema)
    return 'success', 200
  
  def ingest_artist(self, spotify_id : str):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    print("[INGEST] has doc")
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
    print("[INGEST] has info")
    
    # get the stats now that we know the artist is in SS
    self.update_artist(spotify_id, is_ob=True)
    
    # add the additional info
    ref.update({
      "avatar": info['artist_info']['avatar'],
      "links": info['artist_info']['links'],
      "ob_status": "onboarded"
    })
    print("[INGEST] info updated")

    return 'success', 200
  
  # #####################
  # Stats
  # #####################
  
  def update_artist(self, spotify_id : str, is_ob=False):
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    print("[INGEST] has update doc")

    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')
    # check the artist is ingested - not needed
    # data = doc.to_dict()
    # if data['ob_status'] != 'ingested' and not is_ob:
    #   raise ErrorResponse('Artist not ingested', 401, 'Tracking')
    try:
      stats = self.songstats.get_stat_weeks(spotify_id, 8)
    except ErrorResponse as e:
      # Artist somehow got removed from songstats, but them back in OB
      if e.status_code == 404:
          ref.update({
            "ob_status": "waiting_ingest",
            "ob_wait_till": datetime.now() + timedelta(minutes=10)
          })
          return 'Waiting for data', 201
      raise e
    

    print("[INGEST] has stats")

    
    #  update the hot tracking stats on the artist
    update = {"stat_dates": stats['as_of'], "stats_as_of": datetime.now()}
    for s in HOT_TRACKING_FIELDS:
      update[f"stat_{s}__{HOT_TRACKING_FIELDS[s]}"] = stats['stats'][s] if s in stats['stats'] else []
    ref.update(update)
    print("[INGEST] stats updated")

    # TODO Add the deep stats subcollection
    return 'success', 200
  
  # ######################
  # Cron Support
  # ######################

  # def find_needs_ob_eval(self, limit: int):
  #   docs = self.db.collection("artists_v2").where(
  #       filter=FieldFilter('ob_status', "==", "needs_eval")
  #   ).limit(limit).get()
  #   ids = [d.id for d in docs]
  #   return ids

  def find_needs_ob_ingest(self, limit: int):
    needs_ingest = self.db.collection("artists_v2").where(
        filter=FieldFilter('ob_status', "==", "needs_ingest")
    ).limit(limit).get()
    ids = [d.id for d in needs_ingest]
    # if we can still do more, find some that are done waiting
    if len(ids) < limit:
      waiting_ingest_complete = self.db.collection("artists_v2").where(
          filter=BaseCompositeFilter(operator=StructuredQuery.CompositeFilter.Operator.AND, filters=[
            FieldFilter('ob_status', "==", "waiting_ingest"),
            FieldFilter('ob_wait_till', "<", datetime.now())
          ])
      ).limit(limit - len(ids)).get()
      for d in waiting_ingest_complete:
        ids.append(d.id)
    
    return ids
  
  def find_needs_stats_refresh(self, limit: int):
    docs = self.db.collection("artists_v2").where(
        filter=BaseCompositeFilter(operator=StructuredQuery.CompositeFilter.Operator.AND, filters=[
          FieldFilter('ob_status', "==", "onboarded"),
          FieldFilter('stats_as_of', "<", (datetime.now()-timedelta(days=1)))
        ])
    ).limit(limit).get()
    ids = [d.id for d in docs]
    return ids