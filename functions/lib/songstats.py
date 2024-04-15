import requests
import json
from datetime import datetime, timedelta
from .errors import ErrorResponse

class SongstatsClient():
  def __init__(self, key):
    self.key = key
    self.root_uri = f"https://api.songstats.com/enterprise/v1"

  def get(self, path, data=None):
    res = requests.get(f"{self.root_uri}{path}", headers= {
      "Content-Type": "application/json",
      "apikey": self.key
    },
    params=data)
    if res.status_code > 299:
      if res.status_code == 429:
        print("Songstats Rate Limiting")
      raise ErrorResponse(res.json(), res.status_code, "Songstats")
    return res.json()
  
  def get_artist_info(self, spotify_id : str):
    return self.get('/artists/info', {
      "spotify_artist_id": spotify_id
    })
  
  def _get_days_for_weeks(self, weeks):
    most_recent_day = (datetime.now() - timedelta(days=1)).date()
    # Calculate the most recent Thursday
    days_since_thursday = (most_recent_day.weekday() - 3) % 7  # Thursday is weekday 3
    most_recent_thursday = most_recent_day - timedelta(days=days_since_thursday)
    weeks_ago_from_thursday = most_recent_thursday - timedelta(weeks=weeks)
    start = weeks_ago_from_thursday
    week_end = most_recent_thursday
    end = most_recent_day
    return start, week_end, end
  
  def get_historic_stats(self, spotify_id : str, start :datetime, end: datetime):
    return self.get('/artists/historic_stats', {
      "spotify_artist_id": spotify_id,
      "start_date": start.strftime("%Y-%m-%d"),
      "end_date": end.strftime("%Y-%m-%d")
    })
  
  def get_stat_weeks(self, spotify_id : str, weeks : int):
    start, week_end, end = self._get_days_for_weeks(weeks)
    res = self.get_historic_stats(spotify_id, start, end)
    rollups = {}
    dates = []
    # for each source in the stats
    for source in res['stats']:
      # skip anything without data history
      if 'source' not in source or 'data' not in source or 'history' not in source['data']:
        continue
      # set up a stat prefix based on source
      prefix = source['source'] + "__"
      # iterate over the days in the stats
      for i, day in enumerate(source['data']['history']):
        # only look at the week ends OR the incomplete week at the end
        d = datetime.strptime(day['date'], "%Y-%m-%d").date()
        weekdiff = (week_end - d).days
        daydiff = (end - d).days
        if daydiff != 0 and weekdiff != 0 and weekdiff % 7 != 0:
          continue
        #  grab all the stats
        for key in day:
          if key == 'date':
            if prefix == 'spotify__':
              dates.append(day[key])
            continue
          index = prefix + key
          # create the stat index if its not there
          if index not in rollups:
            rollups[index] = {'abs':[]}
          # append the week end value to the array
          rollups[index]['abs'].append(day[key])

    for stat in rollups:
      data = rollups[stat]['abs']
      rollups[stat]['rel'] = [b-a for a, b in zip(data, data[1:])]

    return {'stats': rollups, 'as_of': dates}
  
 