import datetime
import uuid
from typing import List

from sqlalchemy import Column, Integer, SmallInteger, JSON, Float, Boolean, Text, String, TIMESTAMP, create_engine, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Mapped, relationship, mapped_column
from sqlalchemy.dialects.postgresql import UUID

Base = declarative_base()

class Artist(Base):
    __tablename__ = 'artists'

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(256))
    spotify_id = Column(String(22), unique=True)
    onboard_wait_until: TIMESTAMP|None = Column(TIMESTAMP, nullable=True, index=True)
    avatar = Column(Text)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))

    links: Mapped[List["ArtistLink"]] = relationship(
        back_populates = "artist", cascade = "all, delete-orphan"
    )

    users: Mapped[List["UserArtist"]] = relationship(
        back_populates = "artist", cascade = "all, delete-orphan"
    )

    organizations: Mapped[List["OrganizationArtist"]] = relationship(
        back_populates = "artist", cascade = "all, delete-orphan"
    )

    statistics: Mapped[List["Statistic"]] = relationship(
        back_populates = "artist", cascade = "all, delete-orphan"
    )

    evaluations: Mapped[List["Evaluation"]] = relationship(back_populates = "artist", cascade = "all, delete-orphan")

    def __repr__(self):
        return f"<Artist({self.id=}, {self.name=}, {self.spotify_id=}, {self.onboard_wait_until=}, {self.avatar}, {self.evaluation_id})>"

class Evaluation(Base):
    __tablename__ = 'evaluations'

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False)
    status = Column(Integer, nullable=False, default=0)
    distributor = Column(String(256), nullable=True)
    distributor_type = Column(SmallInteger, nullable=True)
    label = Column(String(256), nullable=True)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist: Mapped["Artist"] = relationship(back_populates="evaluations")

class OrganizationArtist(Base):
    __tablename__ = 'organization_artists'

    organization_id = Column(String(28), nullable=False, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False, primary_key=True)
    favorite = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist: Mapped["Artist"] = relationship(back_populates="organizations")

class UserArtist(Base):
    __tablename__ = 'user_artists'
    user_id = Column(String(28),  nullable=False, primary_key=True)
    organization_id = Column(String(28), nullable=False, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False, primary_key=True)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist: Mapped["Artist"] = relationship(back_populates="users")

class Statistic(Base):
    __tablename__ = 'statistics'
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False, primary_key=True)
    statistic_type_id: Mapped[int] = mapped_column(Integer, ForeignKey('statistic_types.id'), nullable=False, primary_key=True)
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
    artist: Mapped["Artist"] = relationship(back_populates="statistics")
    type: Mapped["StatisticType"] = relationship()

class StatisticType(Base):
    __tablename__ = 'statistic_types'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    name = Column(Text, nullable=False)
    key = Column(String(128), nullable=False)
    source = Column(String(256), nullable=False)
    format = Column(String(8), nullable=False,default="float")
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))

    # statistics: Mapped["Statistic"] = relationship(back_populates="type")

    def __repr__(self):
        return f"<StatisticType({self.id=}, {self.name=}, {self.key=}, {self.source=}, {self.format})>"

class ArtistLink(Base):
    __tablename__ = 'artist_links'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False)
    link_source_id: Mapped[int] = mapped_column(Integer, ForeignKey('link_sources.id'), nullable=False)
    path = Column(Text, nullable=False)

    artist: Mapped["Artist"] = relationship(back_populates="links")
    source: Mapped["LinkSource"] = relationship(back_populates="links")


class LinkSource(Base):
    __tablename__ = 'link_sources'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    key: Mapped[str] = mapped_column(String(32), nullable=False)
    logo = Column(Text, nullable=True)
    url_scheme = Column(Text, nullable=False)
    display_name = Column(Text, nullable=True)
    links: Mapped["ArtistLink"] = relationship(back_populates="source")