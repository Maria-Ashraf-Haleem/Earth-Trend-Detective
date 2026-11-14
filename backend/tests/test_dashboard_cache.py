"""Dashboard scan sharing uses immutable, scoped certified results only.

These tests never open a SQL connection or modify database records.
"""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import FrozenInstanceError
from datetime import datetime
from threading import Event
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects import mssql

from app.models import DatasetVersion, MEASUREMENT_COLUMNS
from app.services import dashboard
from app.services.dashboard import AggregateCache, DashboardAggregate, dashboard_aggregate
from app.services.ingestion.validation import VALIDATION_POLICY_VERSION


def test_concurrent_identical_reads_share_one_successful_scan():
    cache = AggregateCache()
    entered, release = Event(), Event()
    loads = []
    expected = DashboardAggregate(3, (0.0, None), (2, 0))

    def load():
        loads.append(True)
        entered.set()
        assert release.wait(3), 'Test did not release the aggregate scan'
        return expected

    with ThreadPoolExecutor(max_workers=3) as executor:
        first = executor.submit(cache.get, 'certified-region', load)
        assert entered.wait(3)
        second = executor.submit(cache.get, 'certified-region', load)
        third = executor.submit(cache.get, 'certified-region', load)
        release.set()
        results = [future.result(timeout=3) for future in [first, second, third]]
    assert len(loads) == 1
    assert results == [expected] * 3
    with pytest.raises(FrozenInstanceError):
        results[0].source_rows = 99
    with pytest.raises(TypeError):
        results[0].means[0] = 99


def test_cache_expires_exactly_at_ttl_and_does_not_cache_failures():
    now = [0]
    cache = AggregateCache(ttl=10, clock=lambda: now[0])
    calls = []

    def load():
        calls.append(True)
        return len(calls)

    assert cache.get('a', load) == 1
    now[0] = 9
    assert cache.get('a', load) == 1
    now[0] = 10
    assert cache.get('a', load) == 2

    def failed():
        raise RuntimeError('Explicit unavailable database fixture')

    with pytest.raises(RuntimeError):
        cache.get('failed', failed)
    assert cache.get('failed', load) == 3
    assert not cache.pending


def test_cache_bounds_entries_and_reuses_recent_scope():
    cache = AggregateCache(max_entries=2)
    assert cache.get('a', lambda: 1) == 1
    assert cache.get('b', lambda: 2) == 2
    assert cache.get('a', lambda: 99) == 1
    assert cache.get('c', lambda: 3) == 3
    assert list(cache.entries) == ['a', 'c']
    assert cache.get('b', lambda: 4) == 4
    assert len(cache.entries) == 2


class AggregateSession:
    def __init__(self, bind):
        self.bind = bind
        self.new, self.dirty, self.deleted = (), (), ()
        self.version = SimpleNamespace(
            id=6, sha256='source-fixture', validated_at=datetime(2026, 1, 1),
            validation_json={'reconciled': True, 'validation_policy': VALIDATION_POLICY_VERSION},
        )
        self.statements = []

    def get_bind(self):
        return self.bind

    def get(self, model, key):
        assert model is DatasetVersion
        return self.version

    def execute(self, statement):
        self.statements.append(statement)
        columns = len(MEASUREMENT_COLUMNS)
        # Zero and missing are distinct; counts include three source rows even
        # where every selected measurement is NULL.
        row = (3, 0.0, *([None] * (columns - 1)), 2, *([0] * (columns - 1)))
        return SimpleNamespace(one=lambda: row)


@pytest.fixture
def aggregate_session(monkeypatch):
    monkeypatch.setattr(dashboard, 'aggregate_cache', AggregateCache())
    engine = create_engine('mssql+pyodbc://', creator=lambda: pytest.fail('SQL connection must not open'))
    yield AggregateSession(engine)
    engine.dispose()


def test_one_sql_scan_retains_nulls_zeros_support_and_explicit_region(aggregate_session):
    session = aggregate_session
    first = dashboard_aggregate(session, 'region-a', 6)
    second = dashboard_aggregate(session, 'region-a', 6)
    assert first == second
    assert first.source_rows == 3
    assert first.means[:2] == (0.0, None)
    assert first.present[:2] == (2, 0)
    assert len(first.means) == len(first.present) == len(MEASUREMENT_COLUMNS)
    assert len(session.statements) == 1
    compiled = session.statements[0].compile(dialect=mssql.dialect())
    assert 'avg(observations.terra_lst_day_c)' in str(compiled)
    assert 'count(observations.terra_lst_day_c)' in str(compiled)
    assert 'JOIN spatial_cells' in str(compiled)
    assert 'IS NOT NULL' not in str(compiled)
    assert 6 in compiled.params.values()
    assert 'region-a' in compiled.params.values()


def test_region_version_source_and_certificate_changes_invalidate_scope(aggregate_session):
    session = aggregate_session
    dashboard_aggregate(session, 'region-a', 6)
    dashboard_aggregate(session, 'region-b', 6)
    dashboard_aggregate(session, 'region-a', 7)
    session.version.sha256 = 'new-source-fixture'
    dashboard_aggregate(session, 'region-a', 7)
    session.version.validation_json['measurement_present'] = {'terra_lst_day_c': 2}
    dashboard_aggregate(session, 'region-a', 7)
    session.version.validated_at = datetime(2026, 1, 2)
    dashboard_aggregate(session, 'region-a', 7)
    assert len(session.statements) == 6


@pytest.mark.parametrize('bypass', ['preview', 'uncertified', 'connection_bound', 'pending_changes'])
def test_mutable_or_transactional_reads_never_reuse_certified_cache(aggregate_session, bypass):
    session = aggregate_session
    kwargs = {}
    if bypass == 'preview':
        kwargs['allow_cache'] = False
    elif bypass == 'uncertified':
        session.version.validation_json['reconciled'] = False
    elif bypass == 'connection_bound':
        session.bind = object()
    else:
        session.dirty = (object(),)
    dashboard_aggregate(session, 'region-a', 6, **kwargs)
    dashboard_aggregate(session, 'region-a', 6, **kwargs)
    assert len(session.statements) == 2
