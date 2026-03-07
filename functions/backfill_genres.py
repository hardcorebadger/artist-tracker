"""
One-time backfill script: Pull Spotify genres from Firestore → PostgreSQL artist_tags (tag_type_id=3).
SongStats genres (tag_type_id=4) will populate naturally via ingest and eval going forward.

Usage:
  cd functions
  GOOGLE_APPLICATION_CREDENTIALS=creds/artist-tracker-e5cce-firebase-adminsdk-uvels-b413329744.json venv/bin/python3 backfill_genres.py
"""

import os

# Load .env manually (no python-dotenv in venv)
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
from lib.models import Artist, ArtistTag

PROJECT_ID = os.environ['PROJECT_ID']
LOCATION = os.environ['LOCATION']
SQL_INSTANCE = os.environ['SQL_INSTANCE']
SQL_USER = os.environ['SQL_USER']
SQL_PASSWORD = os.environ['SQL_PASSWORD']
SQL_DB = os.environ['SQL_DB']

SPOTIFY_GENRE_TAG_TYPE = 3
BATCH_SIZE = 50

def main():
    # Connect to Firestore
    db = firestore.Client()
    print("Connected to Firestore")

    # Connect to PostgreSQL
    sql = CloudSQLClient(PROJECT_ID, LOCATION, SQL_INSTANCE, SQL_USER, SQL_PASSWORD, SQL_DB)
    session = sql.get_session()
    print("Connected to PostgreSQL")

    # Fetch all artists from Firestore
    docs = db.collection('artists_v2').get()
    print(f"Fetched {len(docs)} artists from Firestore")

    total = 0
    with_genres = 0
    tags_written = 0
    skipped_no_sql = 0
    skipped_dupes = 0
    batch_count = 0

    for doc in docs:
        total += 1
        data = doc.to_dict()
        genres = data.get('genres', [])

        if not genres:
            continue

        with_genres += 1
        spotify_id = doc.id

        # Look up artist in PostgreSQL
        sql_ref = session.scalars(
            select(Artist)
            .where(Artist.spotify_id == spotify_id)
            .options(joinedload(Artist.tags, innerjoin=False))
        ).first()

        if sql_ref is None:
            skipped_no_sql += 1
            continue

        # Add genre tags, skipping dupes
        for genre in genres:
            exists = any(
                t.tag == genre and t.tag_type_id == SPOTIFY_GENRE_TAG_TYPE
                for t in sql_ref.tags
            )
            if exists:
                skipped_dupes += 1
                continue

            sql_ref.tags.append(ArtistTag(
                tag_type_id=SPOTIFY_GENRE_TAG_TYPE,
                tag=genre,
                organization_id=None,
            ))
            tags_written += 1

        batch_count += 1
        if batch_count >= BATCH_SIZE:
            session.commit()
            print(f"  Committed batch ({total} processed, {tags_written} tags written)")
            batch_count = 0

    # Final commit
    session.commit()
    session.close()

    print(f"\nDone!")
    print(f"  Total artists in Firestore: {total}")
    print(f"  Artists with genres: {with_genres}")
    print(f"  Artists not in PostgreSQL (skipped): {skipped_no_sql}")
    print(f"  Genre tags written: {tags_written}")
    print(f"  Duplicate tags skipped: {skipped_dupes}")


if __name__ == '__main__':
    main()
