import datetime
import uuid
from typing import List, Optional

from dataclasses import dataclass
from sqlalchemy import Column, Integer, SmallInteger, JSON, Float, Boolean, Text, String, TIMESTAMP, create_engine, \
    ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, relationship, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from lib.utils import pop_default

Base = declarative_base()

class Artist(Base):
    __tablename__ = 'artists'

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(256))
    spotify_id = Column(String(22), unique=True)
    onboard_wait_until: TIMESTAMP|None = Column(TIMESTAMP, nullable=True, index=True)
    avatar = Column(Text)
    active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    evaluation_id: Mapped[int] = mapped_column(Integer, ForeignKey('evaluations.id'), nullable=False)
    onboarded = Column(Boolean, default=False)

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

    evaluation: Mapped["Evaluation"] = relationship(back_populates='artist', foreign_keys=[evaluation_id])

    tags: Mapped[List["ArtistTag"]] = relationship(back_populates='artist')
    attributions: Mapped[List["Attribution"]] = relationship(back_populates='artist')

    def as_dict(self):
        dict = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        dict['evaluation'] = None
        if (self.evaluation != None):
            dict['evaluation'] = self.evaluation.as_dict()
        # dict['links'] = list(map(lambda link: link.as_dict(), self.links))
        for link in self.links:
            dict['link_' + link.source.key] = link.url

        sorted_users = sorted(list(map(lambda user: user.as_dict(), self.users)), key=lambda x: x["created_at"])
        dict['users'] = sorted_users
        dict['organization'] = pop_default(list(map(lambda org: org.as_dict(), self.organizations)), None)
        dict['statistics'] = list(map(lambda stat: stat.as_dict(), self.statistics))
        dict['tags'] = list(map(lambda tag: tag.as_dict(), self.tags))

        # for stat in self.statistics:
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-latest'] = stat.latest
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-last'] = stat.previous
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-avg'] = stat.avg
        #     # dict['stat_' + stat.type.source + '__' + stat.type.key + '-min'] = stat.latest
        #     # dict['stat_' + stat.type.source + '__' + stat.type.key + '-max'] = stat.latest
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-mom'] = stat.month_over_month
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-wow'] = stat.week_over_week
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-data'] = stat.data
        #     dict['stat_' + stat.type.source + '__' + stat.type.key + '-date'] = stat.created_at

        return dict

    def as_deep_dict(self):
        dict = self.as_dict()
        attr = list(map(lambda attribution: attribution.as_dict(), self.attributions))
        attr.reverse()
        dict['attributions'] = attr
        return dict

    def __repr__(self):
        return f"<Artist({self.id=}, {self.name=}, {self.spotify_id=}, {self.onboard_wait_until=}, {self.avatar})>"

class Evaluation(Base):
    __tablename__ = 'evaluations'

    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    status = Column(Integer, nullable=False, default=0)
    back_catalog = Column(Integer, nullable=False, default=0)
    distributor = Column(String(256), nullable=True, default=None)
    distributor_type = Column(SmallInteger, nullable=True, default=3)
    label = Column(String(256), nullable=True, default=None)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist_id = Column(UUID, nullable=True)
    artist: Mapped["Artist"] = relationship(back_populates="evaluation", foreign_keys=[Artist.evaluation_id])

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<Evaluation({self.id=}, {self.artist_id=}, {self.status=}, {self.distributor=}, {self.distributor_type}, {self.label})>"

class OrganizationArtist(Base):
    __tablename__ = 'organization_artists'

    organization_id = Column(String(28), nullable=False, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False, primary_key=True)
    favorite = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist: Mapped["Artist"] = relationship(back_populates="organizations")
    added_by = Column(String(28),  nullable=False, primary_key=True)
    def as_dict(self):
        return {
            'organization_id': self.organization_id,
            'favorite': self.favorite,
            'created_at': self.created_at,
            'added_by': self.added_by,
            }

    def __repr__(self):
        return f"<OrganizationArtist({self.organization_id=}, {self.artist_id=}, {self.favorite=}, {self.created_at=})>"

class UserArtist(Base):
    __tablename__ = 'user_artists'
    user_id = Column(String(28),  nullable=False, primary_key=True)
    organization_id = Column(String(28), nullable=False, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False, primary_key=True)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist: Mapped["Artist"] = relationship(back_populates="users")
    def as_dict(self):
        return {
            'user_id': self.user_id,
            'created_at': self.created_at,
            'organization_id': self.organization_id,
        }

    def __repr__(self):
        return f"<UserArtist({self.user_id=}, {self.organization_id=}, {self.artist_id=}, {self.created_at=})>"

