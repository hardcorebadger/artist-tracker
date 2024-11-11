from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn
from sqlalchemy import select, func
from sqlalchemy.orm import subqueryload, joinedload

from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, ArtistLink, OrganizationArtist, Evaluation, StatisticType, Statistic, UserArtist

class ArtistController():

    def __init__(self, project_id, location, sql):
        self.project_id = project_id
        self.location = location
        self.sql = sql

    def get_artists(self, req: https_fn.CallableRequest, app):

        # request schema from MUI
        # req.data = {'groupKeys': [], 'paginationModel': {'page': 0, 'pageSize': 10}, 'sortModel': [], 'filterModel': {'items': [], 'logicOperator': 'and', 'quickFilterValues': [], 'quickFilterLogicOperator': 'and'}, 'start': 0, 'end': 9}
        print(req.data)
        db = firestore.client(app)
        # How to get the user and the org IDs
        page = int(req.data.get('page')) or 0
        pageSize = int(req.data.get('pageSize')) or 10

        sql_session = self.sql.get_session()
        query = self.build_query(req, db, sql_session).limit(pageSize).offset(page * pageSize)
        count = self.build_query(req, db, sql_session, True).count()
        artists = sql_session.scalars(query).unique()

        return {
            "rows": list(map(lambda artist: artist.as_dict(), artists)),
            "rowCount": count
        }

    def build_query(self, req, db, sql_session, count = False):
        uid = req.auth.uid
        user_data = get_user(uid, db)
        query = (select(Artist).options(
            subqueryload(Artist.statistics).joinedload(Statistic.type),
            joinedload(Artist.users, innerjoin=True),
            joinedload(Artist.organizations, innerjoin=True),
            joinedload(Artist.evaluation, innerjoin=False),
        ))
        if count:
            query = sql_session.query(Artist)

        # .where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
        if req.data['sortModel'] and len(req.data['sortModel']) > 0:
            sorts = req.data['sortModel']
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