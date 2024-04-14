from lib import SpotifyClient, YoutubeClient, ErrorResponse
from datetime import datetime, timedelta
import re
from fuzzywuzzy import fuzz

#     "copyright_eval" : {
#         "signed_status": SIGNED UNSIGNED UNKNOWN,
#         "distro_type": MAJOR INDIE DIY UNKNOWN,
#         "distro": str | null,
#         "label": str | null,
#         "back_catalog": PRIORS NO_PRIORS UNKNOWN,
#         "evals": f"Main Eval\n{dump_eval(main_eval)}\n\nYoutube\n{dump_evals(yt_evals)}\n\nSpotify\n{dump_evals(sp_evals)}",
#         "p_lines": ", ".join(sp_plines)
#     }

YT_DIY_DISTROS = [
   "DistroKid", "Ditto", "TuneCore", "CDBaby", "United Masters", "Symphonic", "EVEARA", "SongCast", "Too Lost", "Amuseio", "Repost Network", "IIP-DDS", "N/A"
]
YT_MAJOR_DISTROS = [
   "The Orchard Enterprises", "Universal Music Group", "Warner Records Inc", "Sony Entertainment Group", "Atlantic Records", "Ingrooves", "Columbia", "Epic", "Alamo", "Arista Records", "300 Entertainment"
]
YT_KNOWN_INDIE_DISTROS = [
   "Stem Disintermedia Inc.", "Vydia", "Foundation Media LLC"
]
SP_MAJOR_KEYWORDS = [
   "sony", "umg", "warner", "universal", "atlantic", "the orchard", "ingrooves", "columbia", "epic", "alamo", "300 entertainment"
]
SP_KNOWN_INDIE_KEYWORDS = [
   "empire", "10k project", "all is on music"
]
SP_SIGNED_KEYWORDS = [
   "under exclusive license to"
]
SP_DIY_KEYWORDS = [
   "distrokid", "ditto", "tunecore", "cdbaby", "united masters", "symphonic", "records dk"
]

