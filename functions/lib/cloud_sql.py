import array

from google.cloud.sql.connector import Connector, IPTypes
import sqlalchemy
import pg8000
from sqlalchemy.orm import sessionmaker
# from .models import *
from sqlalchemy import select, or_, and_
from sqlalchemy.sql import func

from .models import *


class CloudSQLClient():
    def __init__(self, project, region, instance, user, password, databse):
        self.project = project
        self.region = region
        self.instance = instance
        self.user = user
        self.password = password
        self.databse = databse
        self.connector = None
        self.db = None
        self.session_maker = None

    def __init_pool(self, connector):
        def getconn():
            connection = connector.connect(
                f"{self.project}:{self.region}:{self.instance}",
                "pg8000",
                user=self.user,
                password=self.password,
                db=self.databse,
                ip_type=IPTypes.PUBLIC,  #IPTypes.PRIVATE for Private IP
            )
            return connection

        # create connection pool

        engine = sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn, pool_size=5, max_overflow=25)
        return engine
    
    def get_session(self):
        if not self.db:
            self.connector = Connector()
            self.db = self.__init_pool(self.connector)
            self.session_maker = sessionmaker(bind=self.db)
        return self.session_maker()
    
    def connect(self):
        if not self.db:

            self.connector = Connector()
            self.db = self.__init_pool(self.connector)
            self.session_maker = sessionmaker(bind=self.db)
        return self.db.connect()

    def bootstrap_models(self):
        session = self.get_session()
        # Base.metadata.drop_all(self.db)
        # Base.metadata.create_all(self.db)
        session.close()

    def load_all_for_model(self, modelClass):
        session = self.get_session()
        stmt = select(modelClass)
        result = session.scalars(stmt).all()
        session.close()
        return result


    
