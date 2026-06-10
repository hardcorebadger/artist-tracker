"""
SQLAlchemy models for the playlist-generation feature.

These tables are owned (DDL) by indiestack's Prisma schema; this module mirrors them so
the generation background job can read/write them. Kept in a separate module to avoid
editing the shared lib/models.py — they register on the same declarative ``Base``.
"""

import datetime

from sqlalchemy import (
    Column, BigInteger, Integer, SmallInteger, Boolean, Text, String, TIMESTAMP,
    ForeignKey, Numeric,
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import relationship

from lib.models import Base


class PlaylistSpotifyConnection(Base):
    __tablename__ = 'playlist_spotify_connections'
    id = Column(BigInteger, autoincrement=True, primary_key=True)
    user_id = Column(String(28), nullable=False)
    organization_id = Column(String(28), nullable=False)
    spotify_user_id = Column(String(64), nullable=False)
    display_name = Column(Text, nullable=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)   # AES-256-GCM encrypted (see lib/crypto.py)
    scope = Column(Text, nullable=True)
    expires_at = Column(TIMESTAMP, nullable=False)
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)
    updated_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class GenerationJob(Base):
    __tablename__ = 'generation_jobs'
    id = Column(BigInteger, autoincrement=True, primary_key=True)
    organization_id = Column(String(28), nullable=False)
    user_id = Column(String(28), nullable=False)
    source_playlist_id = Column(String(22), nullable=True)
    source_playlist_name = Column(Text, nullable=True)
    source_playlist_url = Column(Text, nullable=True)
    source_playlist_snapshot_id = Column(Text, nullable=True)
    source_artist_id = Column(String(22), nullable=True)
    source_artist_name = Column(Text, nullable=True)
    config = Column(JSONB, nullable=False)
    status = Column(String(16), nullable=False, default='queued')
    phase = Column(Text, nullable=True)
    message = Column(Text, nullable=True)
    errors = Column(JSONB, nullable=False, default=list)
    total_playlists = Column(Integer, nullable=False, default=0)
    completed_playlists = Column(Integer, nullable=False, default=0)
    total_tracks_target = Column(Integer, nullable=False, default=0)
    tracks_discovered = Column(Integer, nullable=False, default=0)
    unique_artists_found = Column(Integer, nullable=False, default=0)
    cancellation_requested = Column(Boolean, nullable=False, default=False)
    operator_spotify_id = Column(String(64), nullable=True)
    selected_track_ids = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)
    started_at = Column(TIMESTAMP, nullable=True)
    completed_at = Column(TIMESTAMP, nullable=True)
    updated_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)

    generated_playlists = relationship(
        'GeneratedPlaylist', back_populates='generation_job', cascade='all, delete-orphan'
    )

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class GeneratedPlaylist(Base):
    __tablename__ = 'generated_playlists'
    id = Column(BigInteger, autoincrement=True, primary_key=True)
    generation_job_id = Column(BigInteger, ForeignKey('generation_jobs.id', ondelete='CASCADE'), nullable=False)
    spotify_playlist_id = Column(String(22), nullable=True, unique=True)
    name = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    spotify_url = Column(Text, nullable=True)
    snapshot_id = Column(Text, nullable=True)
    is_public = Column(Boolean, nullable=True)
    owner_spotify_id = Column(String(64), nullable=True)
    seed_artist_spotify_id = Column(String(22), nullable=True)
    seed_artist_name = Column(Text, nullable=True)
    seed_track_spotify_id = Column(String(22), nullable=True)
    seed_track_name = Column(Text, nullable=True)
    seed_track_uri = Column(Text, nullable=True)
    total_tracks = Column(Integer, nullable=True)
    status = Column(SmallInteger, nullable=False, default=0)
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)

    generation_job = relationship('GenerationJob', back_populates='generated_playlists')
    discovered_tracks = relationship(
        'DiscoveredTrack', back_populates='generated_playlist', cascade='all, delete-orphan'
    )

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class DiscoveredTrack(Base):
    __tablename__ = 'discovered_tracks'
    id = Column(BigInteger, autoincrement=True, primary_key=True)
    generated_playlist_id = Column(BigInteger, ForeignKey('generated_playlists.id', ondelete='CASCADE'), nullable=False)
    position = Column(Integer, nullable=False)
    spotify_track_id = Column(String(22), nullable=False)
    spotify_track_uri = Column(Text, nullable=True)
    spotify_track_url = Column(Text, nullable=True)
    track_name = Column(Text, nullable=True)
    isrc = Column(Text, nullable=True)
    spotify_artist_id = Column(String(22), nullable=True)
    spotify_album_id = Column(String(22), nullable=True)
    album_name = Column(Text, nullable=True)
    album_type = Column(Text, nullable=True)
    album_image_url = Column(Text, nullable=True)
    album_total_tracks = Column(Integer, nullable=True)
    release_date = Column(Text, nullable=True)
    release_date_precision = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    explicit = Column(Boolean, nullable=True)
    preview_url = Column(Text, nullable=True)
    similarity_score = Column(Numeric, nullable=True)
    source = Column(String(16), nullable=False)   # 'seed' | 'lastfm' | 'gemini'
    lastfm_track_listeners = Column(Integer, nullable=True)
    lastfm_track_playcount = Column(Integer, nullable=True)
    lastfm_track_tags = Column(ARRAY(Text), nullable=True)
    lastfm_track_mbid = Column(Text, nullable=True)
    lastfm_enriched_at = Column(TIMESTAMP, nullable=True)
    added_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)

    generated_playlist = relationship('GeneratedPlaylist', back_populates='discovered_tracks')

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class SpotifyArtistCache(Base):
    __tablename__ = 'spotify_artist_cache'
    search_name_normalized = Column(Text, primary_key=True)
    spotify_artist_id = Column(String(22), nullable=False)
    spotify_artist_name = Column(Text, nullable=True)
    spotify_top_track_id = Column(String(22), nullable=True)
    spotify_top_track_uri = Column(Text, nullable=True)
    spotify_top_track_name = Column(Text, nullable=True)
    resolved_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)
    last_used_at = Column(TIMESTAMP, nullable=False, default=datetime.datetime.now)

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
