import time

from google.cloud.firestore_v1.query_results import QueryResultsList
from sqlalchemy import select, or_, func
from sqlalchemy.orm import joinedload, contains_eager
import traceback

from controllers.artists import artist_with_meta
from lib import SongstatsClient, ErrorResponse, SpotifyClient, get_user, ArtistLink, LinkSource, StatisticType, \
    OrganizationArtist, Evaluation, Statistic, UserArtist, Attribution, ArtistTag
from datetime import datetime, timedelta
from google.cloud.firestore_v1.base_query import FieldFilter, BaseCompositeFilter, StructuredQuery
from google.cloud.firestore_v1.transforms import DELETE_FIELD

from lib import CloudSQLClient, Artist
from lib.utils import pop_default

HOT_TRACKING_FIELDS = {
  "spotify__monthly_listeners": "abs",
  "deezer__followers_total": "abs",
  "tiktok__followers_total": "abs",
  "youtube__subscribers_total": "abs",
  "soundcloud__followers_total": "abs",
  "instagram__followers_total": "abs"
}

DEPRECATED_STATS = {
  "spotify__monthly_listeners": "rel",
  "spotify__streams_current": "rel",
  "youtube__video_views_total": "rel",
  "tiktok__views_total": "rel",
  "shazam__shazams_total": "rel",
  "instagram__followers_total": "rel" 
}


