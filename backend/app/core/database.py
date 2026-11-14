from functools import lru_cache
import json

from sqlalchemy import URL, create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings


def database_url(database: str | None = None) -> URL:
    settings = get_settings()
    def escape(value: str) -> str:
        return '{' + value.replace('}', '}}') + '}'
    connection = (
        f'DRIVER={escape(settings.sql_driver)};SERVER={escape(settings.sql_server)};'
        f'DATABASE={escape(database or settings.sql_database)};Trusted_Connection=yes;'
        f'Encrypt={"yes" if settings.sql_encrypt else "no"};'
        f'TrustServerCertificate={"yes" if settings.sql_trust_server_certificate else "no"};'
        f'Connection Timeout={settings.sql_timeout};'
    )
    return URL.create('mssql+pyodbc', query={'odbc_connect': connection})


@lru_cache
def get_engine():
    settings = get_settings()
    engine = create_engine(database_url(), pool_pre_ping=True, pool_size=settings.pool_size,
                           max_overflow=5, pool_recycle=1800, fast_executemany=True,
                           use_insertmanyvalues=False, hide_parameters=True,
                           json_serializer=lambda value: json.dumps(value, separators=(',', ':')))

    @event.listens_for(engine, 'connect')
    def set_query_timeout(dbapi_connection, _connection_record):
        # pyodbc applies this deadline to cursors created by the connection.
        # The connection-string timeout above bounds login, not SQL execution.
        dbapi_connection.timeout = settings.sql_query_timeout

    return engine


@lru_cache
def get_session_factory():
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db():
    with get_session_factory()() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
