import time
import copy

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn
from sqlalchemy import select, func, and_, not_
from sqlalchemy.dialects.mssql.information_schema import columns
from sqlalchemy.orm import subqueryload, joinedload, defer, aliased

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
        page_size = int(data.get('pageSize', 20))
        start = time.time()

        sql_session = self.sql.get_session()
        count = self.build_query(uid, copy.deepcopy(data), db, sql_session, True).count()

        query = self.build_query(uid, copy.deepcopy(dict(data)), db, sql_session).limit(page_size).offset(page * page_size)

        artists_set = sql_session.scalars(query).unique()

        end = time.time()
        length = end-start

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

        if not count:
            query = (select(Artist).options(
                joinedload(Artist.statistics).joinedload(Statistic.type, innerjoin=True).defer(StatisticType.created_at).defer(StatisticType.updated_at),
                joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True).defer(LinkSource.logo),
                joinedload(Artist.users, innerjoin=True).where(UserArtist.organization_id == user_data.get('organization')),
                joinedload(Artist.organizations, innerjoin=True).where(OrganizationArtist.organization_id == user_data.get('organization')),
                joinedload(Artist.evaluation, innerjoin=False),
            ))
        query = query.where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization')))
        query = self.build_filters(user_data, data, query)

        # .where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
        query = self.build_sorts(data, query, count, user_data)

        return query

    def build_filters(self, user_data, data, query):
        filter_model = data.get('filterModel', False)
#         print(filter_model)
        if not filter_model or len(filter_model) == 0:
            return query
        filter_model = filter_model.get('items', list())
        for filter_field in filter_model:
            field = filter_field.get('field')
            operator = filter_field.get('operator')
            value = filter_field.get('value', None)
            if value is None and operator != 'isEmpty' and operator != 'isNotEmpty':
                continue
            if (field.startswith('statistic.')):
                key_parts = field.split('.')
                statistic_id = key_parts[1].split('-')
                statistic_func = statistic_id[1]
                statistic_id = int(statistic_id[0])
                dynamic = aliased(Statistic)
                query = query.outerjoin(dynamic, and_(Artist.id == dynamic.artist_id,
                      dynamic.statistic_type_id == statistic_id))
                if value is not None:
                    value = int(value)
                query = self.build_condition(query, getattr(dynamic, statistic_func), operator, value)
            elif field.startswith('evaluation.'):
                eval_key = field.split('.')
                eval_key = eval_key[1]
                newValue = value
                if eval_key == 'status':
                    if value == 'unknown':
                        newValue = list([2, 3, 4])
                        operator = 'isAnyOf'
                elif eval_key == 'back_catalog':
                    eval_key = 'status'
                    if operator == 'isAnyOf':
                        if len(newValue) == 1:
                            if newValue[0] == 'dirty':
                                newValue[0] = 2
                            else:
                                newValue = list([0, 1])
                        else:
                            continue
                    elif newValue != 'dirty':
                        if operator != 'not' and operator != '!=':
                            operator = '<'
                        else:
                            operator = '=='

                    if operator != 'isAnyOf':
                        newValue = 2
                dynamic = aliased(Evaluation)
                column = getattr(dynamic, eval_key)
                query = query.outerjoin(dynamic, Artist.evaluation_id == dynamic.id)
                query = self.build_condition(query, column, operator, newValue)
            else:
                column = Artist.__table__.columns[field]
                query = self.build_condition(query, column, operator, value)
        return query

    def build_condition(self, query, column, operator, value):
        if value is None:
            if operator == '==' or operator == 'isEmpty':
                return query.filter(column == None)
            elif operator == '!=' or operator == 'isNotEmpty':
                return query.filter(column != None)
            else:
                return query
        if operator == 'isAnyOf':
            return query.filter(column.in_(value))
        if operator == '>':
            return query.filter(column > value)
        elif operator == '<':
            return query.filter(column < value)
        elif operator == '>=':
            return query.filter(column >= value)
        elif operator == '<=':
            return query.filter(column <= value)
        elif operator == 'startsWith':
            search = '{}%'.format(value)
            return query.filter(column.like(search))
        elif operator == 'endsWith':
            search = '%{}'.format(value)
            return query.filter(column.like(search))
        elif operator == 'contains':
            return query.filter(column.contains(value))
        elif operator == 'doesNotContain':
            return query.filter(not_(column.contains(value)))
        elif operator == '==' or operator == 'equals' or operator == 'is':
            return query.filter(column == value)
        elif operator == '!=' or operator == '<>' or operator == 'doesNotEqual' or operator == 'not':
            return query.filter(column != value)
        return query

    def build_sorts(self, data, query, count, user_data):
        if count:
            return query
        if data.get('sortModel', False) and len(data['sortModel']) > 0:
            sorts = data['sortModel']
            for sort in sorts:
                sortFieldKey: str = sort['field']
                if (sortFieldKey.startswith('statistic.')):
                    statisticKeyParts = sortFieldKey.split('.')
                    statisticId = statisticKeyParts[1].split('-')
                    statisticFunc = statisticId[1]
                    statisticId = int(statisticId[0])
                    dynamic_sort = aliased(Statistic)
                    column = getattr(dynamic_sort, statisticFunc).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(dynamic_sort, statisticFunc).desc()
                    query = query.outerjoin(dynamic_sort, Artist.id == dynamic_sort.artist_id).where(dynamic_sort.statistic_type_id == statisticId).order_by(column)
                    # query = query.filter(Artist.statistics.any(Statistic.statistic_type_id == statisticId & Statistic[statisticFunc] ))
                elif sortFieldKey.startswith('evaluation'):
                    evalKey = sortFieldKey.split('.')
                    evalKey = evalKey[1]
                    if evalKey == 'back_catalog':
                        evalKey = 'status'
                    tableAliased = aliased(Evaluation)
                    column = getattr(tableAliased, evalKey).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(tableAliased, evalKey).desc()
                    query = query.outerjoin(tableAliased, Artist.evaluation_id == tableAliased.id).order_by(column)

                elif sortFieldKey.startswith('user'):
                    userKey = sortFieldKey.split('.')
                    userKey = userKey[1]
                    tableAliased = aliased(OrganizationArtist)
                    column = getattr(tableAliased, userKey).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(tableAliased, userKey).desc()
                    query = query.outerjoin(tableAliased, Artist.id == tableAliased.artist_id).where(tableAliased.organization_id == user_data['organization']).order_by(column)
                else:
                    column = Artist.__table__.columns[sortFieldKey].asc()

                    if sort['sort'] == 'desc':
                        column = Artist.__table__.columns[sortFieldKey].desc()
                    query = query.order_by(column)
        return query