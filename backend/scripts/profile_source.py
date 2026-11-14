"""Read-only full CSV validation and bounded lexical-precision profiling.

Run from backend: python scripts/profile_source.py --expected-sha256 HASH
Source paths come only from local configuration. Output contains no source paths.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import sys
import time

# Executing a script adds scripts/, rather than backend/, to Python's path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.services.ingestion.validation import (  # noqa: E402
    DERIVED_FIELDS, FLAG_FIELDS, MEASUREMENT_FIELDS, QC_FIELDS, REQUIRED_FIELDS,
    STATUS_FIELDS, VALIDATION_POLICY_VERSION, RowValidationError, parse_row,
)

NUMERIC_FIELDS = tuple(dict.fromkeys(
    ("longitude", "latitude", "year", "month", "day_of_year")
    + MEASUREMENT_FIELDS + DERIVED_FIELDS + FLAG_FIELDS + QC_FIELDS
))
NUMBER = re.compile(r"([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?\Z")
MAX_DISTINCT_SHAPES = 512
MAX_DISTINCT_GEOGRAPHIC_KEYS = 50000


@lru_cache(maxsize=65536)
def lexical_shape(raw):
    """Return lexical form, significant digits, fraction digits, scale, exponent.

    This never converts a measurement to float or rewrites its source string.
    Significant digits refer to the decimal coefficient; effective scale also
    accounts for a scientific-notation exponent. They are separate from SQL
    FLOAT's binary precision.
    """
    if raw is None:
        return ("missing_column", 0, 0, 0, None)
    if raw == "":
        return ("missing", 0, 0, 0, None)
    token = raw.strip()
    match = NUMBER.fullmatch(token)
    if match is None:
        return ("non_numeric", 0, 0, 0, None)
    integer = match.group(2) or ""
    fraction = match.group(3) if match.group(3) is not None else (match.group(4) or "")
    exponent_text = match.group(5)
    if exponent_text is not None and len(exponent_text.lstrip("+-0")) > 6:
        return ("oversized_exponent", len((integer + fraction).lstrip("0")) or 1,
                len(fraction), 0, None)
    exponent = int(exponent_text) if exponent_text is not None else 0
    if exponent_text is not None:
        form = "scientific"
    elif "." not in token:
        form = "integer"
    elif not fraction.strip("0"):
        form = "decimal_integral"
    else:
        form = "decimal_fractional"
    return (form, len((integer + fraction).lstrip("0")) or 1, len(fraction),
            max(len(fraction) - exponent, 0), exponent)


def fingerprint(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def profile(expected_sha256=None, expected_rows=None):
    path = get_settings().data_file_path
    before = path.stat()
    started = last_report = time.perf_counter()
    shapes = {field: Counter() for field in NUMERIC_FIELDS}
    examples = {field: {} for field in NUMERIC_FIELDS}
    labels = {field: Counter() for field in STATUS_FIELDS + ("split",)}
    errors = Counter()
    error_examples = []
    grids = set()
    grid_count_capped = False
    min_date = max_date = None
    bounds = {"longitude_min": None, "longitude_max": None, "latitude_min": None, "latitude_max": None}
    rows_seen = invalid_rows = 0
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, strict=True)
        if reader.fieldnames is None or len(reader.fieldnames) != len(REQUIRED_FIELDS) or set(reader.fieldnames) != REQUIRED_FIELDS:
            raise RuntimeError("SOURCE_SCHEMA_MISMATCH")
        headers = reader.fieldnames
        for number, row in enumerate(reader, start=1):
            rows_seen = number
            try:
                parsed = parse_row(row)
            except RowValidationError as error:
                invalid_rows += 1
                errors[f"{error.field}:{error.code}"] += 1
                if len(error_examples) < 50:
                    error_examples.append({"source_row": number, "field": error.field, "code": error.code})
            else:
                day = parsed.observed_on.isoformat()
                min_date = min(min_date or day, day)
                max_date = max(max_date or day, day)
                if len(grids) < MAX_DISTINCT_GEOGRAPHIC_KEYS:
                    grids.add(parsed.grid_id)
                elif parsed.grid_id not in grids:
                    grid_count_capped = True
                for axis, value in (("longitude", parsed.longitude), ("latitude", parsed.latitude)):
                    key_min, key_max = f"{axis}_min", f"{axis}_max"
                    bounds[key_min] = value if bounds[key_min] is None else min(bounds[key_min], value)
                    bounds[key_max] = value if bounds[key_max] is None else max(bounds[key_max], value)
            for field, counter in shapes.items():
                value = row.get(field)
                shape = lexical_shape(value)
                if shape in counter or len(counter) < MAX_DISTINCT_SHAPES:
                    counter[shape] += 1
                else:
                    counter[("additional_shapes", 0, 0, 0, None)] += 1
                if shape[0] not in {"non_numeric", "missing_column", "oversized_exponent"}:
                    examples[field].setdefault(shape[0], (value or "")[:80])
            for field, counter in labels.items():
                value = row.get(field, "")
                safe = value if re.fullmatch(r"[A-Za-z_]{1,100}", value) else "other_encoding"
                counter[safe] += 1
            now = time.perf_counter()
            if now - last_report >= 60:
                print(json.dumps({"event": "source_profile_progress", "rows_seen": rows_seen,
                                  "invalid_rows": invalid_rows,
                                  "elapsed_seconds": round(now-started, 1)}), flush=True)
                last_report = now
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError("SOURCE_CHANGED_DURING_PROFILE")
    hash_started = time.perf_counter()
    sha256 = fingerprint(path)
    final_stat = path.stat()
    if (before.st_size, before.st_mtime_ns) != (final_stat.st_size, final_stat.st_mtime_ns):
        raise RuntimeError("SOURCE_CHANGED_DURING_PROFILE")
    numeric_profile = {}
    for field, counter in shapes.items():
        forms = Counter()
        for shape, count in counter.items():
            forms[shape[0]] += count
        exponents = [shape[4] for shape in counter if shape[4] is not None]
        numeric_profile[field] = {
            "forms": dict(forms),
            "max_significant_decimal_digits": max((shape[1] for shape in counter), default=0),
            "max_lexical_fraction_digits": max((shape[2] for shape in counter), default=0),
            "max_effective_decimal_scale": max((shape[3] for shape in counter), default=0),
            "exponent_range": [min(exponents), max(exponents)] if exponents else None,
            "examples": examples[field],
            "shape_limit_reached": "additional_shapes" in forms,
        }
    matches_sha = sha256 == expected_sha256 if expected_sha256 is not None else None
    matches_rows = rows_seen == expected_rows if expected_rows is not None else None
    passed = invalid_rows == 0 and matches_sha is not False and matches_rows is not False
    return {
        "status": "passed" if passed else "failed",
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": {"file_name": path.name, "size_bytes": before.st_size, "sha256": sha256,
                   "unchanged_during_profile": True, "matches_registered_sha256": matches_sha},
        "headers": headers,
        "rows_seen": rows_seen, "valid_rows": rows_seen-invalid_rows, "invalid_rows": invalid_rows,
        "expected_rows": expected_rows, "matches_expected_rows": matches_rows,
        "validation_function": "app.services.ingestion.validation.parse_row",
        "validation_policy": VALIDATION_POLICY_VERSION,
        "error_counts": dict(errors), "first_errors": error_examples,
        "observed_period": {"start_date": min_date, "end_date": max_date},
        "unique_grid_ids": len(grids), "grid_count_capped": grid_count_capped,
        "coordinate_bounds": bounds,
        "numeric_lexical_profile": numeric_profile,
        "source_labels": {field: dict(counter) for field, counter in labels.items()},
        "methodology": {
            "scope": "Every CSV record was checked using the production row validator; no sample extrapolation.",
            "precision": "Decimal coefficient digit counts and lexical/effective decimal scales; source strings are never rewritten.",
            "memory": "One source row; 65,536-entry lexical LRU; at most 512 shapes per numeric field; geographic key set capped at 50,000.",
            "limits": "Type/source-flag/temporal/spatial validation does not constitute independent scientific validation or establish causal effects.",
        },
        "elapsed_seconds": round(time.perf_counter()-started, 2),
        "fingerprint_seconds": round(time.perf_counter()-hash_started, 2),
    }


def revalidate(lexical_profile_path, expected_sha256=None, expected_rows=None, checkpoint_path=None):
    """Repeat every-row validation while reusing exact same-byte lexical counts."""
    path = get_settings().data_file_path
    original_bytes = lexical_profile_path.read_bytes()
    previous = json.loads(original_bytes.decode("utf-8-sig"))
    before = path.stat()
    expected = previous["source"]["sha256"]
    initial_sha = fingerprint(path)
    if (initial_sha != expected or previous["source"]["size_bytes"] != before.st_size
            or (expected_sha256 is not None and initial_sha != expected_sha256)):
        raise RuntimeError("LEXICAL_PROFILE_SOURCE_MISMATCH")
    if set(previous.get("headers", [])) != REQUIRED_FIELDS:
        raise RuntimeError("LEXICAL_PROFILE_SCHEMA_MISMATCH")
    started = last_report = time.perf_counter()
    rows_seen = invalid_rows = 0
    errors = Counter()
    first_errors = []
    grids = set()
    grid_count_capped = False
    min_date = max_date = None
    bounds = {"longitude_min": None, "longitude_max": None, "latitude_min": None, "latitude_max": None}
    validator_file = Path(parse_row.__code__.co_filename)
    validator_sha = hashlib.sha256(validator_file.read_bytes()).hexdigest()
    geo_available = False
    read_errors = []
    checkpoint_evidence = None
    if checkpoint_path is not None and checkpoint_path.exists():
        state = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        if (state.get("source_sha256") != initial_sha
                or state.get("validation_policy") != VALIDATION_POLICY_VERSION
                or state.get("validator_sha256") != validator_sha):
            raise RuntimeError("VALIDATION_CHECKPOINT_IDENTITY_MISMATCH")
        rows_seen = state["validated_prefix"]
        invalid_rows = state["invalid_rows"]
        errors = Counter(state.get("error_counts", {}))
        first_errors = state.get("first_errors", [])
        if not 0 <= rows_seen <= previous["rows_seen"] or sum(errors.values()) != invalid_rows:
            raise RuntimeError("VALIDATION_CHECKPOINT_COUNTER_MISMATCH")
        checkpoint_evidence = state.get("evidence")
        read_errors = state.get("read_errors", [])
        geo = state.get("geo")
        if geo is not None:
            grids = set(geo["grid_ids"])
            grid_count_capped = geo["grid_count_capped"]
            min_date, max_date, bounds = geo["min_date"], geo["max_date"], geo["bounds"]
            geo_available = True
        elif invalid_rows:
            raise RuntimeError("VALIDATION_CHECKPOINT_GEO_REQUIRED")
    resume_prefix = rows_seen

    def collect_geo(grid_id, longitude, latitude, day):
        nonlocal grid_count_capped, min_date, max_date
        min_date = min(min_date or day, day)
        max_date = max(max_date or day, day)
        if len(grids) < MAX_DISTINCT_GEOGRAPHIC_KEYS:
            grids.add(grid_id)
        elif grid_id not in grids:
            grid_count_capped = True
        for axis, value in (("longitude", longitude), ("latitude", latitude)):
            key_min, key_max = f"{axis}_min", f"{axis}_max"
            bounds[key_min] = value if bounds[key_min] is None else min(bounds[key_min], value)
            bounds[key_max] = value if bounds[key_max] is None else max(bounds[key_max], value)

    def save_checkpoint():
        if checkpoint_path is None:
            return
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        state = {"source_sha256": initial_sha, "validation_policy": VALIDATION_POLICY_VERSION,
                 "validator_sha256": validator_sha, "validated_prefix": rows_seen,
                 "invalid_rows": invalid_rows, "error_counts": dict(errors),
                 "first_errors": first_errors, "evidence": checkpoint_evidence,
                 "read_errors": read_errors,
                 "geo": {"grid_ids": sorted(grids), "grid_count_capped": grid_count_capped,
                         "min_date": min_date, "max_date": max_date, "bounds": bounds}
                        if geo_available else None}
        temporary = checkpoint_path.with_suffix(checkpoint_path.suffix+".partial")
        temporary.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
        temporary.replace(checkpoint_path)

    print(json.dumps({"event": "validation_resume", "validated_prefix": resume_prefix,
                      "validation_policy": VALIDATION_POLICY_VERSION,
                      "source_sha256": initial_sha}), flush=True)
    attempts = 0
    while True:
        skip_to = rows_seen
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as source:
                reader = csv.DictReader(source, strict=True)
                if reader.fieldnames != previous["headers"]:
                    raise RuntimeError("LEXICAL_PROFILE_SCHEMA_MISMATCH")
                for number, raw in enumerate(reader, start=1):
                    if number <= skip_to:
                        if not geo_available:
                            # A conservative stdout-derived checkpoint has no
                            # cached grid set. Rebuild only summaries from the
                            # already validated, byte-identical prefix.
                            collect_geo(raw["grid_id"], float(raw["longitude"]),
                                        float(raw["latitude"]), raw["observation_date"])
                        if number == skip_to:
                            geo_available = True
                            save_checkpoint()
                        continue
                    geo_available = True
                    rows_seen = number
                    try:
                        parsed = parse_row(raw)
                    except RowValidationError as error:
                        invalid_rows += 1
                        errors[f"{error.field}:{error.code}"] += 1
                        if len(first_errors) < 50:
                            first_errors.append({"source_row": number, "field": error.field, "code": error.code})
                    else:
                        collect_geo(parsed.grid_id, parsed.longitude, parsed.latitude,
                                    parsed.observed_on.isoformat())
                    if rows_seen % 100000 == 0:
                        save_checkpoint()
                    now = time.perf_counter()
                    if now-last_report >= 60:
                        print(json.dumps({"event": "source_revalidation_progress", "rows_seen": rows_seen,
                                          "invalid_rows": invalid_rows,
                                          "elapsed_seconds": round(now-started, 1)}), flush=True)
                        last_report = now
            save_checkpoint()
            break
        except OSError as error:
            # No exception text/filename is emitted; it can contain local paths.
            if error.filename is not None and Path(error.filename) != path:
                raise
            attempts += 1
            event = {"exception_type": type(error).__name__, "errno": error.errno,
                     "winerror": getattr(error, "winerror", None), "validated_prefix": rows_seen}
            read_errors.append(event)
            save_checkpoint()
            print(json.dumps({"event": "source_read_retry", **event}), flush=True)
            if attempts > 3:
                raise RuntimeError("SOURCE_READ_RETRIES_EXHAUSTED") from None
            time.sleep(1)
            if (fingerprint(path) != initial_sha
                    or hashlib.sha256(validator_file.read_bytes()).hexdigest() != validator_sha):
                raise RuntimeError("VALIDATION_CHECKPOINT_IDENTITY_CHANGED") from None
    if rows_seen != previous["rows_seen"]:
        raise RuntimeError("LEXICAL_PROFILE_ROW_COUNT_MISMATCH")
    if (before.st_size, before.st_mtime_ns) != (path.stat().st_size, path.stat().st_mtime_ns):
        raise RuntimeError("SOURCE_CHANGED_DURING_PROFILE")
    final_sha = fingerprint(path)
    if final_sha != initial_sha:
        raise RuntimeError("SOURCE_CHANGED_DURING_PROFILE")
    if hashlib.sha256(validator_file.read_bytes()).hexdigest() != validator_sha:
        raise RuntimeError("VALIDATOR_CHANGED_DURING_PROFILE")
    previous_validation = {
        "report_file": lexical_profile_path.name,
        "report_sha256": hashlib.sha256(original_bytes).hexdigest(),
        "status": previous["status"], "rows_seen": previous["rows_seen"],
        "invalid_rows": previous["invalid_rows"], "error_counts": previous["error_counts"],
        "recorded_at_utc": previous["recorded_at_utc"],
    }
    matches_rows = rows_seen == expected_rows if expected_rows is not None else None
    previous.update({
        "status": "passed" if invalid_rows == 0 and matches_rows is not False else "failed",
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": {"file_name": path.name, "size_bytes": before.st_size, "sha256": final_sha,
                   "unchanged_during_profile": True, "matches_registered_sha256":
                       final_sha == expected_sha256 if expected_sha256 is not None else None},
        "rows_seen": rows_seen, "valid_rows": rows_seen-invalid_rows, "invalid_rows": invalid_rows,
        "expected_rows": expected_rows, "matches_expected_rows": matches_rows,
        "validation_policy": VALIDATION_POLICY_VERSION,
        "error_counts": dict(errors), "first_errors": first_errors,
        "observed_period": {"start_date": min_date, "end_date": max_date},
        "unique_grid_ids": len(grids), "grid_count_capped": grid_count_capped,
        "coordinate_bounds": bounds, "elapsed_seconds": round(time.perf_counter()-started, 2),
        "previous_full_validation": previous_validation,
        "validator_source_sha256": validator_sha,
        "validation_resume": {"previously_validated_prefix": resume_prefix,
                              "validated_in_this_execution": rows_seen-resume_prefix,
                              "read_errors": read_errors,
                              "prefix_evidence": checkpoint_evidence},
    })
    previous["methodology"].update({
        "lexical_counts_reused": True,
        "lexical_source_sha256": initial_sha,
        "lexical_profile_report_sha256": previous_validation["report_sha256"],
        "validation_scope": "Every source record was checked using the current production validator, including any policy/code/SHA-pinned resumed prefix; no sample extrapolation.",
        "lexical_scope": "All earlier lexical counts include every source row, including rows rejected by the previous policy. Full fingerprints before and after revalidation prove identical input bytes.",
    })
    return previous


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--expected-rows", type=int)
    parser.add_argument("--output", type=Path, default=Path("docs/SOURCE_PROFILE.json"))
    parser.add_argument("--reuse-lexical-profile", type=Path)
    parser.add_argument("--resume-checkpoint", type=Path)
    args = parser.parse_args()
    result = (revalidate(args.reuse_lexical_profile, args.expected_sha256, args.expected_rows, args.resume_checkpoint)
              if args.reuse_lexical_profile else profile(args.expected_sha256, args.expected_rows))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"event": "source_profile_finished", "status": result["status"],
                      "rows_seen": result["rows_seen"], "invalid_rows": result["invalid_rows"],
                      "elapsed_seconds": result["elapsed_seconds"],
                      "sha256": result["source"]["sha256"]}), flush=True)
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
