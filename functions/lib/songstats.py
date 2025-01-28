import traceback

import requests
import json
import pandas as pd
from datetime import datetime, timedelta
from .errors import ErrorResponse

class SongstatsClient():
  def __init__(self, key):
    self.key = key
    self.root_uri = f"https://api.songstats.com/enterprise/v1"

  def get(self, path, data=None):
    res = requests.get(f"{self.root_uri}{path}", timeout=5, headers= {
      "Content-Type": "application/json",
      "apikey": self.key
    },
    params=data)
    # print(res.json())
    if res.status_code > 299:
      if res.status_code == 429:
        print("Songstats Rate Limiting")


      raise ErrorResponse(res.json(), res.status_code, "Songstats")
    return res.json()

  def get_artist_info_songstats(self, songstats_id : str):
    return self.get('/artists/info', {
      "songstats_artist_id": songstats_id
    })

  def get_artist_info(self, spotify_id : str):
    return self.get('/artists/info', {
      "spotify_artist_id": spotify_id
    })
  
  def _get_days_for_weeks(self, weeks, day_end=3):
    most_recent_day = (datetime.now() - timedelta(days=1)).date()
    # Calculate the most recent Thursday
    days_since_thursday = (most_recent_day.weekday() - day_end) % 7  # Thursday is weekday 3
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
  
  def __interpolate_data(self, v):
    smoothed = [v[0]]
    z = 0
    for a in range(len(v) - 1):
        b = a + 1
        if v[b] - v[a] > 0:
            # interpolate from index z to intex b
            avg = (v[b] - v[z]) / (b - z)
            cum = v[z]
            for i in range(b - z - 1):
                cum = cum + avg
                smoothed.append(cum)
            smoothed.append(v[b])
            z = b
    # forward projection
    last_diff = smoothed[len(smoothed)-1] - smoothed[len(smoothed)-2]
    running = smoothed[len(smoothed)-1]
    for i in range(len(v) - len(smoothed)):
        running = running + last_diff
        smoothed.append(running)
    return [int(i) for i in smoothed]
  
  def __date_normalize_daily_stats(self, start:datetime.date, end:datetime.date, stats_raw):
    dates = [start + timedelta(days=i) for i in range((end-start).days+1)]
    # print(len(dates))
    day_to_index = {}
    for i, d in enumerate(dates):
      day_to_index[d] = i
    
    stats = {}
    # for each source in the stats
    for source in stats_raw:
      # skip anything without data history
      if 'source' not in source or 'data' not in source or 'history' not in source['data'] or len(source['data']['history']) == 0:
        continue
      # set up a stat prefix based on source
      prefix = source['source'] + "__"
      # iterate over the days in the stats
      for i, entry in enumerate(source['data']['history']):
        # an object with date and some stats, rip the stats
        for key in entry:
          # skip the date, otherwise its a stat
          if key == 'date':
            continue

          # get a key for the stat using the source prefix
          index = prefix + key
          # create the stat index if its not there
          if index not in stats:
            stats[index] = []

          # figure out which date this is, and backfill any missing ones
          day = datetime.strptime(entry['date'], "%Y-%m-%d").date()
          # this is the index in the array we want it to be
          norm_index = day_to_index[day]
          # this is the amount to backfill to get there
          missing = norm_index - len(stats[index])
          if missing > 0:
            # interpolate that many to the array to catch up
            last = stats[index][len(stats[index])-1] if len(stats[index]) > 0 else entry[key]
            diff = (entry[key] - last)
            inc = 0 if len(stats[index]) == 0 else diff / missing
            run = last
            for m in range(missing):
              run = run + inc
              stats[index].append(int(run))
          stats[index].append(entry[key])

    for s in stats:
      # print(f"{s}={len(stats[s])}")
      missing = len(dates) - len(stats[s])
      last = stats[s][len(stats[s])-1]
      last_prev = stats[s][len(stats[s])-2] if len(stats[s]) > 1 else last
      inc = last - last_prev
      run = last
      for i in range(missing):
        run = run + inc
        stats[s].append(run)
        
      # print(f"{s}={len(stats[s])}")
    
    # for i, d in enumerate(dates):
    #   print(f"{d.strftime('%Y-%m-%d')} = {stats['spotify__streams_current'][i]}")

    return dates, stats
  
  def __rollup_stats(self, start, week_end, end, dates, interpolated_daily_stats):
    # weekly extraction
    weekly_dates = []
    weekly_rollups = {}
    for i, d in enumerate(dates):
      # only look at the week ends OR the incomplete week at the end
      weekdiff = (week_end - d).days
      daydiff = (end - d).days
      if daydiff != 0 and weekdiff != 0 and weekdiff % 7 != 0:
        continue
      weekly_dates.append(d.strftime("%Y-%m-%d"))
      for stat in interpolated_daily_stats:
        if stat not in weekly_rollups:
          weekly_rollups[stat] = []
        weekly_rollups[stat].append(interpolated_daily_stats[stat][i])
    return weekly_dates, weekly_rollups
  
  def __merge_stats_to_df_abs(self, stats):
    dfs = []

    try:
      for stat in stats:
          source = stat['source']
          if 'data' not in stat:
              continue
          if 'history' not in stat['data']:
              continue
          data = stat['data']['history']
          if len(data) == 0:
              continue

          df = pd.DataFrame(data)
          df = df.dropna()

          df['date'] = pd.to_datetime(df['date'])
          df = df.rename(columns=lambda x: f"{source}__{x}" if x != 'date' else x)


          df.set_index('date', inplace=True)
          dfs.append(df)


      if len(dfs) == 0:
        return None, False
      # Merge all DataFrames on the date index
      result_df = pd.concat(dfs, axis=1)
      # forward fill missing data, 14 day moving average, weekly resample, trim startup weeks
      weekly = result_df.ffill().bfill().fillna(0).resample("W").last().iloc[2:, :].astype(int)
      return weekly, True
    except Exception as e:
      print("stat df abs error")

      print(str(e))
      # print(traceback.format_exc(5))
      return None, False

  
  def __merge_stats_to_df(self, stats):
    dfs = []
    for stat in stats:
        source = stat['source']
        if 'data' not in stat:
            continue
        if 'history' not in stat['data']:
            continue
        data = stat['data']['history']
        if len(data) == 0:
            continue
        
        df = pd.DataFrame(data)
        df['date'] = pd.to_datetime(df['date'])
        df = df.rename(columns=lambda x: f"{source}__{x}" if x != 'date' else x)
        df.set_index('date', inplace=True)
        
        dfs.append(df)
        
    if len(dfs) == 0:
      return None, False
    # Merge all DataFrames on the date index
    result_df = pd.concat(dfs, axis=1)
    # forward fill missing data, 14 day moving average, weekly resample, trim startup weeks
    rolling = result_df.ffill().rolling(window=14).mean().resample("W").mean().iloc[2:, :]
    return rolling, True

  def get_stat_weeks(self, spotify_id : str, weeks : int):
    start, week_end, end = self._get_days_for_weeks(weeks+3, day_end=6) # get sunday weeks
    res = self.get_historic_stats(spotify_id, start, week_end)
    df, status = self.__merge_stats_to_df(res['stats']) # this will chop 2 weeks off for smoothing
    if status == False:
      return {'stats': {}, 'as_of': []}
    # stats list
    rel = df.diff(periods=1).iloc[2:, :].bfill().fillna(0).astype(int) # this will chop 1 week off for diffs, 1 week to trim to 8 in finals
    json_dict = rel.to_dict(orient='list')
    # dates list
    dates = [ts.strftime('%Y-%m-%d') for ts in rel.index.to_list()]
    return {'stats': json_dict, 'as_of': dates}

  def get_stat_weeks_abs(self, spotify_id : str, weeks : int):
    start, week_end, end = self._get_days_for_weeks(weeks+1, day_end=6) # get sunday weeks
    res = self.get_historic_stats(spotify_id, start, week_end)
    df, status = self.__merge_stats_to_df_abs(res['stats']) 
    if status == False:
      return {'stats': {}, 'as_of': []}
    # stats list
    json_dict = df.to_dict(orient='list')
    # dates list
    dates = [ts.strftime('%Y-%m-%d') for ts in df.index.to_list()]
    return {'stats': json_dict, 'as_of': dates}
  
  def get_stat_weeks_old_2(self, spotify_id : str, weeks : int):
    start, week_end, end = self._get_days_for_weeks(weeks)
    res = self.get_historic_stats(spotify_id, start, end)

    # Overview
    # 1. Get date normalized daily arrays of cumulatives
    dates, daily_stats = self.__date_normalize_daily_stats(start, end, res['stats'])

    # 2. Interpolate all of them
    interpolated_daily_stats = {}
    for stat in daily_stats:
      interpolated_daily_stats[stat] = self.__interpolate_data(daily_stats[stat])

    # 3. Rollup weeklies
    weekly_dates, weekly_stats = self.__rollup_stats(start, week_end, end, dates, interpolated_daily_stats)

    # 4. Compute diffs
    weekly_diffs = {}
    for stat in weekly_stats:
      data = weekly_stats[stat]
      weekly_diffs[stat] = [b-a for a, b in zip(data, data[1:])]

    # 5. Package for return
    stats = {}
    for s in weekly_stats:
      stats[s] = {}
      stats[s]['abs'] = weekly_stats[s]
      stats[s]['rel'] = weekly_diffs[s]
    # TODO the dates are off by one for the rel data
    return {'stats': stats, 'as_of': weekly_dates}

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
        pass
    return None
  
  def get_stat_weeks_old(self, spotify_id : str, weeks : int):
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
        # d = datetime.strptime(day['date'], "%Y-%m-%d").date()
        # weekdiff = (week_end - d).days
        # daydiff = (end - d).days
        # if daydiff != 0 and weekdiff != 0 and weekdiff % 7 != 0:
        #   continue
        #  grab all the stats
        for key in day:
          if key == 'date':
            if prefix == 'spotify__':
              dates.append(day[key])
            continue
          index = prefix + key
          # create the stat index if its not there
          if index not in rollups:
            rollups[index] = []
          # append the week end value to the array
          rollups[index].append(day[key])

    smoothed_rollups = {}
    for stat in rollups:
      data = rollups[stat]
      smoothed_rollups[stat] = self.__interpolate_data(rollups[stat])
      # rollups[stat]['rel'] = [b-a for a, b in zip(data, data[1:])]
    
    # weekly extraction
    weekly_dates = []
    weekly_rollups = {}
    for i, d in enumerate(dates):
      # only look at the week ends OR the incomplete week at the end
      d = datetime.strptime(d, "%Y-%m-%d").date()
      weekdiff = (week_end - d).days
      daydiff = (end - d).days
      if daydiff != 0 and weekdiff != 0 and weekdiff % 7 != 0:
        continue
      weekly_dates.append(dates[i])
      for stat in smoothed_rollups:
        if index not in weekly_rollups:
          weekly_rollups[index] = {'abs':[]}
        weekly_rollups[index]['abs'].append(smoothed_rollups[index][i])
    
    for stat in weekly_rollups:
      data = weekly_rollups[stat]['abs']
      weekly_rollups[stat]['rel'] = [b-a for a, b in zip(data, data[1:])]

    return {'stats': weekly_rollups, 'as_of': weekly_dates}
  
  
 