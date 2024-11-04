import datetime

from sqlalchemy import Column, Integer, SmallInteger, JSON, Float, Boolean, Text, Uuid, String, TIMESTAMP, create_engine, ForeignKey
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Artist(Base):
    __tablename__ = 'artists'

    id = Column(Uuid, primary_key=True)
    name = Column(String(256))
    spotify_id = Column(String(22), unique=True)
    onboard_wait_until = Column(TIMESTAMP, nullable=True, index=True)
    evaluation_id = Column(Integer, ForeignKey('evaluations.id'), nullable=True)
    avatar = Column(Text)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    def __repr__(self):
        return f"<Artist({self.id=}, {self.name=}, {self.spotify_id=}, {self.onboard_wait_until=}, {self.avatar}, {self.evaluation_id})>"

class Evaluation(Base):
    __tablename__ = 'evaluations'

    id = Column(Integer, autoincrement=True, primary_key=True)
    artist_id = Column(Uuid, ForeignKey('artists.id'), nullable=False)
    dirty_back_catalog = Column(Boolean, nullable=False, default=False)
    distributor = Column(String(256), nullable=True)
    distributor_type = Column(SmallInteger, nullable=True)
    label = Column(String(256), nullable=True)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))


class OrganizationArtist(Base):
    __tablename__ = 'organizations_artists'

    organization_id = Column(String(28), nullable=False, primary_key=True)
    artist_id = Column(Uuid, ForeignKey('artists.id'), nullable=False, primary_key=True)
    favorite = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))

class UserArtist(Base):
    __tablename__ = 'user_artists'
    user_id = Column(String(28),  nullable=False, primary_key=True)
    organization_id = Column(String(28), nullable=False, primary_key=True)
    artist_id = Column(Uuid, ForeignKey('artists.id'), nullable=False, primary_key=True)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))


class Statistic(Base):
    __tablename__ = 'statistics'
    artist_id = Column(Uuid, ForeignKey('artists.id'), nullable=False, primary_key=True)
    statistic_type_id = Column(Integer, ForeignKey('statistic_types.id'), nullable=False)
    latest = Column(Float, nullable=False)
    before_latest = Column(Float, nullable=False)
    week_over_week = Column(Float, nullable=False)
    month_over_month = Column(Float, nullable=False)
    min = Column(Float, nullable=False)
    max = Column(Float, nullable=False)
    avg = Column(Float, nullable=False)
    data = Column(JSON, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))

class StatisticType(Base):
    __tablename__ = 'statistic_types'
    id = Column(Integer, autoincrement=True, primary_key=True)
    name = Column(Text, nullable=False)
    key = Column(String(128), nullable=False)
    source = Column(String(256), nullable=False)
    format = Column(String(8), nullable=False,default="float")
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    def __repr__(self):
        return f"<StatisticType({self.id=}, {self.name=}, {self.key=}, {self.source=}, {self.format})>"

class ArtistLink(Base):
    __tablename__ = 'artist_links'
    id = Column(Integer, autoincrement=True, primary_key=True)
    artist_id = Column(Uuid, ForeignKey('artists.id'), nullable=False)
    link_source_id = Column(Integer, ForeignKey('link_sources.id'), nullable=False)
    path = Column(Text, nullable=False)

class LinkSource(Base):
    __tablename__ = 'link_sources'
    id = Column(Integer, autoincrement=True, primary_key=True)
    key = Column(String(32), nullable=False)
    logo = Column(Text, nullable=True)
    url = Column(Text, nullable=False)