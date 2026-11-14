"""Release certification and byte-exact exports use isolated SQL Server fixtures."""
import copy
import csv
from collections import Counter
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import (DatasetVersion, ImportJob, ImportQuarantine, MEASUREMENT_COLUMNS,
                        Observation, QualityReport, Region, SpatialCell)
from app.services import verification
from app.services.ingestion.validation import (FLAG_FIELDS, REQUIRED_FIELDS, STATUS_FIELDS,
                                             VALIDATION_POLICY_VERSION, parse_row)

pytestmark = pytest.mark.integration


def _raw_row(grid_id, day, **changes):
    row = {field: '' for field in REQUIRED_FIELDS}
    row.update({field: '0' if 'masked' in field else '1' for field in FLAG_FIELDS})
    row.update({field: 'ACCEPTED' for field in STATUS_FIELDS})
    row.update(
        grid_id=grid_id, longitude='33.750000', latitude='27.200000',
        observation_date=day.isoformat(), year=str(day.year), month=str(day.month),
        day_of_year=str(day.timetuple().tm_yday), season_sin='0.017202', season_cos='0.999852',
        terra_lst_day_c='28.170000000000000000001', terra_lst_night_c='8.9100',
        aqua_lst_day_c='32.9100', aqua_lst_night_c='6.2700',
        terra_day_night_delta_c='19.26', aqua_day_night_delta_c='26.64',
        terra_aqua_day_difference_c='-4.74', split='validation',
        terra_night_qc='0.0', aqua_night_qc='65.0',
        terra_ndvi_spatial_prev_month='0.123456789012345678901234',
        terra_evi_spatial_prev_month='0.22500', aqua_ndvi_spatial_prev_month='0.17500',
        aqua_evi_spatial_prev_month='0.27500',
        terra_monthly_day_spatial_prev_month='27.12500',
        terra_monthly_night_spatial_prev_month='10.12500',
        aqua_monthly_day_spatial_prev_month='30.12500',
        aqua_monthly_night_spatial_prev_month='8.12500',
        ghsl_2020_built_surface_m2_sum='12345.678901234567890123',
        ghsl_2020_valid_pixel_count='87.0',
        aqua_day_valid='1.0', aqua_night_valid='1.0',
        aqua_day_qa_accepted='1.0', aqua_night_qa_accepted='1.0',
    )
    row.update(changes)
    return row


@pytest.fixture
def release(sql_session, tmp_path, monkeypatch):
    """Two complete source ordinals, deliberately beyond exact FLOAT precision."""
    token = uuid4().hex
    raw = [
        _raw_row(f'verification-{token}-a', date(2021, 1, 1)),
        _raw_row(f'verification-{token}-b', date(2021, 2, 1), longitude='33.760000',
                 terra_lst_night_c='', terra_night_valid='0.0', terra_night_qa_accepted='0.0',
                 terra_night_status='NO_VALID_SOURCE_VALUE', terra_night_qc='',
                 terra_night_qc_source_masked='1.0', terra_day_night_delta_c='',
                 terra_ndvi_spatial_prev_month='', aqua_evi_spatial_prev_month='',
                 ghsl_2020_built_surface_m2_sum='0'),
    ]
    headers = sorted(REQUIRED_FIELDS)
    source = tmp_path / 'source.csv'
    with source.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=headers)
        writer.writeheader()
        writer.writerows(raw)
    source_bytes = source.read_bytes()
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    region = Region(id=f'verification-{token}', name='Rollback verification fixture', country='Egypt',
                    description='Synthetic release fixture; not real environmental observations.')
    sql_session.add(region)
    sql_session.flush()
    cells = [SpatialCell(grid_id=row['grid_id'], region_id=region.id,
                         longitude=float(row['longitude']), latitude=float(row['latitude']))
             for row in raw]
    present = {field: sum(row[field] != '' for row in raw) for field in MEASUREMENT_COLUMNS}
    version = DatasetVersion(dataset_id='earthtrend-spatial-fusion-v2', sha256=source_sha,
                             source_size=len(source_bytes), audit_json={'rows': 2, 'coverage': present})
    sql_session.add_all([*cells, version])
    sql_session.flush()
    job = ImportJob(id=str(uuid4()), dataset_version_id=version.id, status='completed',
                    processed_rows=2, inserted_rows=2, duplicate_rows=0, rejected_rows=0,
                    checkpoint_row=2, total_rows=2)
    sql_session.add(job)
    sql_session.flush()
    observations = []
    for number, (row, cell) in enumerate(zip(raw, cells), start=1):
        parsed = parse_row(row)
        observation = Observation(dataset_version_id=version.id, cell_id=cell.id,
                                  observed_on=parsed.observed_on, source_row=number,
                                  row_hash=parsed.row_hash, source_metadata=parsed.source_metadata,
                                  import_job_id=job.id, **parsed.measurements)
        sql_session.add(observation)
        observations.append(observation)
    quality = QualityReport(job_id=job.id, report_json={'measurement_present': present, 'status': 'completed'})
    sql_session.add(quality)
    sql_session.flush()
    lexical = {}
    for field in MEASUREMENT_COLUMNS:
        forms = Counter()
        for row in raw:
            value = row[field]
            form = ('missing' if value == '' else 'integer' if '.' not in value
                    else 'decimal_integral' if Decimal(value) == Decimal(value).to_integral_value()
                    else 'decimal_fractional')
            forms[form] += 1
        lexical[field] = {'forms': dict(forms)}
    profile = {
        'status': 'passed', 'validation_policy': VALIDATION_POLICY_VERSION,
        'source': {'file_name': source.name, 'sha256': source_sha, 'size_bytes': len(source_bytes),
                   'unchanged_during_profile': True},
        'headers': headers, 'rows_seen': 2, 'valid_rows': 2, 'invalid_rows': 0,
        'observed_period': {'start_date': '2021-01-01', 'end_date': '2021-02-01'},
        'grid_count_capped': False, 'unique_grid_ids': 2, 'numeric_lexical_profile': lexical,
    }
    profile_file = tmp_path / 'profile.json'
    profile_file.write_text(json.dumps(profile), encoding='utf-8')

    @contextmanager
    def borrowed_session():
        # Verification commits its savepoint; the fixture's outer SQL transaction
        # remains responsible for cleanup. Do not close the borrowed session.
        yield sql_session

    monkeypatch.setattr(verification, 'get_session_factory', lambda: borrowed_session)
    monkeypatch.setattr(verification, 'get_settings', lambda: SimpleNamespace(data_file_path=source))
    return SimpleNamespace(version=version, job=job, observations=observations, quality=quality,
                           raw=raw, headers=headers, present=present, profile=profile,
                           profile_file=profile_file, source=source, source_bytes=source_bytes,
                           source_sha=source_sha, output=tmp_path / 'clean.csv')


