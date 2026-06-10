"""
Operator-token Spotify WRITE operations for the playlist-generation bg job.

The existing lib/spotify.py SpotifyClient is read/search-only and uses app credentials.
This module adds the playlist write operations using the operator's user token (obtained
via the dedicated Spotify OAuth app in indiestack) plus operator-token load/refresh. All
calls are paced by ``spotify_limiter``. It does NOT modify lib/spotify.py.
"""

import base64
from datetime import datetime, timedelta

import requests

from lib.rate_limiter import spotify_limiter
from lib.crypto import decrypt_secret, encrypt_secret
from lib.config import SPOTIFY_PLAYLIST_CLIENT_ID, SPOTIFY_PLAYLIST_CLIENT_SECRET
from lib.models_generation import PlaylistSpotifyConnection

SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
ACCOUNTS_TOKEN_URL = 'https://accounts.spotify.com/api/token'


def _basic_auth_header():
    raw = f'{SPOTIFY_PLAYLIST_CLIENT_ID}:{SPOTIFY_PLAYLIST_CLIENT_SECRET}'
    return 'Basic ' + base64.b64encode(raw.encode('ascii')).decode('ascii')


def get_operator_connection(sql_session, user_id, organization_id):
    return sql_session.query(PlaylistSpotifyConnection).filter(
        PlaylistSpotifyConnection.user_id == user_id,
        PlaylistSpotifyConnection.organization_id == organization_id,
    ).first()


def ensure_operator_token(sql_session, connection):
    """Return a valid operator access token, refreshing via refresh_token if near expiry."""
    now = datetime.now()
    try:
        seconds_left = (connection.expires_at - now).total_seconds()
    except (TypeError, AttributeError):
        seconds_left = -1

    if seconds_left > 60:
        return connection.access_token

    refresh_token = decrypt_secret(connection.refresh_token)
    resp = requests.post(ACCOUNTS_TOKEN_URL, headers={
        'Authorization': _basic_auth_header(),
        'Content-Type': 'application/x-www-form-urlencoded',
    }, data={'grant_type': 'refresh_token', 'refresh_token': refresh_token})
    if not resp.ok:
        raise Exception(f'Spotify operator token refresh failed: {resp.status_code} {resp.text}')
    data = resp.json()
    connection.access_token = data['access_token']
    connection.expires_at = now + timedelta(seconds=int(data.get('expires_in', 3600)))
    if data.get('refresh_token'):
        connection.refresh_token = encrypt_secret(data['refresh_token'])
    connection.updated_at = now
    sql_session.add(connection)
    sql_session.commit()
    return connection.access_token


class SpotifyPlaylistWriter:
    def __init__(self, access_token):
        self.access_token = access_token

    def _request(self, method, path, json_body=None):
        def _do():
            resp = requests.request(method, f'{SPOTIFY_API_BASE}{path}', headers={
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json',
            }, json=json_body)
            if resp.status_code > 299:
                err = Exception(f'Spotify write error {resp.status_code} on {path}: {resp.text}')
                err.status = resp.status_code
                retry_after = resp.headers.get('Retry-After')
                if retry_after:
                    err.retry_after_ms = int(retry_after) * 1000
                raise err
            if resp.status_code == 204 or not resp.text:
                return {}
            return resp.json()

        return spotify_limiter.execute(_do)

    def get_current_user(self):
        return self._request('GET', '/me')

    def get_playlist_track_ids(self, playlist_id):
        """List a playlist's track ids using the operator token (reads their private playlists)."""
        ids, seen = [], set()
        url = f'/playlists/{playlist_id}/tracks?limit=100&fields=items(track(id)),next'
        while url:
            resp = self._request('GET', url)
            for item in resp.get('items') or []:
                t = item.get('track')
                if t and t.get('id') and t['id'] not in seen:
                    seen.add(t['id'])
                    ids.append(t['id'])
            nxt = resp.get('next')
            url = nxt.replace(SPOTIFY_API_BASE, '') if nxt else None
        return ids

    def create_playlist(self, user_id, name, description, public=False):
        return self._request('POST', f'/users/{user_id}/playlists', {
            'name': name, 'description': description, 'public': public,
        })

    def add_tracks_to_playlist(self, playlist_id, uris):
        for i in range(0, len(uris), 100):
            self._request('POST', f'/playlists/{playlist_id}/tracks', {'uris': uris[i:i + 100]})

    def replace_playlist_tracks(self, playlist_id, uris):
        self._request('PUT', f'/playlists/{playlist_id}/tracks', {'uris': uris[:100]})
        for i in range(100, len(uris), 100):
            self._request('POST', f'/playlists/{playlist_id}/tracks', {'uris': uris[i:i + 100]})

    def find_my_playlist_by_name(self, name):
        offset = 0
        limit = 50
        for _ in range(40):  # 2000-playlist ceiling
            resp = self._request('GET', f'/me/playlists?limit={limit}&offset={offset}')
            items = resp.get('items', []) or []
            for p in items:
                if p.get('name') == name:
                    return p
            if not resp.get('next') or not items:
                return None
            offset += len(items)
        return None
