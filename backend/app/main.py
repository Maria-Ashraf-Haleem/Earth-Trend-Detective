from contextlib import asynccontextmanager
import hmac
import json
import logging
import time
from datetime import date
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from alembic.config import Config
from alembic.script import ScriptDirectory

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.core.database import get_db, get_session_factory
from app.models import (Dataset, DatasetVersion, ImportBatch, ImportJob, ImportLog, ImportQuarantine, Indicator,
                        Location, MEASUREMENT_COLUMNS, Observation,
                        QualityReport, Region, SpatialCell)
from app.repositories import (active_version, conditions, indicator_record, is_certified_version,
                              latest_certified_version, monthly_series, observation_json)
from app.schemas import (ComparisonRead, DashboardSummary, DataCoverage, DatabaseHealthRead,
                         DatasetDetail, DatasetRead, EnvironmentalOverview, ErrorResponse,
                         Filters, HealthRead, ImportDetail, ImportJobRead, ImportRequest,
                         ImportSubmission, IndicatorRead, LocationPage, ObservationPage,
                         ObservationRead, Pagination, QualityReportRead, RegionRead,
                         SpatialCellRead, TemperatureVariableRead, TrendRead, ImportBatchRead,
                         QuarantineRead, ReadinessRead, TrendFilters, ModelStatusRead,
                         ModelPredictionRequest, ModelPredictionRead)
from app.services.modeling import (PredictionFailure, build_feature_document, dumps, fetch_feature_rows,
                                   get_adapter, get_model_settings, summarize_features)
from app.services.analytics import compare_periods, describe_trend
from app.services.catalog import DATASET_ID
from app.services.dashboard import dashboard_aggregate

settings = get_settings()
logger = logging.getLogger('earthtrend')
logging.basicConfig(level=settings.log_level, format='%(message)s')


@asynccontextmanager
async def lifespan(_app: FastAPI):
    warm_dashboard_cache()
    yield


app = FastAPI(title='Earth Trend Detective API', version='1.0.0',
              description='Observed environmental data and transparent descriptive statistics. No ML predictions.',
              responses={422: {'model': ErrorResponse}, 503: {'model': ErrorResponse}},
              lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-Import-Key'],
                   expose_headers=['X-Total-Count', 'X-Page', 'X-Page-Size', 'X-Request-ID'])
api = APIRouter(prefix='/api/v1')
DB = Annotated[Session, Depends(get_db)]
Page = Annotated[int, Query(ge=1, le=100000)]
PageSize = Annotated[int, Query(ge=1, le=500)]


@app.middleware('http')
async def request_logging(request: Request, call_next):
    request.state.request_id = str(uuid4())
    started = time.perf_counter()
    response = await call_next(request)
    response.headers['X-Request-ID'] = request.state.request_id
    # Route template excludes IDs, query strings, authentication and filesystem data.
    route = request.scope.get('route')
    logger.info(json.dumps({'event': 'http_request', 'request_id': request.state.request_id,
                           'method': request.method, 'route': getattr(route, 'path', None),
                           'status': response.status_code,
                           'duration_ms': round((time.perf_counter() - started) * 1000, 2)}))
    return response


def error(request, status, code, message):
    return JSONResponse(status_code=status, content={'code': code, 'message': message, 'status': status,
                        'request_id': getattr(request.state, 'request_id', None)})


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    return error(request, exc.status_code, 'http_error', str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Pydantic input/context can contain secrets or arbitrary source paths.
    return error(request, 422, 'validation_error', 'Invalid request parameters or body; see OpenAPI schema.')


@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    logger.error(json.dumps({'event': 'database_error', 'request_id': request.state.request_id,
                             'exception_type': type(exc).__name__}))
    return error(request, 503, 'database_unavailable', 'Database operation unavailable.')


@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    logger.error(json.dumps({'event': 'unhandled_error', 'request_id': request.state.request_id,
                             'exception_type': type(exc).__name__}))
    return error(request, 500, 'internal_error', 'An internal operation failed.')


def envelope(items, total, page, page_size, **extra):
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size, **extra}


def header_page(response, total, page, page_size):
    response.headers.update({'X-Total-Count': str(total), 'X-Page': str(page), 'X-Page-Size': str(page_size)})


def require_region(session, region_id):
    region = session.get(Region, region_id)
    if region is None:
        raise HTTPException(404, 'Region not found')
    return region


