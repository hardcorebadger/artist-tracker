"""
Playlist-generation controller — the per-job discovery + Spotify-write pipeline.

Python port of the sample app's processSeedStep, run as the ``generateplaylisttask``
Cloud Task. NEW code: it does not modify existing controllers or background jobs.

Flow per job: load operator token -> resolve seeds from selected track ids -> for each
seed: Last.fm similar -> resolve Spotify top track (cached) -> enrich -> create/reuse the
operator's playlist -> persist generated_playlists + discovered_tracks -> bump progress.
Gemini fallback and MusicBrainz enrichment are Phase 2 (intentionally omitted here).
"""

import time
import traceback
from datetime import datetime

import requests
from sqlalchemy import text

from lib import lastfm
from lib.rate_limiter import spotify_limiter, RateLimitError
from lib.errors import ErrorResponse
from lib.config import AI_FALLBACK_URL, INTERNAL_API_SECRET
from lib.models_generation import GenerationJob, GeneratedPlaylist, DiscoveredTrack, SpotifyArtistCache
from lib.spotify_playlist_writer import (
    SpotifyPlaylistWriter, get_operator_connection, ensure_operator_token,
)
from lib.spotify_operator import OperatorSpotifyClient

# Per-seed discovery budget — ship a shorter playlist rather than exceed the task deadline.
DISCOVERY_DEADLINE_S = 30


