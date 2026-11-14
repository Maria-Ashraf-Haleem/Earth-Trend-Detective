"""Feature preparation for a future model, backed by the ml_features_v1 view.

The view is the single feature source of truth: it carries the measurement
columns, QA-acceptance flags and seasonal encodings already reconciled during
import. Preparation is read-only and bounded, and it preserves missing values
as JSON nulls — a model that cannot handle missing features must say so rather
than receiving silently filled zeros.
"""
import json
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

# Feature blocks exposed to a model. Keys are the document sections; values are
# the view columns copied verbatim. Order is stable so feature vectors stay
# comparable between requests and model versions.
FEATURE_BLOCKS: dict[str, tuple[str, ...]] = {
    'lst': ('terra_lst_day_c', 'terra_lst_night_c', 'aqua_lst_day_c', 'aqua_lst_night_c'),
    'vegetation': ('terra_ndvi_spatial_prev_month', 'terra_evi_spatial_prev_month',
                   'aqua_ndvi_spatial_prev_month', 'aqua_evi_spatial_prev_month'),
    'monthly_context': ('terra_monthly_day_spatial_prev_month', 'terra_monthly_night_spatial_prev_month',
                        'aqua_monthly_day_spatial_prev_month', 'aqua_monthly_night_spatial_prev_month'),
    'built_environment': ('ghsl_2020_built_surface_m2_sum', 'ghsl_2020_valid_pixel_count'),
    'quality': ('terra_day_valid', 'terra_night_valid', 'aqua_day_valid', 'aqua_night_valid',
                'terra_day_qa_accepted', 'terra_night_qa_accepted', 'aqua_day_qa_accepted', 'aqua_night_qa_accepted'),
    'temporal': ('year', 'month', 'day_of_year', 'season_sin', 'season_cos'),
    'derived': ('terra_day_night_delta_c', 'aqua_day_night_delta_c', 'terra_aqua_day_difference_c'),
}
MAX_FEATURE_ROWS = 5000
FEATURE_COLUMNS = tuple(column for columns in FEATURE_BLOCKS.values() for column in columns)


def fetch_feature_rows(session: Session, *, cell_id: int | None = None, region_id: str | None = None,
                       start_date: date | None = None, end_date: date | None = None,
                       split: str | None = None) -> list[dict[str, Any]]:
    """Return bounded, null-preserving feature rows from ml_features_v1."""
    clauses = []
    params: dict[str, Any] = {'row_limit': MAX_FEATURE_ROWS}
    if cell_id is not None:
        clauses.append('cell_id = :cell_id')
        params['cell_id'] = cell_id
    if region_id:
        clauses.append('region_id = :region_id')
        params['region_id'] = region_id
    if start_date:
        clauses.append('observation_date >= :start_date')
        params['start_date'] = start_date
    if end_date:
        clauses.append('observation_date <= :end_date')
        params['end_date'] = end_date
    if split:
        clauses.append('source_split = :split')
        params['split'] = split
    where = f'WHERE {" AND ".join(clauses)}' if clauses else ''
    statement = text(f"""
        SELECT TOP (:row_limit) cell_id, region_id, observation_date, source_split, {', '.join(FEATURE_COLUMNS)}
        FROM ml_features_v1 {where}
        ORDER BY observation_date, cell_id
    """)
    rows = session.execute(statement, params).mappings().all()
    return [dict(row) for row in rows]


def build_feature_document(rows: list[dict[str, Any]], feature_version: str) -> dict[str, Any]:
    """Assemble the validated request document sent to an adapter."""
    features = [{block: {name: row.get(name) for name in columns}
                 for block, columns in FEATURE_BLOCKS.items()} | {
        'cell_id': row.get('cell_id'), 'observation_date': str(row.get('observation_date')),
        'source_split': row.get('source_split')} for row in rows]
    return {'feature_version': feature_version, 'row_count': len(features), 'rows': features,
            'null_policy': 'missing values are null; never filled with zero or interpolated'}


def summarize_features(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Bounded structural summary for status endpoints (no scientific claims)."""
    present = sum(1 for row in rows if any(row.get(column) is not None for column in FEATURE_COLUMNS))
    return {'rows_returned': len(rows), 'rows_with_any_feature': present,
            'date_min': min((str(row['observation_date']) for row in rows if row.get('observation_date')), default=None),
            'date_max': max((str(row['observation_date']) for row in rows if row.get('observation_date')), default=None)}


def dumps(document: dict[str, Any]) -> bytes:
    return json.dumps(document, separators=(',', ':')).encode()