def test_complete_source_sql_quality_and_job_accounting_can_be_certified(sql_session, release):
    report = verification.validate_dataset(release.version.id, release.profile_file)
    assert report['reconciled'] is True
    assert report['input_records'] == report['imported_valid_records'] == 2
    assert report['unresolved_quarantine_records'] == report['source_validation_rejected_records'] == 0
    assert report['excluded_duplicate_source_records'] == 0
    assert report['source_ordinals_complete'] is True
    assert report['source_profile_coverage_matches'] is True
    assert report['summed_insert_quality_counts'] == report['measurement_present'] == release.present
    assert report['job_accounting_reconciled'] is True
    assert report['source_sha256'] == release.source_sha
    assert release.version.validated_at is not None
    assert release.version.validation_json['reconciled'] is True


def test_missing_source_ordinal_refuses_certification_even_when_row_count_matches(sql_session, release):
    release.observations[1].source_row = 3
    sql_session.flush()
    report = verification.reconcile_version(sql_session, release.version.id, release.profile)
    assert report['reconciled'] is False
    assert report['source_ordinals_complete'] is False
    assert report['accounting_equation_satisfied'] is False
    assert release.version.validated_at is None


def test_pending_quarantine_prevents_a_clean_certificate(sql_session, release):
    sql_session.add(ImportQuarantine(job_id=release.job.id, dataset_version_id=release.version.id,
                                     source_row=1, row_hash=release.observations[0].row_hash,
                                     error_code='SYNTHETIC_REVIEW', error_field='row',
                                     raw_payload=release.raw[0], resolution='pending'))
    sql_session.flush()
    report = verification.reconcile_version(sql_session, release.version.id, release.profile)
    assert report['reconciled'] is False
    assert report['unresolved_quarantine_records'] == 1
    assert release.version.validated_at is None


@pytest.mark.parametrize('corruption', ['feature_coverage', 'job_accounting', 'quality_accounting'])
def test_independent_coverage_and_attempt_accounting_fail_closed(sql_session, release, corruption):
    if corruption == 'feature_coverage':
        release.observations[0].terra_lst_day_c = None
    elif corruption == 'job_accounting':
        release.job.processed_rows = 3
    else:
        release.quality.report_json = {'measurement_present': {**release.present, 'terra_lst_day_c': 0}}
    sql_session.flush()
    report = verification.reconcile_version(sql_session, release.version.id, release.profile)
    assert report['reconciled'] is False
    assert release.version.validated_at is None