def region_json(session, region):
    w, s, e, n = session.execute(select(func.min(SpatialCell.longitude), func.min(SpatialCell.latitude),
                                       func.max(SpatialCell.longitude), func.max(SpatialCell.latitude))
                                .where(SpatialCell.region_id == region.id)).one()
    return {'id': region.id, 'name': region.name, 'country': region.country,
            'description': region.description, 'centroid': [(s+n)/2, (w+e)/2] if w is not None else None,
            'bounds': {'west': w, 'south': s, 'east': e, 'north': n} if w is not None else None,
            'boundary': {'type': 'Polygon', 'coordinates': [[[w,s],[e,s],[e,n],[w,n],[w,s]]]}
            if w is not None else None, 'boundaryKind': 'source_centroid_bounding_box',
            'availability': 'available' if w is not None else 'unavailable'}


def dataset_json(session, dataset):
    version = latest_certified_version(session, dataset.id)
    period = session.execute(select(func.min(Observation.observed_on), func.max(Observation.observed_on))
                             .where(Observation.dataset_version_id == version.id)).one() if version else (None, None)
    return {'id': dataset.id, 'name': dataset.name, 'shortName': 'EarthTrend Fusion v2',
            'provider': 'Local fusion of MODIS Terra/Aqua and GHSL source products',
            'version': version.sha256 if version else 'not imported',
            'datasetVersionId': version.id if version else None,
            'importComplete': version_status(session, version.id if version else None)['import_complete'],
            'dataVerified': version_status(session, version.id if version else None)['data_verified'],
            'spatialResolution': 'MODIS source grid; monthly context uses coarser 0.05 degree bins',
            'temporalResolution': '8-day base dates; lagged monthly context; GHSL 2020 snapshot',
            'availableBands': list(MEASUREMENT_COLUMNS),
            'studyPeriod': {'start': period[0], 'end': period[1]},
            'documentationUrl': '/docs', 'notes': [dataset.description,
                'Published data requires current-policy source reconciliation.',
                'No verified air temperature or tourism observations are available.'],
            'availability': 'available' if period[0] else 'unavailable'}


@app.get('/health', response_model=HealthRead, tags=['health'])
@api.get('/health', response_model=HealthRead, tags=['health'])
def health():
    return {'status': 'ok', 'service': 'earthtrend', 'version': '1.0.0'}


@app.get('/health/database', response_model=DatabaseHealthRead, tags=['health'])
@api.get('/health/database', response_model=DatabaseHealthRead, tags=['health'])
def database_health(db: DB):
    db.execute(text('SELECT 1'))
    return {'status': 'ok', 'database': 'connected'}


@api.get('/health/readiness', response_model=ReadinessRead,
         responses={503: {'model': ReadinessRead}}, tags=['health'])
def readiness(db: DB, response: Response):
    checks = {'database': False, 'schema_current': False, 'data_verified': False}
    version = None
    try:
        db.execute(text('SELECT 1'))
        checks['database'] = True
        expected = set(ScriptDirectory.from_config(Config(str(Path(__file__).resolve().parents[1]
                                                             / 'alembic.ini'))).get_heads())
        checks['schema_current'] = set(db.scalars(text('SELECT version_num FROM alembic_version'))) == expected
        version = active_version(db)
        checks['data_verified'] = version_status(db, version)['data_verified']
    except SQLAlchemyError:
        db.rollback()
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
    ready = all(checks.values())
    if not ready:
        response.status_code = 503
    return {'status': 'ready' if ready else 'not_ready', 'checks': checks, 'dataset_version_id': version}


@api.get('/regions', response_model=list[RegionRead], tags=['geography'])
def regions(db: DB, response: Response, page: Page = 1, page_size: PageSize = 100):
    total = db.scalar(select(func.count()).select_from(Region))
    rows = db.scalars(select(Region).order_by(Region.id).offset((page-1)*page_size).limit(page_size))
    header_page(response, total, page, page_size)
    return [region_json(db, row) for row in rows]


@api.get('/regions/{region_id}', response_model=RegionRead, tags=['geography'])
def region_detail(region_id: str, db: DB):
    return region_json(db, require_region(db, region_id))


@api.get('/regions/{region_id}/cells', response_model=Pagination[SpatialCellRead], tags=['geography'])
def cells(region_id: str, db: DB, page: Page = 1, page_size: PageSize = 100):
    require_region(db, region_id)
    total = db.scalar(select(func.count()).select_from(SpatialCell).where(SpatialCell.region_id == region_id))
    rows = db.scalars(select(SpatialCell).where(SpatialCell.region_id == region_id).order_by(SpatialCell.id)
                      .offset((page-1)*page_size).limit(page_size))
    return envelope([{'id': r.id, 'grid_id': r.grid_id, 'longitude': r.longitude,
                      'latitude': r.latitude, 'region_id': r.region_id} for r in rows], total, page, page_size)


