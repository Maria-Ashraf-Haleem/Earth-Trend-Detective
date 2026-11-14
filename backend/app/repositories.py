from datetime import date

from fastapi import HTTPException
from sqlalchemy import case, extract, func, literal_column, or_, select, text

from app.models import DatasetVersion, Indicator, MEASUREMENT_COLUMNS, Observation, SpatialCell
from app.schemas import Filters
from app.services.catalog import DATASET_ID
from app.services.ingestion.validation import VALIDATION_POLICY_VERSION


def is_certified_version(version) -> bool:
    """Publication requires an actual current-policy Boolean certificate.

    Import attempt status is intentionally irrelevant: a valid certificate can
    follow historical failed attempts and their later successful recovery.
    """
    if version is None or version.validated_at is None:
        return False
    proof = version.validation_json
    return (isinstance(proof, dict) and proof.get('reconciled') is True
            and proof.get('validation_policy') == VALIDATION_POLICY_VERSION)


def latest_certified_version(session, dataset_id=DATASET_ID, *, required=False):
    """Return the latest published version of one logical dataset, if available."""
    # The SQL predicate bounds metadata retrieval. JSON_VALUE cannot distinguish
    # Boolean true from the string "true", and SQL collation can ignore case, so
    # inspect every candidate strictly in Python before choosing the newest one.
    candidates = select(DatasetVersion).where(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.validated_at.is_not(None),
        DatasetVersion.validation_json['reconciled'].as_string() == 'true',
        DatasetVersion.validation_json['validation_policy'].as_string() == VALIDATION_POLICY_VERSION,
    ).order_by(DatasetVersion.id.desc())
    for version in session.scalars(candidates):
        if is_certified_version(version):
            return version
    if required:
        raise HTTPException(503, 'No certified dataset version is available')
    return None


def active_version(session, requested=None, *, allow_uncertified=False):
    """Select published data, or an explicit preview authorized by the caller.

    The API boundary checks preview authorization before passing the capability.
    An unrestricted default must never silently choose an unverified version.
    """
    if allow_uncertified and requested is None:
        raise HTTPException(422, 'An explicit dataset version is required for an uncertified preview')
    if requested is not None:
        version = session.get(DatasetVersion, requested)
        if version is None:
            raise HTTPException(404, 'Dataset version not found')
        if is_certified_version(version) or allow_uncertified:
            return version.id
        raise HTTPException(409, 'Dataset version is not certified for publication')
    return latest_certified_version(session, required=True).id


def indicator_record(session, code):
    if not code:
        raise HTTPException(422, 'An indicator is required')
    indicator = session.get(Indicator, code)
    if indicator is None:
        raise HTTPException(404, 'Indicator not found')
    return indicator


def conditions(filters, version, indicator=None):
    clauses = [Observation.dataset_version_id == version] if version else [Observation.id < 0]
    if filters.region_id:
        clauses.append(SpatialCell.region_id == filters.region_id)
    if filters.cell_id:
        clauses.append(Observation.cell_id == filters.cell_id)
    if filters.west is not None:
        clauses.extend([SpatialCell.longitude.between(filters.west, filters.east),
                        SpatialCell.latitude.between(filters.south, filters.north)])
    if filters.start_date:
        clauses.append(Observation.observed_on >= filters.start_date)
    if filters.end_date:
        clauses.append(Observation.observed_on <= filters.end_date)
    if filters.year:
        clauses.extend([Observation.observed_on >= date(filters.year, 1, 1),
                        Observation.observed_on < date(filters.year + 1, 1, 1)])
    if filters.month:
        clauses.append(extract('month', Observation.observed_on) == filters.month)
    if indicator:
        clauses.append(getattr(Observation, indicator.id).is_not(None))
    elif filters.data_source:
        clauses.append(or_(*(getattr(Observation, name).is_not(None) for name in MEASUREMENT_COLUMNS
                             if name.startswith(filters.data_source + '_'))))
    return clauses


def _next_month(value: date) -> date:
    try:
        return date(value.year + (value.month == 12), value.month % 12 + 1, 1)
    except ValueError as exc:
        raise HTTPException(422, 'Analysis dates exceed supported calendar limits') from exc


def _analysis_bounds(filters: Filters) -> tuple[date | None, date | None]:
    """Intersect optional date and calendar-year filters without inventing coverage."""
    start, end = filters.start_date, filters.end_date
    if filters.year:
        year_start, year_end = date(filters.year, 1, 1), date(filters.year, 12, 31)
        start = max(start, year_start) if start else year_start
        end = min(end, year_end) if end else year_end
    return start, end


def _check_month_limit(start: date | None, end: date | None) -> None:
    if start and end and (end.year - start.year) * 12 + end.month - start.month + 1 > 1200:
        raise HTTPException(422, 'Analysis is limited to 1200 calendar months')


