"""
Operator-token Spotify READ client for the playlist-generation bg job.

The base lib/spotify.py SpotifyClient authenticates with app credentials (client-credentials)
and rotates between the shared app token pairs on a 429. Generation must NEVER touch the shared
app pairs — every read has to use the operator's own OAuth user token (from the dedicated
playlist Spotify app). This subclass reuses all of SpotifyClient's read helpers (get_cached,
get_artist, get_artist_top_tracks, get_playlist, get_playlist_artists, get, …) unchanged and only
overrides the auth so the Bearer is always the operator token, with no app-credential fallback.

It does NOT modify lib/spotify.py.
"""

from requests.exceptions import JSONDecodeError

import requests

from .spotify import SpotifyClient
from .errors import ErrorResponse


class OperatorSpotifyClient(SpotifyClient):
    """SpotifyClient backed by the operator's OAuth user token (no app-credential rotation)."""

    def __init__(self, db, access_token, token_provider=None):
        self.db = db
        self.root_uri = "https://api.spotify.com/v1"
        self.access_token = access_token        # operator OAuth user token
        self.token_provider = token_provider     # () -> fresh operator token, used to refresh on 401
        self.authorized = True
        self.alt_token = None
        self.user_token = None
        self.authorizedAlt = False
        self.authorizedUser = False
        # App-cred fields are unused here (auth/get are overridden); None-set as insurance so no
        # inherited path can ever reach the shared app credentials.
        self.client_id = None
        self.client_secret = None
        self.alt_client_id = None
        self.alt_client_secret = None
        self.user_client_id = None
        self.user_client_secret = None

    def get(self, path, data=None, alt_token=False, attempt=1):
        # Always the operator Bearer. Refresh once on 401; map 429 -> 299 (handled, no retry) WITHOUT
        # rotating to an app token. alt_token is ignored on purpose — generation has one token.
        print("Spotify Request (operator): " + path)
        res = requests.get(f"{self.root_uri}{path}", headers={
            "Authorization": f"Bearer {self.access_token}",
        }, params=data)

        if res.status_code > 299:
            if res.status_code == 401 and attempt == 1 and self.token_provider:
                print("Operator token expired, refreshing")
                self.access_token = self.token_provider()
                return self.get(path, data, attempt=2)
            if res.status_code == 429:
                print("Spotify Rate Limiting (operator)")
                if 'retry-after' in res.headers:
                    print(f"Retry After: {res.headers['retry-after']}")
                raise ErrorResponse({"error": res.text}, 299, "Spotify")
            try:
                raise ErrorResponse(res.json(), res.status_code, "Spotify")
            except JSONDecodeError:
                raise ErrorResponse({"error": res.text}, res.status_code, "Spotify")

        return res.json()

    def authorize(self, alt_token=False):
        # Never mint app-credential tokens for generation. The operator token is managed externally
        # (ensure_operator_token) and refreshed via token_provider on 401.
        return
