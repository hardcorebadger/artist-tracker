import hashlib
import json
import time
import copy
import traceback
from datetime import datetime

from firebase_admin import firestore
from sqlalchemy import select, and_, not_, or_
from sqlalchemy.orm import joinedload, contains_eager, aliased

from lib import Artist, get_user, LinkSource, ArtistLink, ArtistTag, OrganizationArtist, Evaluation, StatisticType, Statistic, \
    UserArtist, Attribution, pop_default

count_by_query = None

class ArtistController():

    def __init__(self, project_id, location, sql):
        self.project_id = project_id
        self.location = location
        self.sql = sql

    def get_artists_test(self, data, app):
        return (self.get_artists('9sRMdvFDUKVKckwpzeARiG6x2LG2', data, app, self.sql.get_session()))
    def get_artists(self, uid, data, app, sql_session):
        id_lookup = data.get('id', None)

        try:
            # request schema from MUI
            # req.data = {'groupKeys': [], 'paginationModel': {'page': 0, 'pageSize': 10}, 'sortModel': [], 'filterModel': {'items': [], 'logicOperator': 'and', 'quickFilterValues': [], 'quickFilterLogicOperator': 'and'}, 'start': 0, 'end': 9}
            db = firestore.client(app)
            # How to get the user and the org IDs

            page = int(data.get('page', 0))
            page_size = int(data.get('pageSize', 20))

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
            if count is None and id_lookup is None:
                count = self.build_query(uid, user_data, copy.deepcopy(dict(data)), db, sql_session, id_lookup, True).count()
                count_by_query[hex_digest] = dict({"count": count, "time": time.time()})

            query = self.build_query(uid, user_data, copy.deepcopy(dict(data)), db, sql_session, id_lookup).limit(page_size).offset(page * page_size)

            artists_set = sql_session.scalars(query).unique()
            artists = None
            if id_lookup is not None:
                artists = list(map(lambda artist: artist.as_deep_dict(user_data.get('organization')), artists_set))
            else:
                artists = list(map(lambda artist: artist.as_dict(), artists_set))

            db.close()
            if id_lookup is not None:
                return {
                    "artist": pop_default(artists, None),
                    "error": None
                }

            return {
                "rows": artists,
                "rowCount": count,
                "page": page,
                "pageSize": page_size,
                "filterModel": data.get('filterModel'),
                "sortModel": data.get('sortModel'),
                "error": None
            }
        except Exception as e:
            if id_lookup is not None:
                return {
                    "artist": None,
                    "error": traceback.format_exc()
                }
            return {
                "rows": [],
                "rowCount": 0,
                "page": data.get('page', 0),
                "pageSize": data.get('pageSize', 20),
                "filterModel": data.get('filterModel'),
                "sortModel": data.get('sortModel'),
                "error": traceback.format_exc()
            }

    def build_query(self, uid, user_data, data, db, sql_session, id_lookup, count = False):
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

        if id_lookup is not None:
            query = (select(Artist).options(
                joinedload(Artist.statistics).joinedload(Statistic.type, innerjoin=True).defer(
                    StatisticType.created_at).defer(StatisticType.updated_at),
                joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True).defer(
                    LinkSource.logo),
                joinedload(Artist.organizations, innerjoin=True),
                contains_eager(Artist.evaluation),
                contains_eager(Artist.users),
                contains_eager(Artist.tags),
                joinedload(Artist.attributions).joinedload(Attribution.playlist)
            ))
            query = query.filter(Artist.id == id_lookup)

        query = query.filter(Artist.active == True)
        query = query.outerjoin(Evaluation, Artist.evaluation).outerjoin(UserArtist, Artist.users).outerjoin(ArtistTag, Artist.tags)
        query = query.where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization')))
        query = query.filter(UserArtist.organization_id == user_data.get('organization'))
        query = query.filter(or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None))

        query, eval_dynamic, org_dynamic  = self.build_filters(user_data, data, query)

        # .where(Artist.organizations.any(OrganizationArtist.organization_id == user_data.get('organization'))))
        if id_lookup is None:
            query = self.build_sorts(data, query, count, user_data)

        return query

    def build_filters(self, user_data, data, query):
        filter_model = data.get('filterModel', False)