class GenerationController:
    def __init__(self, spotify, sql_session, db):
        # `spotify` (app-credential client) is intentionally ignored: generation must read with the
        # operator's OAuth token only. process_job builds an OperatorSpotifyClient once the token loads.
        self.spotify = spotify
        self.sql = sql_session
        self.db = db

    def process_job(self, job_id):
        job = self.sql.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            return f'Generation job {job_id} not found'
        if job.status not in ('queued', 'running'):
            return f'Generation job {job_id} already processed (status {job.status})'

        job.status = 'running'
        if job.started_at is None:
            job.started_at = datetime.now()
        self.sql.add(job)
        self.sql.commit()

        try:
            connection = get_operator_connection(self.sql, job.user_id, job.organization_id)
            if not connection:
                raise Exception('No Spotify connection for this operator')
            access_token = ensure_operator_token(self.sql, connection)
            # All generation reads use the operator's OAuth token (never the shared app pairs).
            self.spotify = OperatorSpotifyClient(
                self.db, access_token,
                token_provider=lambda: ensure_operator_token(self.sql, connection),
            )
            writer = SpotifyPlaylistWriter(access_token)
            operator_spotify_id = writer.get_current_user().get('id')
            job.operator_spotify_id = operator_spotify_id

            seeds = self._resolve_seeds(job)
            job.total_playlists = len(seeds)
            self.sql.add(job)
            self.sql.commit()

            cfg = job.config or {}
            tracks_per = int(cfg.get('tracks_per_playlist', 25))
            name_template = cfg.get('name_template', '{artist} — discovery')
            make_public = bool(cfg.get('make_public', False))

            for index, seed in enumerate(seeds):
                self.sql.refresh(job)
                if job.cancellation_requested:
                    break
                try:
                    self._process_seed(job, writer, operator_spotify_id, seed, index,
                                       tracks_per, name_template, make_public)
                except (ErrorResponse, RateLimitError) as e:
                    self._record_seed_error(job, seed['artist_name'], str(getattr(e, 'data', e)))
                except Exception as e:
                    print(traceback.format_exc())
                    self._record_seed_error(job, seed['artist_name'], str(e))

            self._recompute_counts(job)
            self.sql.refresh(job)
            job.status = 'cancelled' if job.cancellation_requested else 'completed'
            job.phase = 'done'
            job.completed_at = datetime.now()
            self.sql.add(job)
            self.sql.commit()
            return f'Generation {job_id}: {job.status} ({job.completed_playlists}/{job.total_playlists})'
        except Exception as e:
            print(traceback.format_exc())
            self.sql.refresh(job)
            job.status = 'failed'
            job.message = str(e)
            job.completed_at = datetime.now()
            self.sql.add(job)
            self.sql.commit()
            return f'Generation {job_id} failed: {e}'

    # -- seeds -----------------------------------------------------------------

    def _resolve_seeds(self, job):
        # If the operator selected specific tracks, seed from those; a single source artist
        # yields one seed (replaces the old lookalike entry); otherwise derive one seed per
        # artist from the source playlist (each artist's top track as the seed).
        track_ids = job.selected_track_ids or []
        if track_ids:
            return self._seeds_from_tracks(track_ids)
        if job.source_artist_id:
            return self._seeds_from_artist(job.source_artist_id, job.source_artist_name)
        return self._seeds_from_playlist(job.source_playlist_id)

    def _seeds_from_tracks(self, track_ids):
        seeds = []
        seen_artists = set()
        for track_id in track_ids:
            try:
                track = spotify_limiter.execute(lambda tid=track_id: self.spotify.get_cached(tid, 'track', None))
            except Exception as e:
                print(f'seed track {track_id} fetch failed: {e}')
                continue
            if not track or not track.get('artists'):
                continue
            artist = track['artists'][0]
            aid = artist.get('id')
            if not aid or aid in seen_artists:
                continue
            seen_artists.add(aid)
            album = track.get('album') or {}
            images = album.get('images') or []
            seeds.append({
                'artist_spotify_id': aid,
                'artist_name': artist.get('name'),
                'track_spotify_id': track.get('id'),
                'track_name': track.get('name'),
                'track_uri': track.get('uri') or f'spotify:track:{track.get("id")}',
                'album_name': album.get('name'),
                'album_image_url': images[0]['url'] if images else None,
            })
        return seeds

    def _seeds_from_playlist(self, playlist_id):
        seeds = []
        seen = set()
        try:
            _ids, _name, _img, artists = spotify_limiter.execute(lambda: self.spotify.get_playlist_artists(playlist_id))
        except Exception as e:
            print(f'resolve seeds from playlist {playlist_id} failed: {e}')
            return []
        for a in artists:
            aid = a.get('id')
            if not aid or aid in seen:
                continue
            seen.add(aid)
            try:
                top = spotify_limiter.execute(lambda artist_id=aid: self.spotify.get_artist_top_tracks(artist_id))
            except Exception as e:
                print(f'top tracks for {aid} failed: {e}')
                continue
            tracks = (top or {}).get('tracks', [])
            if not tracks:
                continue
            t = tracks[0]
            album = t.get('album') or {}
            images = album.get('images') or []
            seeds.append({
                'artist_spotify_id': aid,
                'artist_name': a.get('name'),
                'track_spotify_id': t.get('id'),
                'track_name': t.get('name'),
                'track_uri': t.get('uri') or f'spotify:track:{t.get("id")}',
                'album_name': album.get('name'),
                'album_image_url': images[0]['url'] if images else None,
            })
        return seeds

    def _seeds_from_artist(self, artist_id, artist_name):
        # Single-artist seed: the artist's top track seeds one discovery playlist of
        # similar artists. Mirrors the per-artist branch of _seeds_from_playlist.
        try:
            top = spotify_limiter.execute(lambda: self.spotify.get_artist_top_tracks(artist_id))
        except Exception as e:
            print(f'top tracks for artist {artist_id} failed: {e}')
            return []
        tracks = (top or {}).get('tracks', [])
        if not tracks:
            return []
        t = tracks[0]
        name = artist_name
        if not name:
            name = (t.get('artists') or [{}])[0].get('name')
        album = t.get('album') or {}
        images = album.get('images') or []
        return [{
            'artist_spotify_id': artist_id,
            'artist_name': name,
            'track_spotify_id': t.get('id'),
            'track_name': t.get('name'),
            'track_uri': t.get('uri') or f'spotify:track:{t.get("id")}',
            'album_name': album.get('name'),
            'album_image_url': images[0]['url'] if images else None,
        }]

    # -- discovery -------------------------------------------------------------

    def _discover_tracks(self, seed, target):
        start = time.monotonic()

        def past_deadline():
            return (time.monotonic() - start) > DISCOVERY_DEADLINE_S

        picked = [{
            'spotify_artist_id': seed['artist_spotify_id'],
            'artist_name': seed['artist_name'],
            'spotify_track_id': seed['track_spotify_id'],
            'track_name': seed['track_name'],
            'track_uri': seed['track_uri'],
            'spotify_url': f'https://open.spotify.com/track/{seed["track_spotify_id"]}',
            'similarity_score': None, 'source': 'seed',
            'album_id': None, 'album_name': seed.get('album_name'), 'album_type': None,
            'album_image_url': seed.get('album_image_url'),
            'album_total_tracks': None, 'release_date': None, 'duration_ms': None, 'isrc': None,
            'lastfm_track_listeners': None, 'lastfm_track_playcount': None, 'lastfm_track_tags': [],
        }]
        used = {seed['artist_spotify_id']}

        for cand in lastfm.get_similar_artists(seed['artist_name'], 80):
            if len(picked) >= target + 1 or past_deadline():
                break
            name = cand.get('name')
            if not name:
                continue
            try:
                resolved = self._resolve_top_track(name)
            except (ErrorResponse, RateLimitError):
                # Hard rate limit — stop discovery and ship what we have.
                break
            except Exception as e:
                print(f'skip candidate "{name}": {e}')
                continue
            if not resolved:
                continue
            artist, track = resolved
            aid = artist.get('id')
            if not aid or aid in used:
                continue
            used.add(aid)
            track_info = lastfm.get_track_info(name, track.get('name'))
            picked.append(self._track_to_picked(artist, track, cand, track_info))

        # AI fallback (optional) — top up niche seeds when Last.fm comes up short.
        if len(picked) < target + 1 and not past_deadline():
            needed = (target + 1 - len(picked)) * 2
            exclude = [p['artist_name'] for p in picked]
            for name in self._ai_suggest(seed['artist_name'], exclude, needed):
                if len(picked) >= target + 1 or past_deadline():
                    break
                try:
                    resolved = self._resolve_top_track(name)
                except (ErrorResponse, RateLimitError):
                    break
                except Exception as e:
                    print(f'skip AI candidate "{name}": {e}')
                    continue
                if not resolved:
                    continue
                artist, track = resolved
                aid = artist.get('id')
                if not aid or aid in used:
                    continue
                used.add(aid)
                track_info = lastfm.get_track_info(name, track.get('name'))
                picked_track = self._track_to_picked(artist, track, {'match': None}, track_info)
                picked_track['source'] = 'gemini'
                picked.append(picked_track)

        return picked, used

    def _resolve_top_track(self, name):
        norm = name.lower().strip()
        cached = self.sql.query(SpotifyArtistCache).filter(SpotifyArtistCache.search_name_normalized == norm).first()
        if cached and cached.spotify_top_track_id:
            track = spotify_limiter.execute(lambda: self.spotify.get_cached(cached.spotify_top_track_id, 'track', None))
            if track:
                artist = spotify_limiter.execute(lambda: self.spotify.get_artist(cached.spotify_artist_id))
                cached.last_used_at = datetime.now()
                self.sql.add(cached)
                self.sql.commit()
                return artist, track

        result = self._search_artist_top_track(name)
        if not result:
            return None
        artist, track = result
        try:
            is_new = cached is None
            if is_new:
                cached = SpotifyArtistCache(search_name_normalized=norm)
            cached.spotify_artist_id = artist.get('id')
            cached.spotify_artist_name = artist.get('name')
            cached.spotify_top_track_id = track.get('id')
            cached.spotify_top_track_uri = track.get('uri')
            cached.spotify_top_track_name = track.get('name')
            cached.last_used_at = datetime.now()
            if is_new:
                self.sql.add(cached)
            self.sql.commit()
        except Exception:
            self.sql.rollback()
        return artist, track

    def _search_artist_top_track(self, name):
        query = f'artist:"{name}"'
        resp = spotify_limiter.execute(lambda: self.spotify.get('/search', {'q': query, 'type': 'track', 'limit': 10, 'market': 'US'}))
        items = ((resp.get('tracks', {}) or {}).get('items', [])) if resp else []
        if not items:
            return None
        norm = name.lower().strip()
        for track in items:
            for artist in track.get('artists', []):
                if artist.get('name', '').lower().strip() == norm:
                    return artist, track
        first = items[0]
        first_artist = (first.get('artists') or [{}])[0]
        fan = first_artist.get('name', '').lower()
        if fan and (norm in fan or fan in norm):
            return first_artist, first
        return None

    @staticmethod
    def _track_to_picked(artist, track, cand, track_info):
        album = track.get('album', {}) or {}
        images = album.get('images', []) or []
        return {
            'spotify_artist_id': artist.get('id'),
            'artist_name': artist.get('name'),
            'spotify_track_id': track.get('id'),
            'track_name': track.get('name'),
            'track_uri': track.get('uri') or f'spotify:track:{track.get("id")}',
            'spotify_url': (track.get('external_urls', {}) or {}).get('spotify') or f'https://open.spotify.com/track/{track.get("id")}',
            'similarity_score': float(cand['match']) if cand.get('match') else None,
            'source': 'lastfm',
            'album_id': album.get('id'),
            'album_name': album.get('name'),
            'album_type': album.get('album_type'),
            'album_image_url': images[0]['url'] if images else None,
            'album_total_tracks': album.get('total_tracks'),
            'release_date': album.get('release_date'),
            'duration_ms': track.get('duration_ms'),
            'isrc': (track.get('external_ids', {}) or {}).get('isrc'),
            'lastfm_track_listeners': track_info.get('listeners') if track_info else None,
            'lastfm_track_playcount': track_info.get('playcount') if track_info else None,
            'lastfm_track_tags': track_info.get('tags') if track_info else [],
        }

    @staticmethod
    def _ai_suggest(seed_artist, exclude, count):
        if not AI_FALLBACK_URL or not INTERNAL_API_SECRET:
            return []
        try:
            resp = requests.post(
                AI_FALLBACK_URL,
                headers={'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_API_SECRET},
                json={'seedArtist': seed_artist, 'exclude': exclude, 'count': count},
                timeout=30,
            )
            if not resp.ok:
                return []
            return resp.json().get('artists', []) or []
        except Exception as e:
            print(f'AI fallback request failed: {e}')
            return []

    # -- per-seed processing ---------------------------------------------------

    def _process_seed(self, job, writer, operator_spotify_id, seed, index, tracks_per, name_template, make_public):
        # Idempotent resume: if a retried task already built this seed's playlist for THIS job,
        # skip it — prevents duplicate Spotify writes and inflated counters.
        done = self.sql.query(GeneratedPlaylist).filter(
            GeneratedPlaylist.generation_job_id == job.id,
            GeneratedPlaylist.seed_artist_spotify_id == seed['artist_spotify_id'],
            GeneratedPlaylist.status == 3,
        ).first()
        if done:
            return

        playlist_name = name_template.replace('{artist}', seed['artist_name'])
        job.phase = 'discovering'
        job.message = f'Playlist {index + 1}/{job.total_playlists}: {playlist_name}'
        self.sql.add(job)
        self.sql.commit()

        picked, used = self._discover_tracks(seed, tracks_per)
        uris = [p['track_uri'] for p in picked if p.get('track_uri')]

        job.phase = 'creating'
        job.message = f'Creating playlist: {playlist_name} ({len(picked)} tracks)'
        self.sql.add(job)
        self.sql.commit()

        # Idempotency: reuse a same-named playlist (replace its tracks) instead of duplicating.
        existing = writer.find_my_playlist_by_name(playlist_name)
        if existing:
            playlist = existing
            writer.replace_playlist_tracks(playlist['id'], uris)
        else:
            playlist = writer.create_playlist(
                operator_spotify_id, playlist_name,
                f'Auto-generated by newwrld. Seed: {seed["artist_name"]} — {seed["track_name"]}.',
                make_public,
            )
            writer.add_tracks_to_playlist(playlist['id'], uris)

        gp = self.sql.query(GeneratedPlaylist).filter(GeneratedPlaylist.spotify_playlist_id == playlist['id']).first()
        is_new = gp is None
        if is_new:
            gp = GeneratedPlaylist(generation_job_id=job.id, spotify_playlist_id=playlist['id'])
        else:
            # Reusing a same-named playlist from a prior run (spotify_playlist_id is globally
            # unique) — re-point it to THIS job so the current generation shows its playlists.
            gp.generation_job_id = job.id
        gp.name = playlist_name
        gp.description = f'Auto-generated by newwrld. Seed: {seed["artist_name"]}'
        gp.spotify_url = (playlist.get('external_urls', {}) or {}).get('spotify')
        gp.snapshot_id = playlist.get('snapshot_id')
        gp.is_public = make_public
        gp.owner_spotify_id = operator_spotify_id
        gp.seed_artist_spotify_id = seed['artist_spotify_id']
        gp.seed_artist_name = seed['artist_name']
        gp.seed_track_spotify_id = seed['track_spotify_id']
        gp.seed_track_name = seed['track_name']
        gp.seed_track_uri = seed['track_uri']
        gp.total_tracks = len(picked)
        gp.status = 3
        if is_new:
            self.sql.add(gp)
        self.sql.commit()

        # Replace this playlist's discovered tracks (idempotent on retry).
        self.sql.query(DiscoveredTrack).filter(DiscoveredTrack.generated_playlist_id == gp.id).delete()
        for i, p in enumerate(picked):
            self.sql.add(DiscoveredTrack(
                generated_playlist_id=gp.id,
                position=i + 1,
                spotify_track_id=p['spotify_track_id'],
                spotify_track_uri=p.get('track_uri'),
                spotify_track_url=p.get('spotify_url'),
                track_name=p.get('track_name'),
                isrc=p.get('isrc'),
                spotify_artist_id=p.get('spotify_artist_id'),
                spotify_album_id=p.get('album_id'),
                album_name=p.get('album_name'),
                album_type=p.get('album_type'),
                album_image_url=p.get('album_image_url'),
                album_total_tracks=p.get('album_total_tracks'),
                release_date=p.get('release_date'),
                duration_ms=p.get('duration_ms'),
                similarity_score=p.get('similarity_score'),
                source=p.get('source'),
                lastfm_track_listeners=p.get('lastfm_track_listeners'),
                lastfm_track_playcount=p.get('lastfm_track_playcount'),
                lastfm_track_tags=p.get('lastfm_track_tags') or [],
                lastfm_enriched_at=datetime.now() if p.get('lastfm_track_listeners') is not None else None,
            ))
        self.sql.commit()

        # Clear any stale error from a prior failed attempt at this seed, then derive the
        # progress counters from the actual rows (idempotent — retries can't inflate them).
        self._clear_seed_error(job, seed['artist_name'])
        self._recompute_counts(job)

    def _record_seed_error(self, job, artist_name, message):
        errors = list(job.errors or [])
        errors.append({'seed_artist': artist_name, 'error': message, 'timestamp': datetime.now().isoformat()})
        job.errors = errors
        self.sql.add(job)
        self.sql.commit()

    def _clear_seed_error(self, job, artist_name):
        if not job.errors:
            return
        remaining = [e for e in job.errors if e.get('seed_artist') != artist_name]
        if len(remaining) != len(job.errors):
            job.errors = remaining
            self.sql.add(job)
            self.sql.commit()

    def _recompute_counts(self, job):
        # Counters derived from the generated rows so a retried/duplicated run can't inflate them.
        self.sql.execute(text(
            'UPDATE generation_jobs g SET '
            'completed_playlists = (SELECT COUNT(*) FROM generated_playlists WHERE generation_job_id = g.id), '
            'tracks_discovered = (SELECT COALESCE(SUM(total_tracks), 0) FROM generated_playlists WHERE generation_job_id = g.id), '
            'unique_artists_found = (SELECT COUNT(DISTINCT dt.spotify_artist_id) FROM discovered_tracks dt '
            'JOIN generated_playlists gp ON dt.generated_playlist_id = gp.id WHERE gp.generation_job_id = g.id), '
            'updated_at = NOW() WHERE g.id = :id'
        ), {'id': job.id})
        self.sql.commit()
