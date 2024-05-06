import requests
import json
from .errors import ErrorResponse


class AirtableClient():
  def __init__(self, token, base, tables):
    self.token = token
    self.base = base
    self.root_uri = f"https://api.airtable.com/v0/{base}"
    self.tables = tables

  def get(self, path, data=None):
    res = requests.get(f"{self.root_uri}{path}", headers= {
      "Authorization": f"Bearer {self.token}",
      "Content-Type": "application/json"
    },
    params=data)
    if res.status_code > 299:
      if res.status_code == 429:
        print("Airtable Rate Limiting")
      raise ErrorResponse(res.json(), res.status_code, "Airtable")
    return res.json()

  def post(self, path, data=None):
    res = requests.post(f"{self.root_uri}{path}", headers= {
      "Authorization": f"Bearer {self.token}",
      "Content-Type": "application/json"
    },
    json=data)
    if res.status_code > 299:
      raise ErrorResponse(res.json(), res.status_code, "Airtable")
    return res.json()
  
  def patch(self, path, data=None):
    res = requests.patch(f"{self.root_uri}{path}", headers= {
      "Authorization": f"Bearer {self.token}",
      "Content-Type": "application/json"
    },
    json=data)
    if res.status_code > 299:
      raise ErrorResponse(res.json(), res.status_code, "Airtable")
    return res.json()
  
  def add_records(self, table, records):
    if len(records) <= 10:
      return self.post(f'/{self.tables[table]}', {'records':records})
    else:
      r = []
      for i in range(0, len(records), 10):
        batch = records[i:i + 10]
        res = self.post(f'/{self.tables[table]}', {'records':batch})
        if 'error' in res:
          return res
        else:
          r.append(res)
      return r

  def get_artist_by_id(self, record_id):
    return self.get(f'/{self.tables["artists"]}/{record_id}')  
  
  def get_artists_by_status(self, status):
    return self.get(f'/{self.tables["artists"]}', data={'filterByFormula':'{Status}="'+status+'"'})
  
  def get_artists_by_migration_status(self, status):
    return self.get(f'/{self.tables["artists"]}', data={'filterByFormula':'{Migration Status}="'+status+'"'})
  
  def get_new_artists(self):
    return self.get_artists_by_status("0 - New")

  def get_artist_by_spotify_id(self, spotify_id):
    return self.get(f'/{self.tables["artists"]}', data={'filterByFormula':'{Spotify ID}="'+spotify_id+'"'})
  
  def get_artists_where(self, query):
    return self.get(f'/{self.tables["artists"]}', data={'filterByFormula':query})

  def artist_exists(self, spotify_id):
    res = self.get_artist_by_spotify_id(spotify_id)
    if 'error' in res:
      return False
    else:
      return len(res['records']) > 0
  
  def update_artists(self, records):
    if len(records) <= 10:
      return self.patch(f'/{self.tables["artists"]}', {'records':records})
    else:
      r = []
      for i in range(0, len(records), 10):
        batch = records[i:i + 10]
        res = self.patch(f'/{self.tables["artists"]}', {'records':batch})
        if 'error' in res:
          return res
        else:
          r.append(res)
      return r
  
  def update_playlists(self, records):
    if len(records) <= 10:
      return self.patch(f'/{self.tables["playlists"]}', {'records':records})
    else:
      r = []
      for i in range(0, len(records), 10):
        batch = records[i:i + 10]
        res = self.patch(f'/{self.tables["playlists"]}', {'records':batch})
        if 'error' in res:
          return res
        else:
          r.append(res)
      return r

  def get_new_playlists(self):
    return self.get(f'/{self.tables["playlists"]}', data={'filterByFormula':'{Status}="0 - New"'})
  
  def get_playlist_by_id(self, record_id):
    return self.get(f'/{self.tables["playlists"]}/{record_id}') 
  
  def get_metric_raw(self, metric, artist_auto_id, date):
    formula = 'AND({Metric}="'+metric+'", {Artist}="'+str(artist_auto_id)+'", DATESTR({Date})=DATESTR("'+date+'"))'
    # formula = 'AND({Metric}="'+metric+'",DATESTR({Date})=DATESTR("'+date+'"))'
    return self.get(f'/{self.tables["metrics"]}', data={'filterByFormula':formula})
  