@pytest.mark.parametrize('corruption,code', [
    ('sha', 'PROFILE_SOURCE_MISMATCH'),
    ('size', 'PROFILE_SOURCE_MISMATCH'),
    ('policy', 'SOURCE_PROFILE_NOT_VALID'),
    ('missing_header', 'SOURCE_PROFILE_NOT_VALID'),
    ('duplicate_header', 'SOURCE_PROFILE_NOT_VALID'),
    ('invalid_row', 'SOURCE_PROFILE_NOT_VALID'),
    ('coverage_form_count', 'PROFILE_COVERAGE_INVALID'),
])
def test_untrusted_or_incompatible_profiles_are_not_certified(sql_session, release, corruption, code):
    profile = copy.deepcopy(release.profile)
    if corruption == 'sha':
        profile['source']['sha256'] = 'f' * 64
    elif corruption == 'size':
        profile['source']['size_bytes'] += 1
    elif corruption == 'policy':
        profile['validation_policy'] = 'retired-policy'
    elif corruption == 'missing_header':
        profile['headers'].pop()
    elif corruption == 'duplicate_header':
        profile['headers'].append(profile['headers'][0])
    elif corruption == 'invalid_row':
        profile['invalid_rows'] = 1
    else:
        profile['numeric_lexical_profile']['terra_lst_day_c']['forms'] = {'decimal_fractional': 1}
    with pytest.raises(verification.VerificationFailure, match=f'^{code}$'):
        verification.reconcile_version(sql_session, release.version.id, profile)
    assert release.version.validated_at is None


def test_clean_export_preserves_every_byte_decimal_lexeme_blank_and_header(sql_session, release):
    verification.validate_dataset(release.version.id, release.profile_file)
    manifest = verification.export_clean(release.version.id, release.output)
    assert release.output.read_bytes() == release.source_bytes
    assert release.source.read_bytes() == release.source_bytes
    with release.output.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        rows = list(reader)
        assert reader.fieldnames == release.headers
    assert len(release.headers) == manifest['column_count'] == 43
    assert rows == release.raw
    assert rows[1]['terra_night_qc'] == ''
    assert rows[0]['aqua_day_valid'] == '1.0'
    assert rows[0]['terra_lst_day_c'] == '28.170000000000000000001'
    assert Decimal(rows[0]['terra_lst_day_c']) != Decimal(str(release.observations[0].terra_lst_day_c))
    assert manifest['records'] == 2
    assert manifest['sha256'] == manifest['source_sha256'] == release.source_sha
    assert manifest['columns'] == release.headers
    assert manifest['file_name'] == release.output.name
    assert str(release.output.parent) not in json.dumps(manifest)
    assert json.loads(Path(str(release.output) + '.manifest.json').read_text()) == manifest
    assert not Path(str(release.output) + '.partial').exists()


def test_export_requires_a_certificate(sql_session, release):
    with pytest.raises(verification.VerificationFailure, match='^VERSION_NOT_CERTIFIED$'):
        verification.export_clean(release.version.id, release.output)
    assert not release.output.exists()


@pytest.mark.parametrize('existing', ['source', 'destination', 'partial', 'manifest'])
def test_export_never_overwrites_source_or_existing_artifacts(sql_session, release, existing):
    verification.validate_dataset(release.version.id, release.profile_file)
    target = release.source if existing == 'source' else release.output
    protected = {
        'source': release.source, 'destination': release.output,
        'partial': Path(str(release.output) + '.partial'),
        'manifest': Path(str(release.output) + '.manifest.json'),
    }[existing]
    if existing != 'source':
        protected.write_bytes(b'operator-owned artifact')
    before = protected.read_bytes()
    code = 'OUTPUT_MANIFEST_EXISTS' if existing == 'manifest' else 'OUTPUT_EXISTS_OR_IS_SOURCE'
    with pytest.raises(verification.VerificationFailure, match=f'^{code}$'):
        verification.export_clean(release.version.id, target)
    assert protected.read_bytes() == before


def test_source_mutation_after_certificate_refuses_export(sql_session, release):
    verification.validate_dataset(release.version.id, release.profile_file)
    release.source.write_bytes(release.source_bytes + b'\n')
    with pytest.raises(verification.VerificationFailure, match='^SOURCE_CHANGED_AFTER_VALIDATION$'):
        verification.export_clean(release.version.id, release.output)
    assert not release.output.exists()
    assert not Path(str(release.output) + '.partial').exists()


def test_sql_membership_change_after_certificate_refuses_export(sql_session, release):
    verification.validate_dataset(release.version.id, release.profile_file)
    sql_session.add(Observation(dataset_version_id=release.version.id,
                                cell_id=release.observations[0].cell_id,
                                observed_on=date(2021, 3, 1), source_row=3,
                                row_hash=uuid4().hex * 2, source_metadata={}))
    sql_session.flush()
    with pytest.raises(verification.VerificationFailure, match='^DATA_CHANGED_AFTER_VALIDATION$'):
        verification.export_clean(release.version.id, release.output)
    assert not release.output.exists()


def test_source_change_during_copy_does_not_publish_a_final_export(sql_session, release, monkeypatch):
    verification.validate_dataset(release.version.id, release.profile_file)
    original_copy = verification.shutil.copyfileobj

    def source_changes(original, clean, length):
        original_copy(original, clean, length)
        with release.source.open('ab') as source:
            source.write(b'\n')

    monkeypatch.setattr(verification.shutil, 'copyfileobj', source_changes)
    with pytest.raises(verification.VerificationFailure, match='^SOURCE_CHANGED_DURING_EXPORT$'):
        verification.export_clean(release.version.id, release.output)
    assert not release.output.exists()
    assert not Path(str(release.output) + '.manifest.json').exists()
    assert Path(str(release.output) + '.partial').exists()