@api.get('/locations', response_model=LocationPage, tags=['geography'])
def locations(db: DB, region_id: str | None = None, page: Page = 1, page_size: PageSize = 100):
    query = select(Location)
    if region_id:
        require_region(db, region_id)
        query = query.where(Location.region_id == region_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Location.id).offset((page-1)*page_size).limit(page_size))
    return envelope([{'id': r.id, 'name': r.name, 'region_id': r.region_id, 'longitude': r.longitude,
                      'latitude': r.latitude} for r in rows], total, page, page_size,
                    availability='available' if total else 'unavailable')


@api.get('/indicators', response_model=list[IndicatorRead], tags=['observations'])
def indicators(db: DB):
    return [{'id': i.id, 'name': i.name, 'unit': i.unit, 'data_source': i.source_id,
             'temporal_support': i.temporal_support, 'description': i.description}
            for i in db.scalars(select(Indicator).order_by(Indicator.id))]


@api.get('/variables', response_model=list[TemperatureVariableRead], tags=['frontend compatibility'])
def variables(db: DB):
    return [{'id': i.id, 'name': i.name, 'shortName': i.name, 'unit': i.unit, 'datasetId': DATASET_ID,
             'observationWindow': 'nighttime' if 'night' in i.id else 'daytime',
             'description': i.description, 'scaleFactor': 1, 'nativeUnit': i.unit,
             'temporalSupport': i.temporal_support}
            for i in db.scalars(select(Indicator).where(Indicator.unit == 'degC').order_by(Indicator.id))]


