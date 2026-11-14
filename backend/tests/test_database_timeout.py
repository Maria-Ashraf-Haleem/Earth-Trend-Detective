"""SQL execution has a driver-enforced limit independent of connection login."""
import time

from pydantic import ValidationError
import pytest
from sqlalchemy.exc import OperationalError

from app.core.config import Settings, get_settings


@pytest.mark.parametrize('value', [0, -1, 601])
def test_query_deadline_cannot_disable_or_exceed_bounded_limit(value):
    with pytest.raises(ValidationError):
        Settings(sql_query_timeout=value, _env_file=None)


def test_query_and_login_deadlines_are_independent():
    settings = Settings(sql_timeout=3, sql_query_timeout=45, _env_file=None)
    assert settings.sql_timeout == 3
    assert settings.sql_query_timeout == 45


@pytest.mark.integration
def test_odbc_driver_enforces_query_deadline_and_pool_recovers(sql_connection):
    raw = sql_connection.connection.driver_connection
    original = raw.timeout
    assert original == get_settings().sql_query_timeout
    started = time.perf_counter()
    try:
        raw.timeout = 1
        with pytest.raises(OperationalError) as failure:
            # Delays a read-only test session; it creates or changes no records.
            sql_connection.exec_driver_sql("WAITFOR DELAY '00:00:03'")
        assert failure.value.orig.args[0] in ('HYT00', 'HYT01')
        assert time.perf_counter() - started < 3
    finally:
        # SQLAlchemy may discard an ODBC connection after HYT00. Do not touch a
        # closed DBAPI handle; clear this read-only transaction and let the pool
        # replace it using the same configured deadline.
        if not sql_connection.invalidated:
            raw.timeout = original
    sql_connection.rollback()
    assert sql_connection.exec_driver_sql('SELECT 1').scalar_one() == 1
    assert sql_connection.connection.driver_connection.timeout == original