class TrackingController():
  def __init__(self, spotify: SpotifyClient, songstats : SongstatsClient, sql: CloudSQLClient, db):
    self.spotify = spotify
    self.songstats = songstats
    self.db = db
    self.sql = sql
    self.statistic_types = None
    self.users = None

  def get_statistic_type_from_field(self, field: str):
      types = self.get_statistic_types()
      for type in types:
          if field.startswith(type.source + '__'+type.key ):
              return type
      return None

  def get_statistic_types(self):
      if self.statistic_types is None:
          sql_session = self.sql.get_session()
          self.statistic_types = sql_session.query(StatisticType).all()
          sql_session.close()
      return self.statistic_types

  # #####################
  # Onboarding
  # #####################
  
  def add_ingest_update_artist(self, spotify_id, user_id, org_id, tags = None):
    msg, status = self.add_artist(spotify_id, user_id, org_id, None, tags)
    if status != 200:
      return msg, status
    return self.ingest_artist(spotify_id)

  # def add_artist_sql(self, spotify_id, user_id, org_id):

  def set_tags(self, organization_id, identifier, tags):
      sql_session = self.sql.get_session()
      sql_ref = artist_with_meta(sql_session=sql_session, id=identifier)
      final = list()
      for tag in tags:
          existing = pop_default(list(
              filter(lambda x: x.tag == tag and x.organization_id == organization_id, sql_ref.tags)), None)
          existing_self = pop_default(list(
              filter(lambda x: x.tag == tag and x.organization_id == organization_id, final)), None)
          if existing is not None or existing_self is not None:
              continue
          final.append(ArtistTag(
              artist_id=sql_ref.id,
              tag_type_id=1,
              tag=tag,
              organization_id=organization_id,
          ))
      for tag in sql_ref.tags:
          existing = pop_default(list(
              filter(lambda x: x == tag.tag and organization_id == tag.organization_id, tags)), None)
          if existing is None:
              sql_session.delete(tag)
      sql_session.add_all(final)
      sql_session.commit()
      sql_session.close()
      return True

  def add_tags(self, sql_session, sql_ref: Artist, organization_id, tags):
      any = False
      for tag in tags:
          found = False
          for old_tag in sql_ref.tags:
              if old_tag.tag == tag and (old_tag.organization_id == organization_id or old_tag.organization_id is None):
                  found = True
          if found:
              continue
          any = True
          sql_ref.tags.append(ArtistTag(
              tag_type_id=1,
              tag=tag,
              organization_id=organization_id,
          ))
      if any:
        print(sql_ref.tags)
        sql_session.add(sql_ref)
        sql_session.commit()

  def add_artist(self, spotify_id, user_id, org_id, sql_playlist_id = None, tags = None):
    if tags is None:
        tags = list()

    sql_session = self.sql.get_session()
    sqlRef = sql_session.scalars(select(Artist).where(Artist.spotify_id == spotify_id).options(
        joinedload(Artist.tags, innerjoin=False),
        joinedload(Artist.organizations, innerjoin=False),
        joinedload(Artist.users, innerjoin=False)
    )).first()
    if sqlRef is not None:
        if not sqlRef.active:
            sqlRef.active = True
            sql_session.add(sqlRef)
            sql_session.commit()
    ref = self.db.collection("artists_v2").document(spotify_id)
    attribution = Attribution(
        user_id=user_id,
        organization_id=org_id,
        playlist_id=sql_playlist_id,
    )
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
      if sqlRef is None:
        print('Artist needs migration; importing to SQL')
        self.import_sql(doc, attribution)
        sqlRef = artist_with_meta(sql_session, spotify_id)
      else:
          if len(list(filter(lambda x: x.user_id == user_id, sqlRef.users))) == 0:
              sqlRef.users.append(UserArtist(
                  user_id=user_id,
                  organization_id=org_id,
              ))
          if len(list(filter(lambda x: x.organization_id == org_id, sqlRef.organizations))) == 0:
              sqlRef.organizations.append(OrganizationArtist(
                  organization_id=org_id,
                  last_playlist_id=sql_playlist_id,
                  added_by=user_id
              ))
          else:
              org = list(filter(lambda x: x.organization_id == org_id, sqlRef.organizations)).pop()
              if sql_playlist_id is not None:
                  org.last_playlist_id = sql_playlist_id
                  sql_session.add(org)
          attribution.artist_id = sqlRef.id
          sql_session.add(sqlRef)
          sql_session.add(attribution)
          sql_session.commit()
      self.add_tags(sql_session, sqlRef, org_id, tags)
      sql_session.close()
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
    imported, skipped, avg, fails = self.import_sql(ref.get(), attribution)
    if len(fails) > 0:
        print(fails)
        return 'Artist failed to import, please try again', 500
    self.add_tags(sql_session, artist_with_meta(sql_session, spotify_id), org_id, tags)
    sql_session.close()


    return 'success', 200
  
  def ingest_artist(self, spotify_id : str):

    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    print("[INGEST] has doc")
    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')

    sql_session = self.sql.get_session()
    sql_ref = artist_with_meta(sql_session, spotify_id)

    if sql_ref is None:
        print('Artist needs migration; importing to SQL')
        self.import_sql(doc)
        sql_ref = artist_with_meta(sql_session, spotify_id)

    sql_session.close()
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
          self.set_onboard_wait(sql_ref, datetime.now() + timedelta(minutes=10))
          return 'Waiting for data', 201
      elif e.status_code == 429:
          ref.update({
            "ob_status": "waiting_ingest",
            "ob_wait_till": datetime.now() + timedelta(days=30)
          })
          self.set_onboard_wait(sql_ref, datetime.now() + timedelta(minutes=10))
          return 'Waiting for data', 201
      else:
          self.set_onboard_wait(sql_ref, None)
      raise e

    print("[INGEST] has info")
    print(info)
    # add the additional info
    ref.update({
      "avatar": info['artist_info']['avatar'],
      "links": info['artist_info']['links'],
    })
    # get the stats now that we know the artist is in SS
    self.update_artist(spotify_id, is_ob=True)

    ref.update({
      "ob_status": "onboarded"
    })

    print("[INGEST] info updated")

    return 'success', 200

  def set_onboard_wait(self, sql_ref, onboard_wait = None):
      sql_session = self.sql.get_session()
      sql_ref.onboard_wait_until = onboard_wait
      sql_session.add_all([sql_ref])
      sql_session.commit()
      sql_session.close()
  # #####################
  # Stats
  # #####################
  
  def update_artist(self, spotify_id : str = None, artist_id: str = None, is_ob=False):
    sql_session = self.sql.get_session()
    sql_ref = None
    if spotify_id is None:
      sql_ref = artist_with_meta(sql_session, None, artist_id)
      if sql_ref is None:
          raise ErrorResponse('Artist not found', 404, 'Tracking')
      spotify_id = sql_ref.spotify_id
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    print("[INGEST] has update doc")

    # check the artist exists
    if not doc.exists:
      raise ErrorResponse('Artist not found', 404, 'Tracking')

    if sql_ref is None:
        sql_ref = artist_with_meta(sql_session, spotify_id)
    sql_session.close()
    if sql_ref is None:
        print('Artist needs migration; importing to SQL')
        self.import_sql(doc)
        sql_session = self.sql.get_session()
        sql_ref = artist_with_meta(sql_session, spotify_id)
        sql_session.close()

    # check the artist is ingested - not needed
    # data = doc.to_dict()
    # if data['ob_status'] != 'ingested' and not is_ob:
    #   raise ErrorResponse('Artist not ingested', 401, 'Tracking')
    try:
      stats = self.songstats.get_stat_weeks_abs(spotify_id, 8)
    except ErrorResponse as e:
      # Artist somehow got removed from songstats, but them back in OB
      if e.status_code == 404:
          ref.update({
            "ob_status": "waiting_ingest",
            "ob_wait_till": datetime.now() + timedelta(minutes=10)
          })
          self.set_onboard_wait(sql_ref, datetime.now() + timedelta(minutes=10))

          return 'Waiting for data', 201
      elif e.status_code == 429:
          ref.update({
            "ob_status": "waiting_ingest",
            "ob_wait_till": datetime.now() + timedelta(days=30)
          })
          self.set_onboard_wait(sql_ref, datetime.now() + timedelta(minutes=10))
          return 'Waiting for data', 201
      else:
          self.set_onboard_wait(sql_ref, None)
      raise e
    

    print("[INGEST] has stats")

    try:
        #  update the hot tracking stats on the artist
        update = {"stat_dates": stats['as_of'], "stats_as_of": datetime.now()}
        for s in HOT_TRACKING_FIELDS:
          sql_statistic_type = self.get_statistic_type_from_field(s)
          values = stats['stats'][s] if s in stats['stats'] else []
          if values is None or len(values) == 0:
              if sql_statistic_type.id == 30:
                  values = stats['stats']["spotify__monthly_listeners_current"] if "spotify__monthly_listeners_current" in stats['stats'] else []
          update[f"stat_{s}__{HOT_TRACKING_FIELDS[s]}"] = values
          self.add_or_update_sql_stat(sql_ref, sql_statistic_type, stats['as_of'].pop(), values)

        self.update_sql_meta(sql_ref, doc)


        ref.update(update)
    except Exception as e:
        print(e)
        return 'error', 500
    print("[INGEST] stats updated")

    # TODO Add the deep stats subcollection
    return 'success', 200

  def update_sql_meta(self, sql_ref, doc):
      sql_ref.avatar = doc.get('avatar')
      sql_links = self.convert_links(doc, sql_ref.id)
      sql_session = self.sql.get_session()
      if sql_ref.avatar is not None or len(sql_links) > 0:
          sql_ref.onboard_wait_until = None
      final = list()
      for link in sql_links:
          existing = pop_default(list(
              filter(lambda x: x.link_source_id == link.link_source_id and x.path == link.path, sql_ref.links)), None)
          existing_self = pop_default(list(
              filter(lambda x: x.link_source_id == link.link_source_id and x.path == link.path, final)), None)
          if existing is not None or existing_self is not None:
              continue
          final.append(link)
      for link in sql_ref.links:
          existing = pop_default(list(
              filter(lambda x: x.link_source_id == link.link_source_id and x.path == link.path, sql_links)), None)
          if existing is None:
              sql_session.delete(link)
      sql_ref.onboarded = doc.get("ob_status") == 'onboarded' or sql_ref.avatar is not None
      sql_session.add_all(final)
      sql_session.add_all([sql_ref])
      sql_session.commit()

  def add_or_update_sql_stat(self, artist: Artist, statistic_type: StatisticType, date, values):
      if len(values) == 0:
          return
      if statistic_type.format == 'int':
          valueSet = list(map(int, values))
          latest: int = valueSet[len(valueSet) - 1]
          previous: int = valueSet[len(valueSet) - 2]
      else:
          valueSet = list(map(float, values))
          latest: float = valueSet[len(valueSet) - 1]
          previous: float = valueSet[len(valueSet) - 2]

      wow = 0 if previous <= 0 else (latest - previous) / previous
      mom = 0 if valueSet[3] <= 0 else (valueSet[7] - valueSet[3]) / valueSet[3]
      found_stat = None
      for stat in artist.statistics:
          if stat.statistic_type_id == statistic_type.id:
              stat.latest = latest
              stat.previous = previous
              stat.max = max(valueSet)
              stat.min = min(valueSet)
              stat.avg = sum(valueSet) / len(valueSet)
              stat.data = valueSet
              stat.week_over_week = wow
              stat.month_over_month = mom
              stat.last_date = date
              stat.updated_at = datetime.now()
              found_stat = stat

      if found_stat is None:
          found_stat = Statistic(
              type=statistic_type,
              latest=latest,
              previous=previous,
              max=max(valueSet),
              min=min(valueSet),
              avg=sum(valueSet) / len(valueSet),
              data=valueSet,
              week_over_week=wow,
              month_over_month=mom,
              last_date=date,
          )
          artist.statistics.append(found_stat)

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
    sql_session = self.sql.get_session()
    sql_ids = (select(Artist.spotify_id)
               .filter(Artist.onboarded == False)
               .filter(or_(Artist.onboard_wait_until == None, Artist.onboard_wait_until < func.now()))
               .filter(Artist.active == True)).limit(limit)
    sql_ids = sql_session.scalars(sql_ids).unique()
    sql_session.close()
    return list(sql_ids)
  
  def find_needs_stats_refresh(self, limit: int):
    sql_session = self.sql.get_session()
    sql_ids = (select(Artist.id)
               .filter(Artist.evaluation.has())
               .filter(Artist.statistics.any(Statistic.updated_at <  func.now() - timedelta(days=1)))
               .filter(or_(Artist.stats_queued_at == None, Artist.stats_queued_at < func.now() - timedelta(hours=16)))
               .filter(Artist.active == True)).limit(limit)
    sql_ids = sql_session.scalars(sql_ids).unique()
    sql_session.close()
    return list(sql_ids)

  def convert_artist_link(self, link, sources, artist_id = None):

      filtered_sources = list(filter(lambda s: s.key == link.get('source'), sources))

      if len(sources) == 0:
          print("No valid source: " + link.get('source') + ' ' + link.get('url'))
          exit(1)

      url: str = link.get('url')
      source: LinkSource = filtered_sources[0]
      if source.key == 'twitter' and 'x.com' in url:
          source = list(filter(lambda s: s.key == 'x', sources))[0]

      source_parts = source.url_scheme.split('{identifier}')
      scheme_part_one = (source_parts[0]
                         .replace('https://', '')
                         .replace('http://', '')
                         .replace('www.', ''))
      scheme_part_two = source_parts[1]

      url_identifier = (link.get("url")
                        .replace('https://', '')
                        .replace('http://', '')
                        .replace('www.', '')
                        .replace(scheme_part_one, ''))
      if len(scheme_part_two) > 0:
          url_identifier = url_identifier.split(scheme_part_two)[0]
      url_identifier = url_identifier.split("?")[0]
      artist_link = ArtistLink(
         link_source_id=source.id,
         path=url_identifier,
      )
      if artist_id is not None:
         artist_link.artist_id = artist_id
      return artist_link

  def convert_eval(self, artist, existingId = None):
    if artist.get('eval_status') != 'no_eval':
        status = 1
        if artist.get('eval_status') == 'unsigned':
            status = 0

        back_catalog = 0
        if artist.get('eval_prios') == 'dirty':
            back_catalog = 1
        if artist.get('eval_distro_type') == 'indie':
            distributor_type = 1
        elif artist.get('eval_distro_type') == 'major':
            distributor_type = 2
        elif artist.get('eval_distro_type') == 'diy':
            distributor_type = 0
        else:
            distributor_type = 3

        distro = artist.get('eval_distro')
        label = artist.get('eval_label')
        if len(distro) == 0:
            distro = None
        if len(label) == 0:
            label = None
        eval = Evaluation(
            distributor=distro,
            distributor_type=distributor_type,
            label=label,
            created_at=artist.get('eval_as_of'),
            status=status,
            back_catalog=back_catalog,
        )
        if existingId is not None:
            eval.artist_id = existingId
    else:
        return None
    return eval
  def import_sql(self, old_artists, attribution = None, tags = None):

      if not isinstance(old_artists, QueryResultsList):
          old_artists = [old_artists]
      sql_session = self.sql.get_session()
      stat_types = list(sql_session.scalars(select(StatisticType)).all())
      userOrgs = dict()
      if self.users is None:
        self.users = self.db.collection('users').get()
      for user in self.users:
          id = user.id
          user = user.to_dict()
          userOrgs[id] = user.get('organization')

      spotifys = list(map(lambda x: x.get('spotify_id'), old_artists))
      existing = sql_session.scalars(select(Artist).where(Artist.spotify_id.in_(spotifys))).all()
      imported = 0
      skipped = 0
      fails = {}
      start = time.time()
      for artist in old_artists:
          spotify_id = artist.get('spotify_id')
          add_batch = list()
          existingMatches = list(filter(lambda x: x.spotify_id == spotify_id, existing))
          if len(existingMatches) > 0:
              skipped += 1
              print("Skipping existing artist: " + spotify_id + ' ' + str(existingMatches[0].id))
              continue
          else:
              print("Adding artist: " + spotify_id)
              try:
                  orgs = list()
                  for orgId, watchDetails in artist.get('watching_details').items():
                      added_by = watchDetails.get('added_by', None)
                      if added_by is None:
                          for user_id, found_details in artist.get('found_by_details').items():
                                if userOrgs[user_id] == orgId or found_details.get('found_on') == watchDetails.get('added_on'):
                                    added_by = user_id

                      orgs.append(OrganizationArtist(
                          organization_id=orgId,
                          added_by=added_by,
                          last_playlist_id=attribution.playlist_id if attribution is not None else None,
                          favorite=watchDetails.get('favorite'),
                          created_at=watchDetails.get('added_on'),
                      ))
                  eval = self.convert_eval(artist)
                  stats = list()
                  stat_dates = artist.get('stat_dates')
                  for key, value in artist.to_dict().items():
                      keyStr: str = key

                      if not keyStr.startswith('stat_'):
                          continue
                      if keyStr == 'stat_dates':
                          continue
                      statSource = keyStr.split('_')[1].split('__')[0]
                      statName = keyStr.split('__')[1]
                      if statName == 'monthly_listeners_current':
                          statName = 'monthly_listeners'
                      newStatType = None
                      for statType in stat_types:
                          if statType.source == statSource and statType.key == statName:
                              newStatType = statType
                              break

                      if newStatType == None:
                          newStatType = StatisticType(
                              name=statName,
                              key=statName,
                              source=statSource,
                              format='int'
                          )
                          sql_session.add(newStatType)
                          sql_session.commit()
                          print("ADDING TYPE: " + statName)
                          stat_types = list(sql_session.scalars(select(StatisticType)).all())

                      if len(value) == 0:
                          continue
                      if newStatType.format == 'int':
                          valueSet = list(map(int, value))
                          latest: int = valueSet[len(valueSet) - 1]
                          previous: int = valueSet[len(valueSet) - 2]
                      else:
                          valueSet = list(map(float, value))
                          latest: float = valueSet[len(valueSet) - 1]
                          previous: float = valueSet[len(valueSet) - 2]

                      wow = 0 if previous <= 0 else (latest - previous) / previous

                      mom = None
                      if len(valueSet) == 8:
                          mom = 0 if valueSet[3] <= 0 else (valueSet[7] - valueSet[3]) / valueSet[3]
                      stats.append(Statistic(
                          type=newStatType,
                          latest=latest,
                          previous=previous,
                          max=max(valueSet),
                          min=min(valueSet),
                          avg=sum(valueSet) / len(valueSet),
                          data=valueSet,
                          week_over_week=wow,
                          month_over_month=mom,
                          last_date=stat_dates[len(stat_dates) - 1],
                      ))
                  userArtists = list()
                  for user_id, found_details in list(filter(lambda x: x is not None, artist.get('found_by_details').items())):
                      userArtists.append(UserArtist(
                          user_id=user_id,
                          organization_id=userOrgs[user_id],
                          created_at=found_details.get('found_on')
                      ))
                  filtered_links = self.convert_links(artist)
                  attributions_list = list()
                  if attribution is not None:
                      attributions_list = list([Attribution(
                          user_id=attribution.user_id,
                          organization_id=orgId,
                          playlist_id=attribution.playlist_id,
                      )])
                  add_batch.append(Artist(
                      spotify_id=spotify_id,
                      name=artist.get('name'),
                      avatar=artist.get('avatar'),
                      onboard_wait_until=None,
                      links=filtered_links,
                      organizations=orgs,
                      evaluation=eval,
                      statistics=stats,
                      users=userArtists,
                      onboarded=artist.get("ob_status") == 'onboarded' or artist.get('avatar') is not None,
                      active=True,
                      attributions=attributions_list
                  ))

                  if len(add_batch) > 0:
                      sql_session.add_all(add_batch)
                      sql_session.commit()
                      add_batch.clear()
                      imported += 1
              except Exception as e:
                  fails[artist.get('spotify_id')] = repr(e)

      if len(fails) > 0:
          print(fails)
      sql_session.close()
      end = time.time()
      avg = 0
      if imported > 0:
        avg = (end-start) / imported
      return imported, skipped, avg, fails

  def convert_links(self, artist, sql_id = None):
      link_sources = self.sql.load_all_for_model(LinkSource)
      links = list()
      dict_artist = artist.to_dict()
      if 'links' in dict_artist:
          links = list(map(lambda x: self.convert_artist_link(x, link_sources, sql_id), dict_artist.get('links', [])))

          filtered_links = list()
          for link in links:
              if len(list(
                  filter(lambda x: (x.path == link.path and x.link_source_id == link.link_source_id), filtered_links))) > 0:
                  continue
              filtered_links.append(link)
      return links