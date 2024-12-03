import hashlib
import json
import time
import copy
from itertools import count

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn
from sqlalchemy import select, func, and_, not_
from sqlalchemy.dialects.mssql.information_schema import columns
from sqlalchemy.orm import subqueryload, joinedload, contains_eager, defer, aliased

from lib import Artist, SpotifyClient, AirtableClient, YoutubeClient, SongstatsClient, ErrorResponse, get_user, \
    CloudSQLClient, LinkSource, ArtistLink, ArtistTag, OrganizationArtist, Evaluation, StatisticType, Statistic, UserArtist

count_by_query = None

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

        filters = data.get('filterModel', [])
        user_data = get_user(uid, db)

        hashed_data = dict({'filters': filters, 'org': user_data.get('organization', None) })
        json_string = json.dumps(hashed_data, sort_keys=True)

        # Create a hash object (using SHA-256 algorithm)
        hash_object = hashlib.sha256(json_string.encode())

        # Get the hexadecimal representation of the hash
        hex_digest = hash_object.hexdigest()

        global count_by_query
        count = None
        if count_by_query is None:
            count_by_query = dict()

        if hex_digest in count_by_query:
            count_object = count_by_query[hex_digest]
            if (time.time() - count_object['time']) < 360:
                count = count_object['count']
        if count is None:
            count = self.build_query(uid, user_data, copy.deepcopy(data), db, sql_session, True).count()
            count_by_query[hex_digest] = dict({"count": count, "time": time.time()})

        query = self.build_query(uid, user_data, copy.deepcopy(dict(data)), db, sql_session).limit(page_size).offset(page * page_size)

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

    def build_query(self, uid, user_data, data, db, sql_session, count = False):
        query = sql_session.query(Artist)

        if not count:
            query = (select(Artist).options(
                joinedload(Artist.statistics).joinedload(Statistic.type, innerjoin=True).defer(StatisticType.created_at).defer(StatisticType.updated_at),
                joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True).defer(LinkSource.logo),
                joinedload(Artist.organizations, innerjoin=True),
                contains_eager(Artist.evaluation),
                contains_eager(Artist.users),
                contains_eager(Artist.tags)
            ))

        query = query.filter(Artist.active == True)
        query = query.outerjoin(Evaluation, Artist.evaluation).outerjoin(UserArtist, Artist.users).outerjoin(ArtistTag, Artist.tags)
        query = query.where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization')))
        query = query.filter(UserArtist.organization_id == user_data.get('organization'))
        query = query.filter(ArtistTag.organization_id == user_data.get('organization') or ArtistTag.organization_id == None)
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
            if value is None and operator != 'isEmpty' and operator != 'isNotEmpty' and not field.startswith('tag_'):
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
            elif field.startswith('tag_genre') or field.startswith('tag_user'):
                tag_type = 2
                if field == 'tag_genre':
                    tag_type = 1
                if operator == 'is':
                    if value is None:
                        query = query.filter(~(Artist.tags.any(ArtistTag.tag_type_id == tag_type)))
                    else:
                        query = query.filter(Artist.tags.any(and_(ArtistTag.tag == value, ArtistTag.tag_type_id == tag_type)))
                elif operator == 'not':
                    if value is None:
                        query = query.filter(Artist.tags.any(ArtistTag.tag_type_id == tag_type))
                    else:
                        query = query.filter(~(Artist.tags.any(and_(ArtistTag.tag == value, ArtistTag.tag_type_id == tag_type))))
                elif operator == 'isAnyOf' and value is not None and len(value) > 0:
                    query = query.filter(Artist.tags.any(and_(ArtistTag.tag.in_(value), ArtistTag.tag_type_id == tag_type)))

            elif field.startswith('evaluation.'):
                eval_key = field.split('.')
                eval_key = eval_key[1]
                newValue = value

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
        elif operator == 'isNotOf':
            return query.filter(not_(column.in_(value)))
        elif operator == '>':
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
                    tableAliased = aliased(Evaluation)
                    column = getattr(tableAliased, evalKey).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(tableAliased, evalKey).desc()
                    query = query.outerjoin(tableAliased, Artist.evaluation_id == tableAliased.id).order_by(column)
                elif sortFieldKey.startswith('organization'):
                    orgKey = sortFieldKey.split('.')
                    orgKey = orgKey[1]
                    tableAliased = aliased(OrganizationArtist)
                    column = getattr(tableAliased, orgKey).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(tableAliased, orgKey).desc()
                    query = query.outerjoin(tableAliased, and_(Artist.id == tableAliased.artist_id, tableAliased.organization_id == user_data.get('organization'))).order_by(column)

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