class Statistic(Base):
    __tablename__ = 'statistics'
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False, primary_key=True)
    statistic_type_id: Mapped[int] = mapped_column(Integer, ForeignKey('statistic_types.id'), nullable=False, primary_key=True)


    latest = Column(Float, nullable=False)
    previous = Column(Float, nullable=False)
    week_over_week = Column(Float, nullable=False)
    month_over_month = Column(Float, nullable=True)
    min = Column(Float, nullable=False)
    max = Column(Float, nullable=False)
    avg = Column(Float, nullable=False)
    data = Column(JSON, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    artist: Mapped["Artist"] = relationship(back_populates="statistics")
    type: Mapped["StatisticType"] = relationship()
    last_date = Column(DateTime)
    @hybrid_property
    def dates(self):
        dates = list(map(lambda date: date.isoformat(), [self.last_date - datetime.timedelta(weeks=idx) for idx in range(8)]))
        dates.reverse()
        return dates

    def as_dict(self):

        return {
            'latest': self.latest,
            'previous': self.previous,
            'week_over_week': self.week_over_week,
            'month_over_month': self.month_over_month,
            'min': self.min,
            'max': self.max,
            'avg': self.avg,
            'data': self.data,
            'statistic_type_id': self.statistic_type_id,
            'updated_at': self.updated_at,
            'last_date': self.last_date,
            'dates': self.dates

        }
        # return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<Statistic({self.artist_id=}-{self.statistic_type_id}, {self.latest}, {self.previous=}, {self.week_over_week=}, {self.month_over_month}, {self.min}, {self.max}, {self.avg}, {self.data})>"

class StatisticType(Base):
    __tablename__ = 'statistic_types'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    name = Column(Text, nullable=False)
    key = Column(String(128), nullable=False)
    source = Column(String(256), nullable=False)
    format = Column(String(8), nullable=False,default="float")
    order = Column(Integer, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    updated_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))
    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    # statistics: Mapped["Statistic"] = relationship(back_populates="type")

    def __repr__(self):
        return f"<StatisticType({self.id=}, {self.name=}, {self.key=}, {self.source=}, {self.format})>"

class ArtistTagType(Base):
    __tablename__ = 'artist_tag_types'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    tags: Mapped[List["ArtistTag"]] = relationship(back_populates="type")
    name = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))

    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

class ArtistTag(Base):
    __tablename__ = 'artist_tags'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False)
    organization_id = Column(String(28), nullable=True)
    tag_type_id: Mapped[int] = mapped_column(Integer, ForeignKey('artist_tag_types.id'), nullable=False)
    tag = Column(String(36), nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.datetime.now(datetime.UTC))

    artist: Mapped["Artist"] = relationship(back_populates="tags")
    type: Mapped["ArtistTagType"] = relationship(back_populates="tags")
    def as_dict(self):
        return {
            "tag": self.tag,
            "id": self.id,
            "tag_type_id": self.tag_type_id,
            "organization_id": self.organization_id,
        }
    def as_tag_dict(self):
        return {
            "tag": self.tag,
            "tag_type_id": self.tag_type_id,
        }

class ArtistLink(Base):
    __tablename__ = 'artist_links'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False)
    link_source_id: Mapped[int] = mapped_column(Integer, ForeignKey('link_sources.id'), nullable=False)
    path = Column(Text, nullable=False)
    def as_dict(self):
        dict = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        dict['source'] = self.source.as_dict()
        return dict

    @hybrid_property
    def url(self):
        return self.source.url_scheme.replace('{identifier}', self.path)

    artist: Mapped["Artist"] = relationship(back_populates="links")
    source: Mapped["LinkSource"] = relationship(back_populates="links")

    def __repr__(self):
        return f"<ArtistLink({self.id=}, {self.artist_id=}, {self.link_source_id=}, {self.path=}, {self.url})>"


class LinkSource(Base):
    __tablename__ = 'link_sources'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    key: Mapped[str] = mapped_column(String(32), nullable=False)
    logo = Column(Text, nullable=True)
    url_scheme = Column(Text, nullable=False)
    display_name = Column(Text, nullable=True)
    social = Column(Boolean, nullable=False)
    order = Column(Integer, nullable=False)
    links: Mapped["ArtistLink"] = relationship(back_populates="source")
    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<LinkSource({self.id=}, {self.key=}, {self.logo=}, {self.url_scheme=}, {self.display_name})>"

class Playlist(Base):
    __tablename__ = 'playlists'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    name = Column(String(256), nullable=True)
    spotify_id = Column(String(22), nullable=False)
    created_at = Column(TIMESTAMP, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False)
    def as_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<Playlist({self.id=}, {self.spotify_id=}, {self.name=}, {self.created_at=}, {self.updated_at})>"

class Attribution(Base):
    __tablename__ = 'attribution'
    id: Mapped[int] = mapped_column(Integer, autoincrement=True, primary_key=True)
    artist_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('artists.id'), nullable=False)
    user_id = Column(String(28), nullable=False)
    playlist_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('playlists.id'), nullable=True)
    created_at = Column(TIMESTAMP, nullable=False)

    playlist: Mapped[Optional["Playlist"]] = relationship(foreign_keys=[playlist_id])
    artist: Mapped["Artist"] = relationship(back_populates="attributions", foreign_keys=[artist_id])


    def as_dict(self):
        playlist = None
        if self.playlist:
            playlist = self.playlist.as_dict()
        return {
            "id": self.id,
            "user_id": self.user_id,
            "playlist_id": self.playlist_id,
            "artist_id": self.artist_id,
            "created_at": self.created_at,
            "playlist": playlist,
        }

    def __repr__(self):
        return f"<Attribution({self.id=}, {self.artist_id=}, {self.user_id=}, {self.playlist_id=}, {self.created_at})>"