@api.get('/observations', response_model=ObservationPage, tags=['observations'])
def observations(db: DB, filters: Annotated[Filters, Query()], page: Page = 1,
                 page_size: PageSize = 100, sort: Literal['date', 'id', 'cell_id'] = 'date',
                 order: Literal['asc', 'desc'] = 'asc',
                 x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(filters.allow_uncertified, filters.dataset_version_id, x_import_key)
    if filters.region_id:
        require_region(db, filters.region_id)
    if filters.cell_id and db.get(SpatialCell, filters.cell_id) is None:
        raise HTTPException(404, 'Spatial cell not found')
    indicator = indicator_record(db, filters.indicator) if filters.indicator else None
    if indicator and filters.data_source and indicator.source_id != filters.data_source:
        raise HTTPException(422, 'Indicator does not belong to the requested data source')
    version = active_version(db, filters.dataset_version_id, allow_uncertified=filters.allow_uncertified)
    clauses = conditions(filters, version, indicator)
    cols = [indicator.id] if indicator else [c for c in MEASUREMENT_COLUMNS
             if not filters.data_source or c.startswith(filters.data_source + '_')]
    # SpatialCell only constrains counts for region or bounds filters; without
    # them the join forces a wide clustered-index count over millions of rows.
    needs_join = bool(filters.region_id or filters.west is not None)
    count_query = select(func.count()).select_from(Observation)
    if needs_join:
        count_query = count_query.join(SpatialCell)
    count = db.scalar(count_query.where(*clauses))
    sort_col = {'date': Observation.observed_on, 'id': Observation.id, 'cell_id': Observation.cell_id}[sort]
    descending = order == 'desc'
    if not needs_join and sort == 'date':
        # Two-step page fetch. A single top-N query that includes the wide
        # NVARCHAR(MAX) metadata makes SQL Server scan and sort the whole
        # clustered table (>60 s for ~7M rows); resolving the page ids on the
        # narrow (dataset_version_id, observed_on) index first and then reading
        # those rows by clustered seek returns the identical page in seconds.
        page_ids = db.scalars(select(Observation.id).where(*clauses)
                              .order_by(sort_col.desc() if descending else sort_col.asc(), Observation.id)
                              .offset((page-1)*page_size).limit(page_size)).all()
        if not page_ids:
            rows = []
        else:
            fetched = db.execute(select(Observation.id, Observation.cell_id, Observation.dataset_version_id,
                                        Observation.observed_on, Observation.source_metadata,
                                        *(getattr(Observation, c) for c in cols))
                                 .where(Observation.id.in_(page_ids))).all()
            # IN () has no defined order; restore the requested page ordering.
            rows = sorted(fetched, key=lambda r: (r.observed_on, r.id), reverse=descending)
    else:
        query = select(Observation.id, Observation.cell_id, Observation.dataset_version_id,
                       Observation.observed_on, Observation.source_metadata,
                       *(getattr(Observation, c) for c in cols)).where(*clauses)
        if needs_join:
            query = query.join(SpatialCell)
        query = query.order_by(sort_col.desc() if descending else sort_col.asc(), Observation.id)
        rows = db.execute(query.offset((page-1)*page_size).limit(page_size))
    return envelope([observation_json(r, cols) for r in rows], count, page, page_size,
                    availability='available' if count else 'unavailable', dataset_version_id=version)


@api.get('/observations/{observation_id}', response_model=ObservationRead, tags=['observations'])
def observation_detail(observation_id: int, db: DB, allow_uncertified: bool = False,
                       x_import_key: Annotated[str | None, Header()] = None):
    # An observation ID is an explicit selection; preview still requires the key.
    authorize_preview(allow_uncertified, observation_id, x_import_key)
    row = db.execute(select(Observation.id, Observation.cell_id, Observation.dataset_version_id,
                            Observation.observed_on, Observation.source_metadata,
                            *(getattr(Observation, c) for c in MEASUREMENT_COLUMNS))
                     .where(Observation.id == observation_id)).first()
    if row is None:
        raise HTTPException(404, 'Observation not found')
    active_version(db, row.dataset_version_id, allow_uncertified=allow_uncertified)
    return observation_json(row, MEASUREMENT_COLUMNS)


def version_status(db, version):
    record = db.get(DatasetVersion, version) if version else None
    verified = is_certified_version(record)
    completed = bool(db.scalar(select(ImportJob.id).where(ImportJob.dataset_version_id == version,
                                                       ImportJob.status == 'completed',
                        ImportJob.scope_json['kind'].as_string() == 'full_csv').limit(1))) if version else False
    completed = completed or verified
    return {'dataset_version_id': version, 'import_complete': completed,
            'data_verified': verified,
            'warning': None if verified else ('Dataset is uncertified; do not treat this preview as published data.'
                                             if version else 'No certified dataset version is available.')}


def summary_data(db, region_id, version):
    filters = Filters(region_id=region_id)
    if region_id:
        require_region(db, region_id)
    count, first, last = db.execute(select(func.count(Observation.id), func.min(Observation.observed_on),
                                          func.max(Observation.observed_on)).join(SpatialCell)
                                   .where(*conditions(filters, version))).one()
    cell_count = db.scalar(select(func.count(func.distinct(Observation.cell_id))).join(SpatialCell)
                           .where(*conditions(filters, version)))
    return {'observation_rows': count, 'spatial_cells': cell_count, 'start_date': first, 'end_date': last,
            'availability': 'available' if count else 'unavailable', 'air_temperature': 'unavailable',
            'tourism': 'unavailable', 'predictions': 'unavailable', **version_status(db, version)}


@api.get('/dashboard/summary', response_model=DashboardSummary, tags=['dashboard'])
def dashboard_summary(db: DB, region_id: str | None = None,
                      dataset_version_id: Annotated[int | None, Query(ge=1)] = None,
                      allow_uncertified: bool = False,
                      x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(allow_uncertified, dataset_version_id, x_import_key)
    return summary_data(db, region_id, active_version(db, dataset_version_id, allow_uncertified=allow_uncertified))


@api.get('/dashboard/environmental-overview', response_model=EnvironmentalOverview, tags=['dashboard'])
def overview(db: DB, region_id: str | None = None,
             dataset_version_id: Annotated[int | None, Query(ge=1)] = None,
             allow_uncertified: bool = False,
             x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(allow_uncertified, dataset_version_id, x_import_key)
    if region_id:
        require_region(db, region_id)
    version = active_version(db, dataset_version_id, allow_uncertified=allow_uncertified)
    aggregate = dashboard_aggregate(db, region_id, version, allow_cache=not allow_uncertified)
    return {'items': [{'indicator': c, 'mean_attached_source_value': v,
                       'availability': 'available' if v is not None else 'unavailable'}
                      for c, v in zip(MEASUREMENT_COLUMNS, aggregate.means)], **version_status(db, version),
            'methodology': 'Descriptive row-weighted source values, including repeated monthly/snapshot context. '
                           'Not a trend or an area-weighted estimate; use /analysis/trends for monthly aggregates.'}


@api.get('/dashboard/data-coverage', response_model=DataCoverage, tags=['dashboard'])
def coverage(db: DB, region_id: str | None = None,
             dataset_version_id: Annotated[int | None, Query(ge=1)] = None,
             allow_uncertified: bool = False,
             x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(allow_uncertified, dataset_version_id, x_import_key)
    if region_id:
        require_region(db, region_id)
    version = active_version(db, dataset_version_id, allow_uncertified=allow_uncertified)
    aggregate = dashboard_aggregate(db, region_id, version, allow_cache=not allow_uncertified)
    return {'source_rows': aggregate.source_rows, 'items': [{'indicator': c, 'present_rows': n,
            'missing_rows': aggregate.source_rows-n,
            'present_ratio': n/aggregate.source_rows if aggregate.source_rows else None}
            for c, n in zip(MEASUREMENT_COLUMNS, aggregate.present)], **version_status(db, version),
            'denominator': 'Imported source rows only; repeated context is counted as attachment coverage.'}


def trend_data(db, filters):
    if filters.region_id:
        require_region(db, filters.region_id)
    if filters.cell_id and db.get(SpatialCell, filters.cell_id) is None:
        raise HTTPException(404, 'Spatial cell not found')
    points, indicator, version = monthly_series(db, filters)
    result = describe_trend(points, indicator.unit, percentage_meaningful=indicator.unit in ('m2', 'pixels'))
    result.update({'indicator': indicator.id, 'series': points, **version_status(db, version)})
    # Preserve the response contract with an ephemeral computation identifier.
    # GET requests never persist history; an explicit save workflow is deferred.
    result['analysis_id'] = str(uuid4())
    return result


@api.get('/analysis/trends', response_model=TrendRead, tags=['analysis'])
def trends(db: DB, filters: Annotated[TrendFilters, Query()],
           x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(filters.allow_uncertified, filters.dataset_version_id, x_import_key)
    return trend_data(db, filters)


@api.get('/analysis/trends/{region_id}', response_model=TrendRead, tags=['analysis'])
def region_trends(region_id: str, db: DB, indicator: Annotated[str, Query(min_length=1)], start_date: date | None = None,
                  end_date: date | None = None,
                  dataset_version_id: Annotated[int | None, Query(ge=1)] = None,
                  allow_uncertified: bool = False,
                  x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(allow_uncertified, dataset_version_id, x_import_key)
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, 'start_date must be on or before end_date')
    return trend_data(db, Filters(region_id=region_id, indicator=indicator, start_date=start_date,
                                  end_date=end_date, dataset_version_id=dataset_version_id,
                                  allow_uncertified=allow_uncertified))


@api.get('/analysis/compare', response_model=ComparisonRead, tags=['analysis'])
def compare(db: DB, indicator: Annotated[str, Query(min_length=1)], period_a_start: date, period_a_end: date,
            period_b_start: date, period_b_end: date, region_id: str | None = None,
            dataset_version_id: Annotated[int | None, Query(ge=1)] = None,
            allow_uncertified: bool = False,
            x_import_key: Annotated[str | None, Header()] = None):
    authorize_preview(allow_uncertified, dataset_version_id, x_import_key)
    if period_a_start > period_a_end or period_b_start > period_b_end:
        raise HTTPException(422, 'Period start must be on or before its end')
    if period_a_start <= period_b_end and period_b_start <= period_a_end:
        raise HTTPException(422, 'Comparison periods must not overlap')
    if region_id:
        require_region(db, region_id)
    record = indicator_record(db, indicator)
    if record.temporal_support == 'previous_month':
        # Monthly context represents a whole source month. Disjoint day ranges
        # in the same month would otherwise compare the same observation twice.
        if (period_a_start.replace(day=1) <= period_b_end.replace(day=1)
                and period_b_start.replace(day=1) <= period_a_end.replace(day=1)):
            raise HTTPException(422, 'Comparison periods overlap in source calendar months')
    fa = Filters(indicator=indicator, region_id=region_id, start_date=period_a_start,
                 end_date=period_a_end, dataset_version_id=dataset_version_id,
                 allow_uncertified=allow_uncertified)
    a, record, version = monthly_series(db, fa)
    b, _, _ = monthly_series(db, fa.model_copy(update={'start_date': period_b_start, 'end_date': period_b_end,
                                                     'dataset_version_id': version}))
    result = compare_periods(a, b, record.unit, percentage_meaningful=record.unit in ('m2', 'pixels'))
    result.update({'indicator': indicator, **version_status(db, version)})
    result['analysis_id'] = str(uuid4())
    return result


@api.get('/datasets', response_model=list[DatasetRead], tags=['datasets'])
def datasets(db: DB, response: Response, page: Page = 1, page_size: PageSize = 100):
    total = db.scalar(select(func.count()).select_from(Dataset))
    rows = db.scalars(select(Dataset).order_by(Dataset.id).offset((page-1)*page_size).limit(page_size))
    header_page(response, total, page, page_size)
    return [dataset_json(db, row) for row in rows]


@api.get('/datasets/{dataset_id}', response_model=DatasetDetail, tags=['datasets'])
def dataset_detail(dataset_id: str, db: DB):
    row = db.get(Dataset, dataset_id)
    if row is None:
        raise HTTPException(404, 'Dataset not found')
    result = dataset_json(db, row)
    # Filesystem paths in supplied audit remain private; expose only known-safe provenance keys.
    result['versions'] = [{'id': v.id, 'sha256': v.sha256, 'source_size_bytes': v.source_size,
                            'created_at': v.created_at, 'validation': v.validation_json,
                            'provenance': {k: v.audit_json[k] for k in
                                ('status', 'rows', 'base_grid_cells', 'spatial_method', 'temporal_method',
                                 'ghsl_policy', 'coverage', 'limitations') if k in v.audit_json}}
                           for v in db.scalars(select(DatasetVersion).where(DatasetVersion.dataset_id == row.id)
                                                .order_by(DatasetVersion.id))]
    return result


def job_json(job):
    return {'scope': job.scope_json, **{key: getattr(job, key) for key in ('id', 'dataset_version_id', 'status', 'processed_rows',
            'inserted_rows', 'duplicate_rows', 'rejected_rows', 'checkpoint_row', 'total_rows',
            'created_at', 'started_at', 'finished_at', 'error_code')}}


@api.get('/imports', response_model=Pagination[ImportJobRead], tags=['imports'])
def imports(db: DB, page: Page = 1, page_size: PageSize = 100):
    total = db.scalar(select(func.count()).select_from(ImportJob))
    rows = db.scalars(select(ImportJob).order_by(ImportJob.created_at.desc(), ImportJob.id)
                      .offset((page-1)*page_size).limit(page_size))
    return envelope([job_json(j) for j in rows], total, page, page_size)


@api.get('/imports/{job_id}', response_model=ImportDetail, tags=['imports'])
def import_detail(job_id: str, db: DB):
    row = db.get(ImportJob, job_id)
    if row is None:
        raise HTTPException(404, 'Import job not found')
    result = job_json(row)
    result['logs'] = [{'row_number': log.row_number, 'level': log.level, 'code': log.code,
                        'message': log.message} for log in db.scalars(select(ImportLog)
                        .where(ImportLog.job_id == row.id).order_by(ImportLog.id.desc()).limit(100))]
    return result


@api.get('/imports/{job_id}/batches', response_model=Pagination[ImportBatchRead], tags=['imports'])
def import_batches(job_id: str, db: DB, page: Page = 1, page_size: PageSize = 100):
    if db.get(ImportJob, job_id) is None:
        raise HTTPException(404, 'Import job not found')
    total = db.scalar(select(func.count()).select_from(ImportBatch).where(ImportBatch.job_id == job_id))
    names = ('id', 'job_id', 'batch_number', 'source_start_row', 'source_end_row', 'processed_rows',
             'inserted_rows', 'duplicate_rows', 'rejected_rows', 'committed_at')
    rows = db.execute(select(*(getattr(ImportBatch, key) for key in names)).where(ImportBatch.job_id == job_id)
                       .order_by(ImportBatch.batch_number).offset((page-1)*page_size).limit(page_size)).mappings()
    return envelope([dict(row) for row in rows], total, page, page_size)


@api.get('/imports/{job_id}/quarantine', response_model=Pagination[QuarantineRead], tags=['imports'])
def import_quarantine(job_id: str, db: DB, page: Page = 1, page_size: PageSize = 100,
                      resolution: Literal['pending', 'resolved', 'duplicate'] | None = None):
    if db.get(ImportJob, job_id) is None:
        raise HTTPException(404, 'Import job not found')
    clauses = [ImportQuarantine.job_id == job_id]
    if resolution:
        clauses.append(ImportQuarantine.resolution == resolution)
    total = db.scalar(select(func.count()).select_from(ImportQuarantine).where(*clauses))
    names = ('id', 'job_id', 'dataset_version_id', 'source_row', 'row_hash', 'error_code', 'error_field',
             'resolution', 'resolved_by_job_id', 'resolved_observation_id', 'resolved_at', 'created_at')
    rows = db.execute(select(*(getattr(ImportQuarantine, key) for key in names)).where(*clauses)
                       .order_by(ImportQuarantine.source_row).offset((page-1)*page_size).limit(page_size)).mappings()
    return envelope([dict(row) for row in rows], total, page, page_size)


def import_authorization(x_import_key: Annotated[str | None, Header()] = None):
    secret = settings.import_api_key.get_secret_value() if settings.import_api_key else None
    if not secret:
        raise HTTPException(503, 'Import submission is disabled until IMPORT_API_KEY is configured')
    if not x_import_key or not hmac.compare_digest(x_import_key.encode(), secret.encode()):
        raise HTTPException(401, 'Invalid import key')


def authorize_preview(allow_uncertified, requested, x_import_key):
    if allow_uncertified:
        if requested is None:
            raise HTTPException(422, 'An explicit dataset version is required for an uncertified preview')
        import_authorization(x_import_key)


@api.post('/imports', response_model=ImportSubmission, status_code=202, tags=['imports'],
          dependencies=[Depends(import_authorization)])
def submit_import(body: ImportRequest, db: DB):
    lock_result = db.execute(text("""
        DECLARE @result int;
        EXEC @result = sys.sp_getapplock @Resource='earthtrend:csv-ingestion',
            @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=0;
        SELECT @result;
    """)).scalar_one()
    if lock_result < 0:
        raise HTTPException(409, 'An import is currently running')
    active = db.scalar(select(ImportJob.id).where(ImportJob.status.in_(['queued', 'running'])).limit(1))
    if active:
        raise HTTPException(409, 'An import is already queued or running')
    if body.resume_job_id:
        job = db.get(ImportJob, body.resume_job_id)
        if job is None:
            raise HTTPException(404, 'Import job not found')
        if job.error_code == 'VALIDATION_POLICY_UPDATED':
            raise HTTPException(409, 'This historical job requires a new idempotent import instead of resume')
        if job.status in ('running', 'queued', 'completed'):
            raise HTTPException(409, 'Job is already active or completed')
        job.status = 'queued'
        job.error_code = None
        job.finished_at = None
        quality = db.scalar(select(QualityReport).where(QualityReport.job_id == job.id)
                            .order_by(QualityReport.id.desc()).limit(1))
        if quality is not None:
            queued_report = {**quality.report_json, 'status': 'queued'}
            queued_report.pop('error_code', None)
            quality.report_json = queued_report
    elif body.retry_quarantine_job_id:
        source = db.get(ImportJob, body.retry_quarantine_job_id)
        if source is None:
            raise HTTPException(404, 'Source import job not found')
        if not db.scalar(select(ImportQuarantine.id).where(ImportQuarantine.job_id == source.id).limit(1)):
            raise HTTPException(409, 'Source job has no quarantined records')
        job = ImportJob(id=str(uuid4()), status='queued', dataset_version_id=source.dataset_version_id,
                        scope_json={'kind': 'quarantine_replay', 'source_job_id': source.id})
        db.add(job)
    else:
        job = ImportJob(id=str(uuid4()), status='queued')
        db.add(job)
    db.commit()
    return {'job': job_json(job), 'execution': 'Run the configured CLI worker; no filesystem path accepted.'}


@api.get('/quality/reports', response_model=Pagination[QualityReportRead], tags=['quality'])
def quality_reports(db: DB, job_id: str | None = None, page: Page = 1, page_size: PageSize = 100):
    query = select(QualityReport)
    if job_id:
        query = query.where(QualityReport.job_id == job_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(QualityReport.id.desc()).offset((page-1)*page_size).limit(page_size))
    return envelope([{'id': r.id, 'job_id': r.job_id, 'created_at': r.created_at,
                      'report': r.report_json} for r in rows], total, page, page_size)


# --- Optional model integration ------------------------------------------------
# Disabled until MODEL_ENABLED=true names a provider. Status describes
# configuration truthfully; reachability is only proven at inference time.
# These routes never generate substitute values when no model exists.

@api.get('/model/status', response_model=ModelStatusRead, tags=['model integration'])
def model_status(db: DB):
    model_settings = get_model_settings()
    adapter = get_adapter(model_settings)
    feature_version = model_settings.model_feature_version
    if adapter is None:
        configured = model_settings.model_enabled and not model_settings.model_provider
        return {'enabled': model_settings.model_enabled,
                'status': 'not_configured',
                'provider': model_settings.model_provider or None,
                'model_name': model_settings.model_name or None,
                'model_version': model_settings.model_version or None,
                'feature_version': feature_version,
                'message': 'No inference provider is configured. Predictions remain unavailable; '
                           'observed-data endpoints are unaffected.'
                if configured or not model_settings.model_enabled else
                'MODEL_ENABLED is true but no provider is named.'}
    info = adapter.availability()
    status = 'not_implemented' if adapter.name == 'local' else 'available'
    return {'enabled': True, 'status': status, 'provider': adapter.name,
            'model_name': info.get('model_name'), 'model_version': info.get('model_version'),
            'feature_version': feature_version,
            'message': 'Configuration accepted for a locally hosted artifact that is not installed yet.'
            if status == 'not_implemented' else
            'Configuration accepted; reachability is proven at inference time, not here.'}


@api.post('/model/predictions', response_model=ModelPredictionRead,
          responses={503: {'model': ErrorResponse}}, tags=['model integration'])
def model_predictions(body: ModelPredictionRequest, db: DB, request: Request):
    model_settings = get_model_settings()
    adapter = get_adapter(model_settings)
    if adapter is None:
        return error(request, 503, 'model_not_configured',
                     'No inference provider is configured; set MODEL_ENABLED and MODEL_PROVIDER first.')
    if not (body.region_id or body.cell_id):
        raise HTTPException(422, 'A region_id or cell_id is required')
    if body.region_id:
        require_region(db, body.region_id)
    if body.cell_id and db.get(SpatialCell, body.cell_id) is None:
        raise HTTPException(404, 'Spatial cell not found')
    rows = fetch_feature_rows(db, cell_id=body.cell_id, region_id=body.region_id,
                              start_date=body.start_date, end_date=body.end_date,
                              split=body.source_split)
    if not rows:
        raise HTTPException(404, 'No ml_features_v1 rows match the requested selection')
    document = build_feature_document(rows, model_settings.model_feature_version)
    request_id = str(uuid4())
    try:
        outcome = adapter.predict(dumps(document), request_id)
    except PredictionFailure as exc:
        logger.warning(json.dumps({'event': 'model_prediction_failed', 'request_id': request_id,
                                   'code': exc.code}))
        return error(request, 503, exc.code, exc.message)
    if not outcome.unit:
        return error(request, 503, 'model_invalid_response', 'The inference response lacks a prediction unit.')
    return {'request_id': request_id, 'model_name': outcome.model_name, 'model_version': outcome.model_version,
            'provider': adapter.name, 'unit': outcome.unit, 'value': outcome.value,
            'confidence': outcome.confidence, 'feature_version': model_settings.model_feature_version,
            'rows_used': len(rows), 'details': summarize_features(rows),
            'disclaimer': 'Model output for a configured provider; not an observed measurement.'}


def legacy_unavailable():
    raise HTTPException(501, 'Legacy frontend experiments and sessions are unavailable. '
                        'Use observed-data and descriptive-analysis endpoints. See FRONTEND_CONTRACT.md.')


for path, methods in [('/experiments', ['POST']), ('/experiments/{id}', ['GET']),
                       ('/experiments/{id}/run', ['POST']), ('/experiments/{id}/status', ['GET']),
                       ('/experiments/{id}/results', ['GET']), ('/experiments/{id}/map', ['GET']),
                       ('/experiments/{id}/insights', ['POST']), ('/experiments/{id}/export', ['GET']),
                       ('/sessions', ['GET', 'POST'])]:
    for method in methods:
        api.add_api_route(path, legacy_unavailable, methods=[method], tags=['frontend compatibility'],
                          operation_id=method.lower() + '_' + path.replace('/', '_').replace('{', '').replace('}', ''),
                          status_code=501, response_model=ErrorResponse)

app.include_router(api)


def warm_dashboard_cache():
    """Precompute the certified-version dashboard aggregate shortly after start.

    The first dashboard request otherwise pays one full aggregate scan (tens of
    seconds with a cold buffer pool). Certified observations are immutable, so
    warming at startup serves identical means earlier; this never writes to the
    database and must never prevent startup.
    """
    import threading

    def run():
        try:
            with get_session_factory()() as session:
                version = active_version(session)
                dashboard_aggregate(session, None, version, allow_cache=True)
            logger.info(json.dumps({'event': 'dashboard_cache_warmed', 'dataset_version_id': version}))
        except Exception as exc:
            logger.warning(json.dumps({'event': 'dashboard_cache_warm_skipped',
                                       'exception_type': type(exc).__name__}))

    threading.Thread(target=run, name='dashboard-cache-warm', daemon=True).start()