def monthly_statement(filters: Filters, version: int | None, indicator):
    """Build an SQL-only, equal-cell-weight monthly aggregate.

    Monthly context is attached to eight-day rows in the following month. Date
    filtering therefore includes overlapping *source* months for that context,
    while raw LST dates use the exact inclusive requested date interval.
    """
    column = getattr(Observation, indicator.id)
    previous_month = indicator.temporal_support == 'previous_month'
    if previous_month:
        # These are trusted SQL constants, not parameters: SQL Server treats
        # repeated positional parameters in SELECT/GROUP BY as distinct
        # expressions even when their bound values are equal (error 8120).
        effective = func.dateadd(text('month'), literal_column('-1'),
                                 func.datefromparts(extract('year', Observation.observed_on),
                                                    extract('month', Observation.observed_on),
                                                    literal_column('1')))
    else:
        effective = Observation.observed_on
    start, end = _analysis_bounds(filters)
    _check_month_limit(start, end)
    clauses = conditions(filters.model_copy(update={'start_date': None, 'end_date': None,
                                                    'year': None, 'month': None,
                                                    'data_source': None}), version)
    # Predicates on the indexed raw DATE column bound the scan. Applying only
    # DATEADD/DATEPART predicates to every stored row would defeat this index.
    if start:
        raw_start = _next_month(start.replace(day=1)) if previous_month else start
        clauses.append(Observation.observed_on >= raw_start)
    if end:
        if previous_month:
            clauses.append(Observation.observed_on < _next_month(_next_month(end.replace(day=1))))
        else:
            clauses.append(Observation.observed_on <= end)
    if filters.month:
        attachment_month = filters.month % 12 + 1 if previous_month else filters.month
        clauses.append(extract('month', Observation.observed_on) == attachment_month)
    yr, mo = extract('year', effective), extract('month', effective)
    # Average within a cell first: repeated monthly context is reduced to one
    # cell/month, and cells with more eight-day observations gain no extra weight.
    # NULL values stay missing. Do not filter them out before counting support.
    per_cell = (select(yr.label('yr'), mo.label('mo'), Observation.cell_id,
                       func.avg(column).label('value'),
                       func.count(Observation.id).label('source_rows'),
                       func.min(column).label('minimum'),
                       func.max(column).label('maximum'))
                .join(SpatialCell, SpatialCell.id == Observation.cell_id)
                .where(*clauses).group_by(yr, mo, Observation.cell_id).subquery())
    conflicts = (func.sum(case((per_cell.c.minimum != per_cell.c.maximum, 1), else_=0))
                 if previous_month else literal_column('0'))
    return (select(per_cell.c.yr, per_cell.c.mo, func.avg(per_cell.c.value).label('value'),
                   func.count().label('observed_cells'),
                   func.count(per_cell.c.value).label('contributing_cells'),
                   func.sum(per_cell.c.source_rows).label('source_rows'),
                   conflicts.label('conflicting_context_cells'))
            .group_by(per_cell.c.yr, per_cell.c.mo)
            .order_by(per_cell.c.yr, per_cell.c.mo))


def monthly_series(session, filters: Filters):
    indicator = indicator_record(session, filters.indicator)
    if filters.data_source and filters.data_source != indicator.source_id:
        raise HTTPException(422, 'Indicator does not belong to the requested data source')
    if indicator.temporal_support == 'snapshot_2020':
        raise HTTPException(422, 'GHSL 2020 is a single snapshot and cannot support a time trend')
    version = active_version(session, filters.dataset_version_id,
                             allow_uncertified=filters.allow_uncertified)
    rows = session.execute(monthly_statement(filters, version, indicator)).all()
    if any(row[6] for row in rows):
        raise HTTPException(409, 'Repeated monthly source context contains conflicting values; '
                            'data quality review is required')
    values = {
        date(int(year), int(month), 1): {
            'value': value,
            'observed_cells': observed_cells,
            'contributing_cells': contributing_cells,
            'source_rows': int(source_rows),
        }
        for year, month, value, observed_cells, contributing_cells, source_rows, _ in rows
    }
    start, end = _analysis_bounds(filters)
    start = start or min(values, default=None)
    end = end or max(values, default=None)
    points = []
    if start and end:
        if start > end:
            return points, indicator, version
        cursor = start.replace(day=1)
        _check_month_limit(cursor, end)
        while cursor <= end:
            if not filters.month or cursor.month == filters.month:
                points.append({'date': cursor.isoformat(), **values.get(cursor, {
                    'value': None, 'observed_cells': 0, 'contributing_cells': 0, 'source_rows': 0,
                })})
            if cursor == end.replace(day=1):
                break
            cursor = _next_month(cursor)
    return points, indicator, version


def observation_json(row, selected_columns):
    values = dict(row._mapping)
    return {'id': values['id'], 'cell_id': values['cell_id'],
            'dataset_version_id': values['dataset_version_id'], 'date': values['observed_on'],
            'values': {name: values[name] for name in selected_columns},
            'quality': {k: v for k, v in values['source_metadata'].items()
                        if 'valid' in k or 'qa_' in k or 'status' in k or '_qc' in k}}
