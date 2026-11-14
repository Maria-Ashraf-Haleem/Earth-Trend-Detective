"""Independent SQL reconciliation and exact-source clean exports for local operators."""
import csv
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.models import (DatasetVersion, ImportJob, ImportQuarantine, MEASUREMENT_COLUMNS,
                        Observation, QualityReport)
from app.services.ingestion.pipeline import fingerprint
from app.services.ingestion.validation import REQUIRED_FIELDS, VALIDATION_POLICY_VERSION


class VerificationFailure(RuntimeError):
    """Stable operator-facing code without connection strings or source paths."""


def _now():
    return datetime.now(timezone.utc)


def reconcile_version(session, version_id: int, profile: dict) -> dict:
    """Reconcile a complete source pass, physical SQL rows, provenance and quality counts.

    Certification is conservative: every source record must be valid and represented
    exactly once. Datasets with intentional exclusions need an explicit future policy;
    missing records are never relabeled as duplicates merely to balance totals.
    """
    version = session.get(DatasetVersion, version_id)
    if version is None:
        raise VerificationFailure('VERSION_NOT_FOUND')
    source = profile.get('source', {})
    if source.get('sha256') != version.sha256 or source.get('size_bytes') != version.source_size:
        raise VerificationFailure('PROFILE_SOURCE_MISMATCH')
    if (profile.get('status') != 'passed' or profile.get('invalid_rows') != 0
            or profile.get('validation_policy') != VALIDATION_POLICY_VERSION
            or not source.get('unchanged_during_profile')
            or len(profile.get('headers', [])) != len(REQUIRED_FIELDS)
            or set(profile.get('headers', [])) != REQUIRED_FIELDS):
        raise VerificationFailure('SOURCE_PROFILE_NOT_VALID')
    total = profile.get('rows_seen')
    if not isinstance(total, int) or total <= 0 or profile.get('valid_rows') != total:
        raise VerificationFailure('PROFILE_COUNTS_INVALID')
    values = session.execute(select(
        func.count(Observation.id), func.min(Observation.source_row), func.max(Observation.source_row),
        func.min(Observation.observed_on), func.max(Observation.observed_on),
        func.count(func.distinct(Observation.cell_id)),
        *(func.count(getattr(Observation, field)) for field in MEASUREMENT_COLUMNS),
    ).where(Observation.dataset_version_id == version_id)).one()
    observed, first_row, last_row, first_date, last_date, cells = values[:6]
    coverage = dict(zip(MEASUREMENT_COLUMNS, values[6:]))
    # Unique(version,source_row), its positive CHECK, and these bounds prove all
    # source ordinals 1..N are represented without holding their set in memory.
    ordinal_coverage = observed == total and first_row == 1 and last_row == total
    expected_coverage = {}
    numeric = profile.get('numeric_lexical_profile', {})
    for field in MEASUREMENT_COLUMNS:
        forms = numeric.get(field, {}).get('forms')
        if not isinstance(forms, dict) or sum(forms.values()) != total:
            raise VerificationFailure('PROFILE_COVERAGE_INVALID')
        expected_coverage[field] = total - forms.get('missing', 0)
    pending = session.scalar(select(func.count(func.distinct(ImportQuarantine.source_row)))
                             .where(ImportQuarantine.dataset_version_id == version_id,
                                    ImportQuarantine.resolution == 'pending'))
    jobs = session.scalars(select(ImportJob).where(ImportJob.dataset_version_id == version_id)).all()
    jobs_reconciled = all(j.processed_rows == j.inserted_rows + j.duplicate_rows + j.rejected_rows for j in jobs)
    inserted_total = sum(j.inserted_rows for j in jobs)
    latest_quality = {}
    for report in session.scalars(select(QualityReport).join(ImportJob)
                                  .where(ImportJob.dataset_version_id == version_id)
                                  .order_by(QualityReport.id)):
        if 'measurement_present' in report.report_json:
            latest_quality[report.job_id] = report.report_json
    quality_sum = {field: sum(q['measurement_present'].get(field, 0) for q in latest_quality.values())
                   for field in MEASUREMENT_COLUMNS}
    period = profile.get('observed_period', {})
    period_matches = (str(first_date) == period.get('start_date') and str(last_date) == period.get('end_date'))
    coverage_matches = coverage == expected_coverage
    audit = version.audit_json
    audit_coverage = audit.get('coverage', {})
    audit_matches = all(coverage.get(field) == count for field, count in audit_coverage.items()
                       if field in coverage)
    reconciled = (ordinal_coverage and coverage_matches and period_matches and pending == 0
                  and jobs_reconciled and inserted_total == observed and quality_sum == coverage
                  and (profile.get('grid_count_capped') or cells == profile.get('unique_grid_ids')))
    report = {
        'reconciled': bool(reconciled), 'dataset_version_id': version_id,
        'source_sha256': version.sha256, 'source_size_bytes': version.source_size,
        'validation_policy': VALIDATION_POLICY_VERSION, 'recorded_at_utc': _now().isoformat(),
        'input_records': total, 'imported_valid_records': observed,
        'unresolved_quarantine_records': pending, 'source_validation_rejected_records': profile['invalid_rows'],
        'excluded_duplicate_source_records': 0 if ordinal_coverage else None,
        'accounting_equation_satisfied': bool(ordinal_coverage and pending == 0),
        'source_ordinal_min': first_row, 'source_ordinal_max': last_row,
        'source_ordinals_complete': ordinal_coverage, 'spatial_cells': cells,
        'start_date': str(first_date) if first_date else None, 'end_date': str(last_date) if last_date else None,
        'measurement_present': coverage, 'source_profile_measurement_present': expected_coverage,
        'summed_insert_quality_counts': quality_sum, 'source_profile_coverage_matches': coverage_matches,
        'audit_reported_rows': audit.get('rows'), 'audit_reported_rows_match': audit.get('rows') == total,
        'audit_reported_feature_coverage_matches': audit_matches,
        'job_accounting_reconciled': jobs_reconciled, 'summed_unique_insert_counts': inserted_total,
        'jobs': [{'id': j.id, 'status': j.status, 'scope': j.scope_json, 'processed': j.processed_rows,
                  'inserted': j.inserted_rows, 'duplicates': j.duplicate_rows, 'rejected': j.rejected_rows}
                 for j in jobs],
        'methodology': 'Full production-validator source pass plus independent SQL counts, unique source ordinals, '
                       'quality-report sums and source feature coverage. Historical attempt counts are not added '
                       'together as source records. No missing record is assumed to be a duplicate.',
    }
    version.validation_json = report
    version.validated_at = _now().replace(tzinfo=None) if reconciled else None
    session.commit()
    return report


