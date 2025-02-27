from google.cloud.firestore_v1 import Client
from lib import SongstatsClient, ErrorResponse, SpotifyClient, YoutubeClient, CloudSQLClient, CopyrightEvaluator
from .artists import artist_with_meta
from google.cloud.firestore_v1.base_query import FieldFilter

class LookalikeController():
  def __init__(self, spotify: SpotifyClient, songstats : SongstatsClient, youtube: YoutubeClient, sql, db: Client):
    self.spotify = spotify
    self.songstats = songstats
    self.youtube = youtube
    self.db = db
    self.sql = sql
    self.evaluator = CopyrightEvaluator()

  def mine_lookalikes(self, artist_id):
    sql_ref = artist_with_meta(sql_session=self.sql, artist_id=artist_id)

    # Get the artist from spotify - on cache if possible
    check_cache = self.db.collection("spotify_cache").where(filter=FieldFilter(
        "spotify_id", "==", sql_ref.spotify_id
    )).where(filter=FieldFilter(
        'type', '==', 'top-tracks'
    )).order_by('created_at', "DESCENDING").get()

    cache_ref = check_cache.pop() if len(check_cache) > 0 else None
    if cache_ref != None:
      top_tracks = cache_ref.to_dict()['data']
    else:
      top_tracks = self.spotify.get_artist_top_tracks(sql_ref.spotify_id)['tracks']
        
    # Find the artist on youtube
    yt_track = self.youtube.find_song(sql_ref.name, top_tracks[0]['name'])
    yt_artist = yt_track['snippet']['channelId']
    print("yt_artist", yt_artist)
    # Get YT recommendations
    recommendations = self.youtube.get_watch_playlist(yt_track['id'])

    to_queue = []
    print("found", recommendations)
    for rec in recommendations['tracks'][:50]:
      # skip the source artist
      if rec['artists'][0]['id'] == yt_artist:
        continue

      title = rec['title']
      artist = rec['artists'][0]['name']

      # Check if they appear to be unsigned
      rec_song_yt = self.youtube.get_video(rec['videoId'])
      description = rec_song_yt['items'][0]['snippet']['description']
      distro, pline, distro_type = self.evaluator.eval_youtube_rights(artist, description)
      # print(f"{distro} - {distro_type} : {pline}")
      print(title, artist, distro_type)
      # Skip them if they are signed
      if distro_type != "diy":
        continue
      else:
        # Find them in spotify - TODO expensive may want to queue?
        song = self.spotify.find_song(artist, title)
        
        # Add them to ingest queue
        to_queue.append({"track_name": song['name'], "track_id": song['id'], "name": song['artists'][0]['name'], "spotify_id": song['artists'][0]['id']})

    print("to_queue", to_queue)
    return {'queue':to_queue}