from fuzzywuzzy import fuzz
import re


YT_DIY_DISTROS = [
   "DistroKid", "Ditto", "TuneCore", "CDBaby", "United Masters", "Symphonic", "EVEARA", "SongCast", "Too Lost", "Amuseio", "Repost Network", "IIP-DDS", "N/A", "CmdShft"
]
YT_MAJOR_DISTROS = [
   "The Orchard Enterprises", "Universal Music Group", "Warner Records Inc", "Sony Entertainment Group", "Atlantic Records", "Ingrooves", "Columbia", "Epic", "Alamo", "Arista Records", "300 Entertainment", "Virgin Music Group", "Sony Music Nashville", "RCA Records Label Nashville"
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
   "distrokid", "ditto", "tunecore", "cdbaby", "united masters", "symphonic", "records dk", "cmdshft"
]

class CopyrightEvaluator():
  def __init__(self):
      pass
  def eval_spotify_rights(self, p_line, artist_name):
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
    

  def eval_youtube_rights(self, artist_name, yt_description):
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
      
      #   cant perform checks without distro, assume unknown
      if distributor == None:
          return distributor, pline, 'unknown'


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


  def is_probably_same_track(self, youtube_video_title, spotify_song_title, youtube_channel_title, spotify_artist_name, threshold=80):
      return self._fuzzy_equal(youtube_channel_title, spotify_artist_name, threshold) and self._fuzzy_equal(youtube_video_title, spotify_song_title, threshold)
  