#         print(filter_model)
        eval_dynamic = None
        org_dynamic = None
        if not filter_model or len(filter_model) == 0:
            return query, eval_dynamic, org_dynamic

        filter_model = filter_model.get('items', list())
        for filter_field in filter_model:
            field = filter_field.get('field')
            operator = filter_field.get('operator')
            value = filter_field.get('value', None)
            if value is None and operator != 'isEmpty' and operator != 'isNotEmpty' and not field.startswith('tags.'):
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
            elif field == 'tags':
                tag_type = 1
                if field == 'tag_genre':
                    tag_type = 2

                if operator == 'is':
                    if value is None:
                        query = query.filter(~(Artist.tags.any(and_(ArtistTag.tag_type_id == tag_type, or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None)))))
                    else:
                        query = query.filter(Artist.tags.any(and_(ArtistTag.tag == value, ArtistTag.tag_type_id == tag_type, or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None))))
                elif operator == 'not':
                    if value is None:
                        query = query.filter(Artist.tags.any(and_(ArtistTag.tag_type_id == tag_type, or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None))))
                    else:
                        query = query.filter(~(Artist.tags.any(and_(ArtistTag.tag == value, ArtistTag.tag_type_id == tag_type, or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None)))))
                elif operator == 'isAnyOf' and value is not None and len(value) > 0:
                    query = query.filter(Artist.tags.any(and_(ArtistTag.tag.in_(value), ArtistTag.tag_type_id == tag_type, or_(ArtistTag.organization_id == user_data.get('organization'), ArtistTag.organization_id == None))))

            elif field.startswith('evaluation.'):
                eval_key = field.split('.')
                eval_key = eval_key[1]
                newValue = value

                eval_dynamic = aliased(Evaluation)
                column = getattr(eval_dynamic, eval_key)
                query = query.outerjoin(eval_dynamic, Artist.evaluation_id == eval_dynamic.id)
                query = self.build_condition(query, column, operator, newValue)
            elif field.startswith('organization.'):
                org_key = field.split('.')
                org_key = org_key[1]
                newValue = value
                if org_key == 'attribution_type':
                    org_key = 'last_playlist_id'
                    if newValue == 'true':
                        newValue = None
                        operator = 'isNotEmpty'
                    elif newValue == 'false':
                        newValue = None
                        operator = 'isEmpty'
                    else:
                        continue
                org_dynamic = aliased(OrganizationArtist)
                column = getattr(org_dynamic, org_key)
                query = query.outerjoin(org_dynamic, and_(Artist.id == org_dynamic.artist_id, org_dynamic.organization_id == user_data.get('organization'))).order_by(column)
                query = self.build_condition(query, column, operator, newValue)

            elif field == 'users':

                if operator == 'is':
                    query = query.filter(Artist.users.any(and_(UserArtist.user_id == value, UserArtist.organization_id == user_data.get('organization'))))
                elif operator == 'not':
                    query = query.filter(~Artist.users.any(and_(UserArtist.user_id == value, UserArtist.organization_id == user_data.get('organization'))))
                elif operator == 'isAnyOf' and len(value) > 0:
                    query = query.filter(Artist.users.any(and_(UserArtist.user_id.in_(value), UserArtist.organization_id == user_data.get('organization'))))

            else:
                column = Artist.__table__.columns[field]
                query = self.build_condition(query, column, operator, value)
        return query, eval_dynamic, org_dynamic

    def build_condition(self, query, column, operator, value):
        if value is None:
            if operator == '==' or operator == 'isEmpty':
                return query.filter(column == None)
            elif operator == '!=' or operator == 'isNotEmpty':
                return query.filter(column != None)
            else:
                return query
        if operator in ['after', 'before', 'onOrAfter', 'onOrBefore']:
            value = parse_datetime(value)
        if operator == 'isAnyOf':
            return query.filter(column.in_(value))
        elif operator == 'isNotOf':
            return query.filter(not_(column.in_(value)))
        elif operator == '>' or operator == 'after':
            return query.filter(column > value)
        elif operator == '<' or operator == 'before':
            return query.filter(column < value)
        elif operator == '>=' or operator == 'onOrAfter':
            return query.filter(column >= value)
        elif operator == '<=' or operator == 'onOrBefore':
            return query.filter(column <= value)
        elif operator == 'startsWith':
            search = '{}%'.format(escape_sql_search_text(value))
            return query.filter(column.like(search))
        elif operator == 'endsWith':
            search = '%{}'.format(escape_sql_search_text(value))
            return query.filter(column.like(search))
        elif operator == 'contains':
            return query.filter(column.contains(escape_sql_search_text(value)))
        elif operator == 'doesNotContain':
            return query.filter(not_(column.contains(value)))
        elif operator == '==' or operator == 'equals' or operator == 'is':
            return query.filter(column == value)
        elif operator == '!=' or operator == '<>' or operator == 'doesNotEqual' or operator == 'not':
            return query.filter(column != value)
        return query

    def build_sorts(self, data, query, count, user_data, eval_dynamic = None, org_dynamic = None):
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

                    if eval_dynamic is None:
                        eval_dynamic = aliased(Evaluation)
                        query = query.outerjoin(eval_dynamic, Artist.evaluation_id == eval_dynamic.id)

                    column = getattr(eval_dynamic, evalKey).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(eval_dynamic, evalKey).desc()
                    query = query.order_by(column)
                elif sortFieldKey.startswith('organization'):
                    orgKey = sortFieldKey.split('.')
                    orgKey = orgKey[1]
                    if org_dynamic is None:
                        org_dynamic = aliased(OrganizationArtist)
                        query = query.outerjoin(org_dynamic, and_(Artist.id == org_dynamic.artist_id, org_dynamic.organization_id == user_data.get('organization')))
                    column = getattr(org_dynamic, orgKey).asc()

                    if sort['sort'] == 'desc':
                        column = getattr(org_dynamic, orgKey).desc()
                    query = query.order_by(column)

                # elif sortFieldKey.startswith('user'):
                #     userKey = sortFieldKey.split('.')
                #     userKey = userKey[1]
                #     tableAliased = aliased(OrganizationArtist)
                #     column = getattr(tableAliased, userKey).asc()
                #
                #     if sort['sort'] == 'desc':
                #         column = getattr(tableAliased, userKey).desc()
                #     query = query.outerjoin(tableAliased, Artist.id == tableAliased.artist_id).where(tableAliased.organization_id == user_data['organization']).order_by(column)
                else:
                    column = Artist.__table__.columns[sortFieldKey].asc()

                    if sort['sort'] == 'desc':
                        column = Artist.__table__.columns[sortFieldKey].desc()
                    query = query.order_by(column)
        return query

def artist_joined_query():
    query = select(Artist).options(
        contains_eager(Artist.statistics),
        joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True),
        joinedload(Artist.evaluation, innerjoin=False))
    # query = query.filter(Artist.active == True)
    return query


def artist_with_meta(sql_session, spotify_id = None, id = None, with_attribution = None):
    query = select(Artist).options(
        joinedload(Artist.statistics, innerjoin=False).joinedload(Statistic.type, innerjoin=True),
        joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=True), joinedload(Artist.tags, innerjoin=False))

    if with_attribution is not None:
        query = query.outerjoin(Attribution, Artist.attributions).filter(with_attribution)

    if spotify_id is not None:
        query = query.where(Artist.spotify_id == spotify_id)
    if id is not None:
        query = query.where(Artist.id == id)
    return sql_session.scalars(query).first()


def parse_datetime(date_string):
    """Parses a datetime string with or without time."""
    try:
        # Try parsing with time
        return datetime.strptime(date_string, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            # Try parsing without time
            return datetime.strptime(date_string, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Invalid datetime format: {}".format(date_string))
def escape_sql_search_text(text: str) -> str:
    return text.replace("%", "\\%").replace("\\", "\\\\").replace("_", "\\_")