def validate_dataset(version_id: int, profile_path: Path = Path('docs/SOURCE_PROFILE.json')) -> dict:
    try:
        profile = json.loads(profile_path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        raise VerificationFailure('PROFILE_UNAVAILABLE') from None
    source = get_settings().data_file_path
    sha256, signature = fingerprint(source)
    if profile.get('source', {}).get('sha256') != sha256 or profile['source'].get('size_bytes') != signature[0]:
        raise VerificationFailure('SOURCE_CHANGED_AFTER_PROFILE')
    with get_session_factory()() as session:
        return reconcile_version(session, version_id, profile)


def export_clean(version_id: int, destination: Path) -> dict:
    """Export certified observations using exact lexical values from the immutable CSV.

    The current certification proves all original source ordinals are valid and
    present once, so a bounded binary copy preserves every byte and decimal lexeme.
    Source exclusions are deliberately refused until separately certified policies
    can prove their membership; no approximate numeric DB-to-CSV conversion occurs.
    """
    source = get_settings().data_file_path.resolve()
    destination = destination.resolve()
    if destination == source or destination.exists() or Path(str(destination) + '.partial').exists():
        raise VerificationFailure('OUTPUT_EXISTS_OR_IS_SOURCE')
    with get_session_factory()() as session:
        version = session.get(DatasetVersion, version_id)
        if version is None:
            raise VerificationFailure('VERSION_NOT_FOUND')
        proof = version.validation_json
        if (not version.validated_at or not proof.get('reconciled')
                or proof.get('validation_policy') != VALIDATION_POLICY_VERSION
                or not proof.get('source_ordinals_complete')):
            raise VerificationFailure('VERSION_NOT_CERTIFIED')
        expected_sha, expected_size = version.sha256, version.source_size
        rows, dataset_id = proof['input_records'], version.dataset_id
        physical_count = session.scalar(select(func.count()).select_from(Observation)
                                        .where(Observation.dataset_version_id == version_id))
        if physical_count != proof['imported_valid_records']:
            raise VerificationFailure('DATA_CHANGED_AFTER_VALIDATION')
    sha256, signature = fingerprint(source)
    if sha256 != expected_sha or signature[0] != expected_size:
        raise VerificationFailure('SOURCE_CHANGED_AFTER_VALIDATION')
    manifest_path = Path(str(destination) + '.manifest.json')
    if manifest_path.exists():
        raise VerificationFailure('OUTPUT_MANIFEST_EXISTS')
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = Path(str(destination) + '.partial')
    with source.open('rb') as original, partial.open('xb') as clean:
        shutil.copyfileobj(original, clean, length=1024 * 1024)
    exported_sha, exported_signature = fingerprint(partial)
    if exported_sha != expected_sha or exported_signature[0] != expected_size:
        raise VerificationFailure('EXPORT_FINGERPRINT_MISMATCH')
    if (source.stat().st_size, source.stat().st_mtime_ns) != signature:
        raise VerificationFailure('SOURCE_CHANGED_DURING_EXPORT')
    with partial.open('r', encoding='utf-8-sig', newline='') as clean:
        headers = next(csv.reader(clean))
    partial.rename(destination)
    manifest = {
        'file_name': destination.name, 'sha256': exported_sha, 'size_bytes': expected_size,
        'dataset_id': dataset_id, 'dataset_version_id': version_id, 'records': rows,
        'columns': headers, 'column_count': len(headers), 'created_at_utc': _now().isoformat(),
        'validation_policy': VALIDATION_POLICY_VERSION, 'source_sha256': expected_sha,
        'export_policy': 'All source ordinals independently certified valid and unique; byte-exact bounded copy.',
        'precision_policy': 'Original CSV strings, decimal precision, blank fields, units and flags are unchanged. '
                            'The SQL FLOAT(53) query layer is approximate; this file preserves exact source lexemes.',
    }
    with manifest_path.open('x', encoding='utf-8') as output:
        json.dump(manifest, output, indent=2)
        output.write('\n')
    return manifest
