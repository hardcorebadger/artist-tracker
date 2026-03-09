"""
Backfill script: Fetch SongStats genres for artists that have zero songstats_genre tags (tag_type_id=4).
Uses the cached SongstatsClient so results are stored in Firestore songstats_cache.

Usage:
  cd functions
  GOOGLE_APPLICATION_CREDENTIALS=creds/artist-tracker-e5cce-firebase-adminsdk-uvels-b413329744.json venv/bin/python3 backfill_songstats_genres.py
"""

import os
import time

# Load .env manually
with open(os.path.join(os.path.dirname(__file__), '.env')) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"'))

from google.cloud import firestore
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from lib.cloud_sql import CloudSQLClient
from lib.models import Artist, ArtistTag, Statistic
from lib.songstats import SongstatsClient
from lib.errors import ErrorResponse

from datetime import datetime

PROJECT_ID = os.environ['PROJECT_ID']
LOCATION = os.environ['LOCATION']
SQL_INSTANCE = os.environ['SQL_INSTANCE']
SQL_USER = os.environ['SQL_USER']
SQL_PASSWORD = os.environ['SQL_PASSWORD']
SQL_DB = os.environ['SQL_DB']
SONGSTATS_API_KEY = os.environ['SONGSTATS_API_KEY']

SONGSTATS_GENRE_TAG_TYPE = 4
BATCH_SIZE = 50

def main():
    db = firestore.Client()
    print("Connected to Firestore")

    sql = CloudSQLClient(PROJECT_ID, LOCATION, SQL_INSTANCE, SQL_USER, SQL_PASSWORD, SQL_DB)
    session = sql.get_session()
    print("Connected to PostgreSQL")

    songstats = SongstatsClient(SONGSTATS_API_KEY, db)
    print("SongstatsClient initialized with cache enabled")

    # Find artists that have NO songstats genre tags (tag_type_id=4)
    # and have at least one statistic updated in 2026
    has_ss_genres = select(ArtistTag.artist_id).where(
        ArtistTag.tag_type_id == SONGSTATS_GENRE_TAG_TYPE
    ).distinct().subquery()

    has_recent_stats = select(Statistic.artist_id).where(
        Statistic.updated_at >= datetime(2026, 1, 1)
    ).distinct().subquery()

    artists = session.scalars(
        select(Artist)
        .where(Artist.onboarded == True)
        .where(Artist.spotify_id.isnot(None))
        .where(Artist.id.notin_(select(has_ss_genres)))
        .where(Artist.id.in_(select(has_recent_stats)))
        .options(joinedload(Artist.tags, innerjoin=False))
    ).unique().all()

    total = len(artists)
    print(f"Found {total} onboarded artists with no SongStats genre tags\n")

    fetched = 0
    tags_written = 0
    skipped_dupes = 0
    errors = 0
    batch_count = 0

    for i, artist in enumerate(artists):
        if i > 0 and i % 10 == 0:
            time.sleep(1)

        spotify_id = artist.spotify_id
        print(f"[{i+1}/{total}] {artist.name} ({spotify_id}) id={artist.id}")

        try:
            info = songstats.get_artist_info(spotify_id)
            fetched += 1
        except ErrorResponse as e:
            print(f"  ERROR {e.status_code}: {e}")
            errors += 1
            continue
        except Exception as e:
            print(f"  ERROR: {e}")
            errors += 1
            continue

        genres = info.get('artist_info', {}).get('genres', [])
        if not genres:
            print(f"  No genres returned")
            continue

        print(f"  Genres: {genres}")

        for genre in genres:
            exists = any(
                t.tag == genre and t.tag_type_id == SONGSTATS_GENRE_TAG_TYPE
                for t in artist.tags
            )
            if exists:
                skipped_dupes += 1
                continue

            artist.tags.append(ArtistTag(
                tag_type_id=SONGSTATS_GENRE_TAG_TYPE,
                tag=genre,
                organization_id=None,
            ))
            tags_written += 1

        batch_count += 1
        if batch_count >= BATCH_SIZE:
            session.commit()
            pct = round((i+1) / total * 100)
            print(f"\n  -- Progress: {i+1}/{total} ({pct}%) | tags: {tags_written} | errors: {errors}\n")
            batch_count = 0

    session.commit()
    session.close()

    print(f"\nDone!")
    print(f"  Artists processed: {total}")
    print(f"  SongStats API fetched (includes cache hits): {fetched}")
    print(f"  Genre tags written: {tags_written}")
    print(f"  Duplicate tags skipped: {skipped_dupes}")
    print(f"  Errors: {errors}")


if __name__ == '__main__':
    main()
