import time

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn
from sqlalchemy import select, func
from sqlalchemy.dialects.mssql.information_schema import columns
from sqlalchemy.orm import subqueryload, joinedload, defer

from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, ArtistLink, OrganizationArtist, Evaluation, StatisticType, Statistic, UserArtist

class ArtistController():

    def __init__(self, project_id, location, sql):
        self.project_id = project_id
        self.location = location
        self.sql = sql

    def get_artists_test(self, data, app):
        return (self.get_artists('9sRMdvFDUKVKckwpzeARiG6x2LG2', data, app))
    def get_artists(self, uid, data, app):

        # request schema from MUI
        # req.data = {'groupKeys': [], 'paginationModel': {'page': 0, 'pageSize': 10}, 'sortModel': [], 'filterModel': {'items': [], 'logicOperator': 'and', 'quickFilterValues': [], 'quickFilterLogicOperator': 'and'}, 'start': 0, 'end': 9}
        db = firestore.client(app)
        # How to get the user and the org IDs
        page = int(data.get('page', 0))
        page_size = int(data.get('pageSize', 10))

        sql_session = self.sql.get_session()
        count = self.build_query(uid, data, db, sql_session, True).count()
        start = time.time()
        query = self.build_query(uid, data, db, sql_session).limit(page_size).offset(page * page_size)
        artists_set = sql_session.scalars(query).unique()

        end = time.time()
        length = end-start
        print("It took", length, "seconds!")

        artists = list(map(lambda artist: artist.as_dict(), artists_set))

        sql_session.close()
        db.close()
        return {
            "rows": artists,
            "rowCount": count
        }

    def build_query(self, uid, data, db, sql_session, count = False):
        user_data = get_user(uid, db)
        query = sql_session.query(Artist)

        if count == False:
            query = (select(Artist).options(
                joinedload(Artist.statistics, innerjoin=False).joinedload(Statistic.type, innerjoin=True).defer(StatisticType.created_at).defer(StatisticType.updated_at),
                joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True).defer(LinkSource.logo),
                joinedload(Artist.users, innerjoin=True),
                joinedload(Artist.organizations, innerjoin=True),
                joinedload(Artist.evaluation, innerjoin=False),
            ))


        # .where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
        if data.get('sortModel', False) and len(data['sortModel']) > 0:
            sorts = data['sortModel']
            for sort in sorts:
                sortFieldKey: str = sort['field']
                if (sortFieldKey.startswith('statistic.')):
                    statisticKeyParts = sortFieldKey.split('.')
                    statisticId = statisticKeyParts[1].split('-')
                    statisticFunc = statisticId[1]
                    statisticId = int(statisticId[0])
                    column = Statistic.__table__.columns[statisticFunc].asc()
                    if sort['sort'] == 'desc':
                        column = Statistic.__table__.columns[statisticFunc].desc()
                    query = query.join(Statistic, Artist.statistics).where(Statistic.statistic_type_id == statisticId).order_by(column)
                    # query = query.filter(Artist.statistics.any(Statistic.statistic_type_id == statisticId & Statistic[statisticFunc] ))
                elif sortFieldKey.startswith('evaluation'):
                    evalKey = sortFieldKey.split('.')
                    evalKey = evalKey[1]
                    if evalKey == 'back_catalog':
                        evalKey = 'distributor_type'
                    column = Evaluation.__table__.columns[evalKey].asc()

                    if sort['sort'] == 'desc':
                        column = Evaluation.__table__.columns[evalKey].desc()
                    query = query.join(Evaluation, Artist.evaluation).order_by(column)

                elif sortFieldKey.startswith('user'):
                    userKey = sortFieldKey.split('.')
                    userKey = userKey[1]
                    column = Evaluation.__table__.columns[userKey].asc()

                    if sort['sort'] == 'desc':
                        column = Evaluation.__table__.columns[userKey].desc()
                    query = query.join(OrganizationArtist, Artist.organizations).where(OrganizationArtist.organization_id == user_data['organization']).order_by(column)
                else:
                    column = Artist.__table__.columns[sortFieldKey].asc()

                    if sort['sort'] == 'desc':
                        column = Artist.__table__.columns[sortFieldKey].desc()
                    query = query.order_by(column)

        return query