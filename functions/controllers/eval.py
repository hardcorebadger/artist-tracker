from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import joinedload

from lib import SpotifyClient, YoutubeClient, ErrorResponse, Artist, Evaluation, CopyrightEvaluator
from datetime import datetime, timedelta
import re
from fuzzywuzzy import fuzz
from google.cloud.firestore_v1.base_query import FieldFilter, BaseCompositeFilter, StructuredQuery


#     "copyright_eval" : {
#         "signed_status": SIGNED UNSIGNED UNKNOWN,
#         "distro_type": MAJOR INDIE DIY UNKNOWN,
#         "distro": str | null,
#         "label": str | null,
#         "back_catalog": PRIORS NO_PRIORS UNKNOWN,
#         "evals": f"Main Eval\n{dump_eval(main_eval)}\n\nYoutube\n{dump_evals(yt_evals)}\n\nSpotify\n{dump_evals(sp_evals)}",
#         "p_lines": ", ".join(sp_plines)
#     }

class EvalController():
  def __init__(self, spotify: SpotifyClient, youtube: YoutubeClient, db, sql, tracking_controller):
    self.spotify = spotify
    self.youtube = youtube
    self.db = db
    self.sql = sql
    self.tracking_controller = tracking_controller
    self.evaluator = CopyrightEvaluator()

  def evaluate_copyrights(self, spotify_id: str, sql_session, artist_id: str = None):
    sql_ref = None
    if spotify_id is None:
        sql_ref = sql_session.scalars(select(Artist).options(joinedload(Artist.evaluation, innerjoin=False)).where(
        Artist.id == artist_id)).first()
        if sql_ref is None:
            raise ErrorResponse('Artist not found: ' + str(artist_id), 404, 'Tracking')
        spotify_id = sql_ref.spotify_id
    # Get the record
    ref = self.db.collection("artists_v2").document(spotify_id)
    doc = ref.get()
    # check the artist exists
    if not doc.exists:
        raise ErrorResponse('Artist not found eval: ' + str(spotify_id) + " " + str(artist_id), 404, 'Tracking')

    if sql_ref is None:
        sql_ref = sql_session.scalars(select(Artist).options(joinedload(Artist.evaluation, innerjoin=False)).where(Artist.spotify_id == spotify_id)).first()
        if sql_ref is None:
            print('Artist needs migration; importing to SQL')
            self.tracking_controller.import_sql(doc)
            sql_ref = sql_session.scalars(select(Artist).options(joinedload(Artist.evaluation, innerjoin=False)).where(Artist.spotify_id == spotify_id)).first()

    # check the artist is ingested
    data = doc.to_dict()

    # This flow works without any of the ingest data
    # if data['ob_status'] == 'needs_ingest':
    #     raise ErrorResponse('Artist not ingested', 405, 'Tracking')

    # get top tracks
    top_tracks = self.spotify.get_artist_top_tracks(spotify_id)['tracks']
    top_track_ids = list(map(lambda x: x['id'], top_tracks))
    check_cache = self.db.collection("spotify_cache").where(filter=FieldFilter(
        "spotify_id", "==", spotify_id
    )).where(filter=FieldFilter(
        'type', '==', 'top-tracks'
    )).order_by('created_at', "DESCENDING").get()

    cache_ref = check_cache.pop() if len(check_cache) > 0 else None

    if cache_ref is None:
        cache_data = {"data": top_tracks, "spotify_id": spotify_id, "type": "top-tracks", "processed": False, "created_at": SERVER_TIMESTAMP}
        update_time, cache_ref = self.db.collection("spotify_cache").add(cache_data)
    else:
        if cache_ref.get('processed'):
            previous_data = cache_ref.get('data')
            previous_ids = list(map(lambda x: x['id'], previous_data))
            if previous_ids == top_track_ids and sql_ref.evaluation_id is not None and sql_ref.evaluation.created_at > datetime.now() - timedelta(days=90):
                print("Skipping artist re-evaluation as top tracks have not changed, and it has been less than 90 days.")
                return "Skipping artists re-evaluation as top tracks have not changed and it has been less than 90 days.", 201

        cache_ref.reference.set({"data": top_tracks, "spotify_id": spotify_id, "type": "top-tracks", "processed": False, "created_at": SERVER_TIMESTAMP})
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
        distro, label, distro_type = self.evaluator.eval_youtube_rights(artist_name, desc)
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

    cache_ref.update({'processed': True})

    # eval spotify
    sp_evals = []
    p_lines = self.spotify.get_artist_recent_plines_with_dates(spotify_id)

    for line in p_lines:
        label, distro_type = self.evaluator.eval_spotify_rights(line['line'], artist_name)
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
            "eval_status": "unknown",
            "eval_distro_type": "unknown",
            "eval_distro": "",
            "eval_label": "",
            "eval_prios": "unknown",
            "eval_as_of": datetime.now()
        })

        sql_ref.evaluation = Evaluation(
            distributor_type=3,
            status=2,
            artist_id=sql_ref.id
        )
        sql_session.add(sql_ref)
        sql_session.commit()
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
    sql_status = 0
    if status == 'signed':
        sql_status = 1
    sql_back_catalog = 0
    if priors == 'dirty':
        sql_back_catalog = 1

    if main_eval['distribution_type'] == 'indie':
        distributor_type = 1
    elif main_eval['distribution_type'] == 'major':
        distributor_type = 2
    elif main_eval['distribution_type'] == 'diy':
        distributor_type = 0
    else:
        distributor_type = 3
    ref.update({
        "eval_status": status,
        "eval_distro_type": main_eval['distribution_type'],
        "eval_distro": main_eval['distributor'] if main_eval['distributor'] != None else "",
        "eval_label": main_eval['label'] if main_eval['label'] != None else "",
        "eval_prios": priors,
        "eval_as_of": datetime.now()
        # "copyright_eval" : {
        #   "evals": {
        #       "main": main_eval,
        #       "youtube": yt_evals,
        #       "spotify": sp_evals
        #   },
        #   "p_lines": sp_plines,
        #   "as_of": datetime.now().strftime("%Y-%m-%d"),
        #   "eval_status": "success"
    })
    sql_ref.evaluation = Evaluation(
        artist_id=sql_ref.id,
        distributor_type=distributor_type,
        status=sql_status,
        back_catalog=sql_back_catalog,
        distributor=main_eval['distributor'] if main_eval['distributor'] != "" and main_eval['distributor'] != 'unknown' else None,
        label=main_eval['label'] if main_eval['label'] != "" and main_eval['label'] != 'unknown' else None,
    )
    sql_session.add_all([sql_ref])
    sql_session.commit()
    # TODO save the full eval state to a subcollection
    return 'success', 200

  def find_needs_eval_base(self, spotify_id = False):
      q = select(Artist.id) if spotify_id == False else select(Artist.spotify_id)
      return q.outerjoin(Evaluation, Artist.evaluation).filter(
              and_(
                  Artist.active == True,
                  or_(
                      or_(
                          and_(Evaluation.updated_at <= func.now() - timedelta(days=10), Evaluation.distributor_type != 1),
                          and_(Evaluation.updated_at <= func.now() - timedelta(days=30), Evaluation.distributor_type == 1),
                      ),
                      Evaluation.id == None
                  )
              )
          )

  def find_needs_shopify_for_eval(self, sql_session, limit: int = 50):
      sql_ids = (self.find_needs_eval_base(False)
                 .filter(or_(Artist.spotify_queued_at == None, Artist.spotify_queued_at <= func.now() - timedelta(hours=12)))
                 .filter(or_(Artist.spotify_cached_at <= func.now() - timedelta(hours=23), Artist.spotify_cached_at == None)).order_by(Artist.evaluation_id.desc()).limit(limit))
      sql_ids = sql_session.scalars(sql_ids).unique()
      return list(sql_ids)

  def find_needs_eval_refresh(self, sql_session, limit: int):
    sql_ids = (self.find_needs_eval_base(False)
               .filter(or_(Artist.eval_queued_at == None, Artist.eval_queued_at <= func.now() - timedelta(hours=12)))
               .filter(Artist.spotify_cached_at > func.now() - timedelta(hours=22)).order_by(Artist.evaluation_id.desc()).limit(limit))
    sql_ids = sql_session.scalars(sql_ids).unique()
    return list(sql_ids)