"""API fixtures use SQL Server only; integration data is always rolled back."""

from datetime import date
import os
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.database import get_db, get_engine
from app.models import DatasetVersion, ImportJob, Observation, Region, SpatialCell
from app.services.catalog import DATASET_ID, seed_catalog
from app.models import utcnow
from app.services.ingestion.validation import VALIDATION_POLICY_VERSION


@pytest.fixture
def client():
    # Import lazily so non-API unit tests do not need to initialize the ASGI app.
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sql_connection():
    if os.environ.get('RUN_SQL_TESTS') != '1':
        pytest.skip('Set RUN_SQL_TESTS=1 to test the migrated local SQL Server database')

    engine = get_engine()
    if engine.dialect.name != 'mssql':
        pytest.fail('Integration tests require SQL Server; another database is not supported')
    connection = engine.connect()
    transaction = connection.begin()
    try:
        yield connection
    finally:
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def sql_session(sql_connection):
    with Session(bind=sql_connection, join_transaction_mode='create_savepoint', expire_on_commit=False) as session:
        seed_catalog(session)
        yield session


@pytest.fixture
def sql_client(sql_session):
    from app.main import app

    def overridden_db():
        yield sql_session

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = overridden_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override


@pytest.fixture
def sample_observations(sql_session):
    """Distinct provenance prevents accidental selection of real imported rows."""
    token = uuid4().hex
    region = Region(id=f'test-{token}', name='Rollback API test region', country='Egypt',
                    description='Synthetic test fixture; rolled back after each test.')
    sql_session.add(region)
    sql_session.flush()
    cells = [SpatialCell(grid_id=f'test-{token}-{index}', region_id=region.id,
                         longitude=33.75 + index * 0.01, latitude=27.2)
             for index in range(2)]
    version = DatasetVersion(dataset_id=DATASET_ID, sha256=token * 2,
                             source_size=0, audit_json={'test_fixture': True}, validated_at=utcnow(),
                             validation_json={'reconciled': True, 'validation_policy': VALIDATION_POLICY_VERSION,
                                              'test_fixture': True})
    sql_session.add_all([*cells, version])
    sql_session.flush()

    inputs = [
        (cells[0], date(2021, 1, 1), 10.0, 14.0, 0.1),
        (cells[0], date(2021, 1, 9), 30.0, None, 0.1),
        (cells[1], date(2021, 1, 1), 50.0, 52.0, 0.3),
        (cells[0], date(2021, 3, 1), 40.0, None, 0.2),
        (cells[0], date(2021, 4, 1), 50.0, None, None),
    ]
    observations = [
        Observation(dataset_version_id=version.id, cell_id=cell.id, observed_on=day,
                    source_row=index, row_hash=uuid4().hex * 2,
                    source_metadata={'terra_lst_day_valid': 'True', 'terra_qa_status': 'accepted'},
                    terra_lst_day_c=terra, aqua_lst_day_c=aqua,
                    terra_ndvi_spatial_prev_month=ndvi,
                    ghsl_2020_built_surface_m2_sum=100.0)
        for index, (cell, day, terra, aqua, ndvi) in enumerate(inputs, start=1)
    ]
    job = ImportJob(id=str(uuid4()), dataset_version_id=version.id, status='completed',
                    processed_rows=len(inputs), inserted_rows=len(inputs), checkpoint_row=len(inputs),
                    total_rows=len(inputs))
    sql_session.add_all([*observations, job])
    sql_session.flush()
    return {'region': region, 'cells': cells, 'version': version, 'observations': observations, 'job': job}