class EvalController():
  def __init__(self, spotify: SpotifyClient, youtube: YoutubeClient, db):
    self.spotify = spotify
    self.youtube = youtube
    self.db = db

  def evaluate_copyrights(self, spotify_id: str):
    # Get the record
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    # check the artist exists
    if not doc.exists:
        raise ErrorResponse('Artist not found', 404, 'Tracking')
    # check the artist is ingested
    data = doc.to_dict()
    if data['songstat_state'] != 'ingested':
        raise ErrorResponse('Artist not ingested', 405, 'Tracking')

    # get top tracks
    top_tracks = self.spotify.get_artist_top_tracks(spotify_id)['tracks']

    artist_name = data['name']

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
        distro, label, distro_type = self._eval_youtube_rights(artist_name, desc)
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
    p_lines = self.spotify.get_artist_recent_plines_with_dates(spotify_id)

    for line in p_lines:
        label, distro_type = self._eval_spotify_rights(line['line'], artist_name)
        try:
            date_object = datetime.strptime(line['date'], '%Y-%m-%d').date()
        except ValueError as e:
            date_object = datetime.strptime(line['date'], '%Y').date()
        sp_evals.append({
            "type": "spotify",
            'distributor': None,
            'label': label,
            'distribution_type': distro_type,
            'release': date_object,
            'pline': line['line']
        })

    if len(sp_evals) == 0 and len(yt_evals) == 0:
        ref.update({
            "copyright_eval" : {
              "signed_status": "unknown",
              "distro_type": "unknown",
              "distro": None,
              "label": None,
              "back_catalog": "unknown",
              "evals": {},
              "p_lines": [],
              "as_of": datetime.now().strftime("%Y-%m-%d"),
              "eval_status": "no_evals_found"
        }})
        return 'No evals found', 201
        
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
        if eval['distribution_type'] == 'indie' or eval['distribution_type'] == 'major':
            yt_flags = yt_flags + 1
            main_eval = eval
    sp_flags = 0
    for eval in sp_evals:
        if eval['distribution_type'] == 'indie' or eval['distribution_type'] == 'major':
            sp_flags = sp_flags + 1
            if main_eval == None:
                main_eval = eval
    
    # Fully clean
    if yt_flags == 0 and sp_flags == 0:
        if len(yt_evals) > 0:
            main_eval = yt_evals[0]
        elif len(sp_evals) > 0:
            main_eval = sp_evals[0]
        status = "unsigned"
        priors = "clean"
    else:
        priors = "dirty"
        if (len(sp_evals) == 0 or sp_evals[0]['distribution_type'] == 'diy') and (len(yt_evals) == 0 or yt_evals[0]['distribution_type'] == 'diy'):
            if len(yt_evals) > 0:
              main_eval = yt_evals[0]
            elif len(sp_evals) > 0:
              main_eval = sp_evals[0]
            status = "unsigned"
        else:
            status = "signed"
    
    sp_plines = [l['line'] for l in p_lines]


    def parse_evals(evals):
        for eval in evals:
            if 'release' in eval:
              eval['release_date'] = eval['release'].strftime("%Y-%m-%d")
              del eval['release']
        
    parse_evals(sp_evals)
    parse_evals(yt_evals)

    ref.update({
        "copyright_eval" : {
          "signed_status": status,
          "distro_type": main_eval['distribution_type'],
          "distro": main_eval['distributor'],
          "label": main_eval['label'],
          "back_catalog": priors,
          "evals": {
              "main": main_eval,
              "youtube": yt_evals,
              "spotify": sp_evals
          },
          "p_lines": sp_plines,
          "as_of": datetime.now().strftime("%Y-%m-%d"),
          "eval_status": "success"
    }})
    return 'success', 200
  
  def _eval_spotify_rights(self, p_line, artist_name):
      p_line = p_line.lower().strip()
      artist_name = artist_name.lower().strip()
      for key in SP_MAJOR_KEYWORDS:
        if key in p_line:
            return key, "major"
      for key in SP_KNOWN_INDIE_KEYWORDS:
        if key in p_line:
            return key, "indie"
      for key in SP_SIGNED_KEYWORDS:
        if key in p_line:
            return None, "indie"
      for key in SP_DIY_KEYWORDS:
        if key in p_line:
            return key, "diy"
        
      if artist_name in p_line:
        return None, "diy"

      return None, "unknown"
    

  def _eval_youtube_rights(self, artist_name, yt_description):
      # print(yt_description)
      lines = yt_description.split('\n')

      distributor = None
      pline = None

      for line in lines:
          if 'Provided to YouTube by ' in line:
              distributor = line.split('Provided to YouTube by ')[1]
          if '℗' in line:
              l = line.split('℗ ')[1]
              if 'under exclusive license to ' in l:
                  pline = l.split('under exclusive license to ')[1]
              else:
                  pline = l
              pline = re.sub(r'\b\d{4}\b', '', pline).strip()


      distro_type = 'indie'

      # if the distro looks like the artist name
      if self._fuzzy_equal(artist_name, distributor, 80):
          distro_type = 'diy'
          distributor = 'unknown'
          return distributor, pline, distro_type


      for distro in YT_DIY_DISTROS:
          if self._fuzzy_equal(distro, distributor):
              distributor = distro
              distro_type = 'diy'
              return distributor, pline, distro_type
      
      for distro in YT_MAJOR_DISTROS:
          if self._fuzzy_equal(distro, distributor):
              distributor = distro
              distro_type = 'major'
              return distributor, pline, distro_type

      for distro in YT_KNOWN_INDIE_DISTROS:
          if self._fuzzy_equal(distro, distributor):
              distributor = distro
              distro_type = 'indie'
              return distributor, pline, distro_type
          
      # we found something we just don't know what it is
      if distributor != None or pline != None:
          distro_type = 'indie'
          return distributor, pline, distro_type
      # we didn't see anything legit looking but can't confirm
      else:
          return distributor, pline, 'unknown'


  def _fuzzy_equal(self, s1, s2, threshold=80):
      s1 = s1.lower().strip()
      s2 = s2.lower().strip()
      sim = fuzz.partial_ratio(s1, s2)
      return sim > threshold


  def _is_probably_same_track(self, youtube_video_title, spotify_song_title, youtube_channel_title, spotify_artist_name, threshold=80):
      return self._fuzzy_equal(youtube_channel_title, spotify_artist_name, threshold) and self._fuzzy_equal(youtube_video_title, spotify_song_title, threshold)