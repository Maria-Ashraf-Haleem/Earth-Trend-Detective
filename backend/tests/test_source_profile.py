"""Source validation resumes only against the same bytes and validator policy."""
import csv
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import profile_source as profiler
from app.services.ingestion.validation import (
    FLAG_FIELDS, REQUIRED_FIELDS, STATUS_FIELDS, VALIDATION_POLICY_VERSION,
)


@pytest.fixture
def source_profile(tmp_path, monkeypatch):
    source = tmp_path / 'source.csv'
    rows = []
    for index in range(3):
        raw = {field: '' for field in REQUIRED_FIELDS}
        raw.update(grid_id=f'profile-cell-{index}', longitude='33.8', latitude='27.2',
                   observation_date='2003-01-01', year='2003', month='1', day_of_year='1',
                   season_sin='0.017202', season_cos='0.999852', split='train')
        raw.update({field: '0' for field in FLAG_FIELDS})
        raw.update({field: 'NO_VALID_SOURCE_VALUE' for field in STATUS_FIELDS})
        rows.append(raw)
    with source.open('w', newline='', encoding='utf-8') as output:
        writer = csv.DictWriter(output, fieldnames=sorted(REQUIRED_FIELDS))
        writer.writeheader()
        writer.writerows(rows)
    monkeypatch.setattr(profiler, 'get_settings', lambda: SimpleNamespace(data_file_path=source))
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    baseline = profiler.profile(digest, 3)
    lexical = tmp_path / 'lexical.json'
    lexical.write_text(json.dumps(baseline), encoding='utf-8')
    return source, lexical, digest


def test_resume_preserves_verified_prefix_without_revalidating_it(source_profile, tmp_path, monkeypatch):
    _, lexical, digest = source_profile
    original = profiler.parse_row
    checked = []

    def tracked(raw):
        checked.append(raw['grid_id'])
        return original(raw)

    monkeypatch.setattr(profiler, 'parse_row', tracked)
    checkpoint = tmp_path / 'checkpoint.json'
    checkpoint.write_text(json.dumps({
        'source_sha256': digest, 'validation_policy': VALIDATION_POLICY_VERSION,
        'validator_sha256': hashlib.sha256(Path(tracked.__code__.co_filename).read_bytes()).hexdigest(),
        'validated_prefix': 1, 'invalid_rows': 0, 'error_counts': {}, 'first_errors': [], 'geo': None,
    }), encoding='utf-8')
    result = profiler.revalidate(lexical, digest, 3, checkpoint)
    assert result['status'] == 'passed'
    assert result['valid_rows'] == result['rows_seen'] == 3
    assert checked == ['profile-cell-1', 'profile-cell-2']
    assert result['unique_grid_ids'] == 3
    assert result['validation_resume']['previously_validated_prefix'] == 1


def test_transient_read_failure_reopens_same_source_and_keeps_exact_counters(source_profile, tmp_path, monkeypatch):
    source, lexical, digest = source_profile
    real_open = Path.open
    original = profiler.parse_row
    checked = []
    failed = False

    def tracked(raw):
        checked.append(raw['grid_id'])
        return original(raw)

    class FlakyReader:
        def __init__(self, stream):
            self.stream = stream
            self.calls = 0

        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.stream.close()

        def __iter__(self):
            return self

        def __next__(self):
            nonlocal failed
            self.calls += 1
            if self.calls == 4 and not failed:
                failed = True
                raise PermissionError(13, 'Injected transient source read failure')
            return next(self.stream)

    def opening(path, mode='r', *args, **kwargs):
        stream = real_open(path, mode, *args, **kwargs)
        return FlakyReader(stream) if path == source and mode == 'r' else stream

    monkeypatch.setattr(Path, 'open', opening)
    monkeypatch.setattr(profiler, 'parse_row', tracked)
    monkeypatch.setattr(profiler.time, 'sleep', lambda _: None)
    result = profiler.revalidate(lexical, digest, 3, tmp_path / 'checkpoint.json')
    assert result['status'] == 'passed'
    assert result['invalid_rows'] == 0
    assert checked == ['profile-cell-0', 'profile-cell-1', 'profile-cell-2']
    assert result['validation_resume']['read_errors'][0]['errno'] == 13


def test_changed_policy_cannot_reuse_a_verified_prefix(source_profile, tmp_path):
    _, lexical, digest = source_profile
    checkpoint = tmp_path / 'checkpoint.json'
    checkpoint.write_text(json.dumps({'source_sha256': digest, 'validation_policy': 'older-policy',
                                     'validator_sha256': 'wrong', 'validated_prefix': 1}), encoding='utf-8')
    with pytest.raises(RuntimeError, match='CHECKPOINT_IDENTITY_MISMATCH'):
        profiler.revalidate(lexical, digest, 3, checkpoint)


def test_lexical_precision_is_not_reformatted():
    assert profiler.lexical_shape('1.2300') == ('decimal_fractional', 5, 4, 4, 0)
    assert profiler.lexical_shape('65.0')[0] == 'decimal_integral'
    assert profiler.lexical_shape('1e-05') == ('scientific', 1, 0, 5, -5)
