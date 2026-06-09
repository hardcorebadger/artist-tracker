"""
Last.fm API client — Python port of the sample app's src/lib/lastfm.ts.

Primary similar-artist discovery engine (Spotify's recommendations are deprecated in
dev mode). All requests are paced by ``lastfm_limiter`` (5 req/s). In-memory caches
mirror the TS client and live for the duration of a single task invocation.
"""

import requests

from lib.rate_limiter import lastfm_limiter
from lib.config import LASTFM_API_KEY

LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/'
USER_AGENT = 'newwrld-playlist-builder/1.0'

_similar_cache = {}
_artist_info_cache = {}
_track_info_cache = {}


def _raise_if_rate_limited(response):
    if response.status_code == 429:
        err = Exception('Last.fm rate limited')
        err.status = 429
        retry_after = response.headers.get('Retry-After')
        if retry_after:
            err.retry_after_ms = int(retry_after) * 1000
        raise err


def get_similar_artists(artist_name, limit=200):
    """Return similar artists sorted by match score (desc). Each item: {name, match, ...}."""
    cache_key = artist_name.lower().strip()
    if cache_key in _similar_cache:
        return _similar_cache[cache_key]

    def _do():
        params = {
            'method': 'artist.getsimilar', 'artist': artist_name,
            'api_key': LASTFM_API_KEY, 'format': 'json', 'limit': str(limit),
        }
        resp = requests.get(LASTFM_API_BASE, params=params, headers={'User-Agent': USER_AGENT})
        _raise_if_rate_limited(resp)
        if not resp.ok:
            # Last.fm returns 200 with an error object for "not found"; a real HTTP error is rare.
            print(f'Last.fm API error for "{artist_name}": {resp.status_code}')
            return []
        data = resp.json()
        if data.get('error'):
            print(f'Last.fm error for "{artist_name}": {data.get("message")}')
            return []
        similar = (data.get('similarartists', {}) or {}).get('artist')
        if not similar:
            return []
        similar.sort(key=lambda a: float(a.get('match') or 0), reverse=True)
        _similar_cache[cache_key] = similar
        return similar

    return lastfm_limiter.execute(_do)


def get_artist_info(artist_name):
    """Return {listeners, playcount, tags, url} or None."""
    cache_key = artist_name.lower().strip()
    if cache_key in _artist_info_cache:
        return _artist_info_cache[cache_key]

    def _do():
        params = {
            'method': 'artist.getinfo', 'artist': artist_name,
            'api_key': LASTFM_API_KEY, 'format': 'json', 'autocorrect': '1',
        }
        resp = requests.get(LASTFM_API_BASE, params=params, headers={'User-Agent': USER_AGENT})
        _raise_if_rate_limited(resp)
        if not resp.ok:
            return None
        data = resp.json()
        if data.get('error') or not data.get('artist'):
            return None
        a = data['artist']
        stats = a.get('stats', {}) or {}
        tags = [t['name'] for t in (a.get('tags', {}) or {}).get('tag', []) if 'name' in t]
        info = {
            'listeners': int(stats.get('listeners') or 0),
            'playcount': int(stats.get('playcount') or 0),
            'tags': tags,
            'url': a.get('url') or '',
        }
        _artist_info_cache[cache_key] = info
        return info

    return lastfm_limiter.execute(_do)


def get_track_info(artist_name, track_name):
    """Return {mbid, listeners, playcount, tags} or None."""
    cache_key = f'{artist_name.lower().strip()}|{track_name.lower().strip()}'
    if cache_key in _track_info_cache:
        return _track_info_cache[cache_key]

    def _do():
        params = {
            'method': 'track.getinfo', 'artist': artist_name, 'track': track_name,
            'api_key': LASTFM_API_KEY, 'format': 'json', 'autocorrect': '1',
        }
        resp = requests.get(LASTFM_API_BASE, params=params, headers={'User-Agent': USER_AGENT})
        _raise_if_rate_limited(resp)
        if not resp.ok:
            _track_info_cache[cache_key] = None
            return None
        data = resp.json()
        if data.get('error') or not data.get('track'):
            _track_info_cache[cache_key] = None
            return None
        t = data['track']
        tags = [x['name'] for x in (t.get('toptags', {}) or {}).get('tag', []) if 'name' in x]
        info = {
            'mbid': t.get('mbid') or None,
            'listeners': int(t.get('listeners') or 0),
            'playcount': int(t.get('playcount') or 0),
            'tags': tags,
        }
        _track_info_cache[cache_key] = info
        return info

    return lastfm_limiter.execute(_do)
