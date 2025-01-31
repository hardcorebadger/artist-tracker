from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from lib import Playlist, pop_default, Import, ImportArtist, Artist, ArtistLink


class PlaylistController:
    def __init__(self, sql_session: Session):
        self.sql_session = sql_session

    def get_playlists(self, organization: str, page: int, page_size: int):
        offset = int(page) * int(page_size)
        query = self.sql_session.query(Playlist).where(Playlist.organization_id == organization)
        total = query.count()

        playlists = (query.order_by(Playlist.id.desc()).limit(int(page_size)).offset(offset)).all()

        ids = list(map(lambda x: x.id, playlists))
        list_str = ', '.join("'" + str(item) + "'" for item in ids)
        sql_query = text('SELECT playlists.id, COUNT(*) FROM playlists JOIN attribution ON attribution.playlist_id = playlists.id WHERE playlists.id IN (' + list_str + ') AND attribution.organization_id = \'' + organization + '\'  GROUP BY playlists.id')
        resp = self.sql_session.execute(sql_query).all()

        playlists = list(map(lambda x: x.as_dict(), playlists))
        for playlist in playlists:
            playlist['artists'] = pop_default(list(filter(lambda x: x[0] == playlist['id'], resp)), ['', 0])[1]

        return playlists, total

    def get_import(self, organization: str, import_id: int, page: int, page_size: int):
        query = self.sql_session.query(Import).options(joinedload(Import.playlist), joinedload(Import.lookalike)).where(Import.organization_id == organization).where(Import.id == import_id)
        import_obj = query.first()
        if import_obj is None:
            return None
        import_obj = import_obj.as_dict()
        import_obj['artists'] = list()
        offset = int(page) * int(page_size)

        artists_query = self.sql_session.query(ImportArtist).options(joinedload(ImportArtist.artist, innerjoin=False).joinedload(Artist.links, innerjoin=False).joinedload(ArtistLink.source, innerjoin=False)).where(ImportArtist.import_id == import_id)
        total = artists_query.count()
        artists_query = artists_query.order_by(ImportArtist.id.desc()).limit(int(page_size))
        if offset > 0:
            artists_query = artists_query.offset(offset)
        artists = artists_query.all()
        for artist in artists:
            import_obj['artists'].append(artist.as_dict())

        return import_obj, total

    def get_imports(self, organization: str, page: int, page_size: int):
        offset = int(page) * int(page_size)
        query = (self.sql_session.query(Import)
                 .options(joinedload(Import.playlist, innerjoin=False),
                          joinedload(Import.lookalike, innerjoin=False))
                 .where(Import.organization_id == organization))
        total = query.count()

        imports_query = query.order_by(Import.id.desc()).limit(int(page_size))
        if offset > 0:
            imports_query = imports_query.offset(offset)
        imports = imports_query.all()

        ids = list(map(lambda x: x.id, imports))
        if len(ids) == 0:
            return [], total
        list_str = ', '.join("'" + str(item) + "'" for item in ids)
        sql_query = text('SELECT import_id, import_artists.status, COUNT(*), COUNT(artists.evaluation_id),  count(CASE WHEN artists.onboarded THEN 1 END) FROM import_artists LEFT JOIN artists ON artists.id = import_artists.artist_id WHERE import_artists.import_id IN (' + list_str + ') GROUP BY import_id, import_artists.status')
        resp = self.sql_session.execute(sql_query).all()

        imports = list(map(lambda x: x.as_dict(), imports))
        for import_obj in imports:
            tracked = list(filter(lambda x: x[0] == import_obj['id'], resp))
            import_obj['artists'] = dict()
            import_obj['artists']['pending'] = int(pop_default(list(filter(lambda x: x[1] == 0, tracked)), ['', 0, 0])[2])
            import_obj['artists']['failed'] = int(pop_default(list(filter(lambda x: x[1] == 1, tracked)), ['', 1, 0])[2])
            import_obj['artists']['complete'] = int(pop_default(list(filter(lambda x: x[1] == 2, tracked)), ['', 2, 0])[2])
            import_obj['artists']['evaluated'] = int(pop_default(list(filter(lambda x: x[1] == 2, tracked)), ['', 2, 0, 0])[3])
            import_obj['artists']['onboarded'] = int(pop_default(list(filter(lambda x: x[1] == 2, tracked)), ['', 2, 0, 0, 0])[4])

            import_obj['artists']['total'] = sum([import_obj['artists']['pending'], import_obj['artists']['failed'], import_obj['artists']['complete']])

        return imports, total