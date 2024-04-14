from datetime import datetime
from fuzzywuzzy import fuzz
from lib import ErrorResponse, AirtableClient, SpotifyClient, YoutubeClient, eval_youtube_rights, eval_spotify_rights

class AirtableV1Controller():
  def __init__(self, airtable : AirtableClient, spotify : SpotifyClient, youtube : YoutubeClient):
      self.airtable = airtable
      self.spotify = spotify
      self.youtube = youtube

  def find_missing_spotify_links(self):
    res = self.airtable.get_artists_where('{Spotify URL}=""')
    return res['records']

  def find_new_evals(self):
    res = self.airtable.get_artists_where('OR({Status}="", {Status}="New")')
    return res['records']

  def find_missing_names(self):
      res = self.airtable.get_artists_where('{Artist}=""')
      return res['records']

  def artist_link_name(self, record_id):
      record = self.airtable.get_artist_by_id(record_id)
      if 'Artist' in record['fields'] and (record['fields']['Artist'] == "NA" or record['fields']['Artist'] != ""):
          return
      if record['fields']['Status'] == "Invalid":
          return
    
      url = record['fields']['Spotify URL']
      try:
          s_artist = self.spotify.get_artist(self.spotify.url_to_id(url))
      except ErrorResponse as e:
          invalid_id = e.data['error']['message'] == 'invalid id'
          if not invalid_id:
              raise e
          else:
              self.airtable.update_artists([{
                  'id': record_id,
                  'fields': {
                      "Status": "Invalid"
                  }
              }])
              return
      id = self.spotify.url_to_id(url)
      self.airtable.update_artists([{
          'id': record_id,
          'fields': {
              "Artist": s_artist['name'],
              'Spotify Name': s_artist['name'],
              'Spotify URL': f"https://open.spotify.com/artist/{id}"
          }
      }])

  def artist_link_spotify(self, record_id):  
    record = self.airtable.get_artist_by_id(record_id)
    if 'Spotify URL' in record['fields'] and (record['fields']['Spotify URL'] == "NA" or record['fields']['Spotify URL'] != ""):
      return
    mrc_artist_name = record['fields']['Artist']
    artist = self.spotify.find_artist(mrc_artist_name)
    if artist == None:
      print(f"unlinked - found nothing for {mrc_artist_name}")
      self.airtable.update_artists([{
        'id': record_id,
        'fields': {
            "Spotify URL": "NA"
        }
      }])
      return
    
    name = artist['name']
    spotify_id = artist['id']
    def fuzzy_equal(s1, s2, threshold=80):
      s1 = s1.lower().strip()
      s2 = s2.lower().strip()
      sim = fuzz.partial_ratio(s1, s2)
      return sim > threshold
    if not fuzzy_equal(name, mrc_artist_name, 92):
      print(f"unlinked {mrc_artist_name} != {name}")
      self.airtable.update_artists([{
        'id': record_id,
        'fields': {
            "Spotify URL": "NA"
        }
      }])
    else:
      print(f"linked {mrc_artist_name} = {name}")
      self.airtable.update_artists([{
        'id': record_id,
        'fields': {
            "Spotify URL": f"https://open.spotify.com/artist/{spotify_id}",
            "Spotify Name": name
        }
      }])

  def copyright_eval(self, record_id):
      # Get the record
      record = self.airtable.get_artist_by_id(record_id)

      # Check if we already ingested it
      if 'Status' in record['fields'] and record['fields']['Status'] != 'New':
          return
      
      # get top tracks
      artist_name = record['fields']['Artist']
      sid = self.spotify.url_to_id(record['fields']['Spotify URL'])
      if sid == "invalid":
        self.airtable.update_artists([{
            'id': record_id,
            'fields': {
                "Status": 'Unknown'
            }
        }])
        return
      
      top_tracks = self.spotify.get_artist_top_tracks(sid)['tracks']

      # find tracks with matching videos and eval them
      yt_evals = []
      for t in top_tracks:
          date = t['album']['release_date']
          try:
              date_object = datetime.strptime(date, '%Y-%m-%d').date()
          except ValueError as e:
              date_object = datetime.strptime(date, '%Y').date()
          yt_track = self.youtube.find_song(artist_name, t['name'])
          if yt_track == None:
              continue
          desc = yt_track['snippet']['description']
          distro, label, distro_type = eval_youtube_rights(artist_name, desc)
          yt_evals.append( {
              "type": "youtube",
              'spotify_track_name': t['name'],
              'spotify_artist_name': artist_name,
              'video_title': yt_track['snippet']['title'],
              'video_channel': yt_track['snippet']['channelTitle'],
              'video_description': yt_track['snippet']['description'],
              'spotify_release_date': t['album']['release_date'],
              'distributor': distro,
              'label': label,
              'distribution_type': distro_type,
              'release': date_object
          } )
          if len(yt_evals) >= 3:
              break
      # sort by release date
      if len(yt_evals) > 0:
        yt_evals = sorted(yt_evals, key=lambda x: x['release'], reverse=True)

      # eval spotify
      sp_evals = []
      p_lines = self.spotify.get_artist_recent_plines_with_dates(sid)

      for line in p_lines:
          label, distro_type = eval_spotify_rights(line['line'], artist_name)
          try:
              date_object = datetime.strptime(line['date'], '%Y-%m-%d').date()
          except ValueError as e:
              date_object = datetime.strptime(line['date'], '%Y').date()
          sp_evals.append({
              "type": "spotify",
              'distributor': "N/A",
              'label': label,
              'distribution_type': distro_type,
              'release': date_object,
              'pline': line['line']
          })

      if len(sp_evals) == 0 and len(yt_evals) == 0:
          self.airtable.update_artists([{
              'id': record_id,
              'fields': {
                  "Status": 'Unknown'
              }
          }])
          return
          
      # NEW
      # both can return unknown if nothing can be gleaned from the rights
      # YT unknowns should be treated as 'probably DIY', there is a predictable structure to legit distro copyrights
      # SP unknowns should just be ignored, the structure is less predicatable, so doesn't mean anything, also doesn't check for artist name lookalikes
      
      # if everything is DIY or Unknown, it's DIY
      # if everything is Unknown, it's DIY
      # if there are Indie/Major in there, we have to decide if they are really signed or if its one off deals
      main_eval = None
      yt_flags = 0
      for eval in yt_evals:
          if eval['distribution_type'] == 'Indie' or eval['distribution_type'] == 'Major':
              yt_flags = yt_flags + 1
              main_eval = eval
      sp_flags = 0
      for eval in sp_evals:
          if eval['distribution_type'] == 'Indie' or eval['distribution_type'] == 'Major':
              sp_flags = sp_flags + 1
              if main_eval == None:
                  main_eval = eval
      
      # Fully clean
      if yt_flags == 0 and sp_flags == 0:
          if len(yt_evals) > 0:
              main_eval = yt_evals[0]
          elif len(sp_evals) > 0:
              main_eval = sp_evals[0]
          status = "Unsigned"
          priors = "No Prior Affiliations"
      else:
          priors = "Prior Affiliations"
          if (len(sp_evals) == 0 or sp_evals[0]['distribution_type'] == 'DIY') and (len(yt_evals) == 0 or yt_evals[0]['distribution_type'] == 'DIY'):
              if len(yt_evals) > 0:
                main_eval = yt_evals[0]
              elif len(sp_evals) > 0:
                main_eval = sp_evals[0]
              status = "Unsigned"
          else:
              status = "Signed"

      def dump_eval(eval):
          if eval['type'] == 'spotify':
              return f"Spotify Eval: {eval['distribution_type']} | {eval['distributor']} | {eval['label']}\n{eval['pline']}\n\n"
          else:
              return f"Youtube Eval: {eval['distribution_type']} | {eval['distributor']} | {eval['label']}\n{eval['video_title']} | {eval['video_channel']}\n{eval['video_description']}\n\n"
      
      def dump_evals(evals):
          dump = ""
          for e in evals:
              dump += dump_eval(e)
          return dump
      
      sp_plines = [l['line'] for l in p_lines]

      self.airtable.update_artists([{
          'id': record_id,
          'fields': {
              "Status": status,
              "Distribution Type": main_eval['distribution_type'],
              "Distributor": main_eval['distributor'],
              "Label": main_eval['label'],
              "Back Catalog": priors,
              "Copyright Evaluation": f"Main Eval\n{dump_eval(main_eval)}\n\nYoutube\n{dump_evals(yt_evals)}\n\nSpotify\n{dump_evals(sp_evals)}",
              "P Lines": ", ".join(sp_plines)
          }
      }])

