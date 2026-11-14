"""Source-specific validation. No source values are imputed or silently corrected."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

VALIDATION_POLICY_VERSION = 'fusion-v2-nullable-sensor-qa-2026-11-13'

MEASUREMENT_FIELDS = (
    "terra_lst_day_c", "terra_lst_night_c", "aqua_lst_day_c", "aqua_lst_night_c",
    "terra_ndvi_spatial_prev_month", "terra_evi_spatial_prev_month",
    "aqua_ndvi_spatial_prev_month", "aqua_evi_spatial_prev_month",
    "terra_monthly_day_spatial_prev_month", "terra_monthly_night_spatial_prev_month",
    "aqua_monthly_day_spatial_prev_month", "aqua_monthly_night_spatial_prev_month",
    "ghsl_2020_built_surface_m2_sum", "ghsl_2020_valid_pixel_count",
)
FLAG_FIELDS = tuple(
    f"{sensor}_{period}_{suffix}"
    for sensor in ("terra", "aqua")
    for period in ("day", "night")
    for suffix in ("valid", "qa_accepted")
) + ("terra_night_qc_source_masked", "aqua_night_qc_source_masked")
STATUS_FIELDS = tuple(f"{s}_{p}_status" for s in ("terra", "aqua") for p in ("day", "night"))
DERIVED_FIELDS = (
    "season_sin", "season_cos", "terra_day_night_delta_c", "aqua_day_night_delta_c",
    "terra_aqua_day_difference_c",
)
QC_FIELDS = ("terra_night_qc", "aqua_night_qc")
REQUIRED_FIELDS = frozenset(
    ("grid_id", "longitude", "latitude", "observation_date", "year", "month", "day_of_year", "split")
    + MEASUREMENT_FIELDS + FLAG_FIELDS + STATUS_FIELDS + DERIVED_FIELDS + QC_FIELDS
)


class RowValidationError(ValueError):
    """A deliberately path-free, bounded error suitable for an import log."""

    def __init__(self, code: str, field: str):
        self.code = code
        self.field = field
        super().__init__(f"Invalid {field}: {code}")


@dataclass(frozen=True)
class ParsedRow:
    grid_id: str
    longitude: float
    latitude: float
    observed_on: date
    row_hash: str
    source_metadata: dict[str, str]
    measurements: dict[str, float | None]


def finite_number(value: str, field: str, *, nullable: bool = True) -> float | None:
    if value == "" and nullable:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise RowValidationError("not_numeric", field) from None
    if not math.isfinite(number):
        raise RowValidationError("not_finite", field)
    return number


def integer(value: str, field: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        # Nullable QC columns in later source exports use integral decimal
        # lexemes such as "0.0" and "65.0". Validate the exact decimal value;
        # never truncate fractional values or change the retained source string.
        try:
            decimal = Decimal(value)
        except (InvalidOperation, TypeError, ValueError):
            raise RowValidationError("not_integer", field) from None
        if not decimal.is_finite() or decimal != decimal.to_integral_value():
            raise RowValidationError("not_integer", field)
        # All source integers are calendar fields or QC bytes. Bound before int
        # conversion so a malformed huge exponent cannot allocate a huge integer.
        if decimal.copy_abs() > 2147483647:
            raise RowValidationError("out_of_bounds", field)
        number = int(decimal)
    return number


def boolean(value: str, field: str) -> bool:
    """Read numeric Boolean encodings without changing the original source text."""
    try:
        number = integer(value, field)
    except RowValidationError:
        raise RowValidationError('invalid_boolean', field) from None
    if number not in (0, 1):
        raise RowValidationError('invalid_boolean', field)
    return bool(number)


def parse_row(row: dict[str, str]) -> ParsedRow:
    if None in row or any(value is None for value in row.values()):
        raise RowValidationError("column_count", "row")
    missing = REQUIRED_FIELDS.difference(row)
    if missing:
        raise RowValidationError("missing_column", sorted(missing)[0])
    grid_id = row["grid_id"]
    if not grid_id or len(grid_id) > 160 or any(ord(char) < 32 for char in grid_id):
        raise RowValidationError("invalid_identifier", "grid_id")
    longitude = finite_number(row["longitude"], "longitude", nullable=False)
    latitude = finite_number(row["latitude"], "latitude", nullable=False)
    if not -180 <= longitude <= 180:
        raise RowValidationError("out_of_bounds", "longitude")
    if not -90 <= latitude <= 90:
        raise RowValidationError("out_of_bounds", "latitude")
    try:
        observed_on = date.fromisoformat(row["observation_date"])
    except ValueError:
        raise RowValidationError("invalid_date", "observation_date") from None
    if row["observation_date"] != observed_on.isoformat():
        raise RowValidationError("invalid_date", "observation_date")
    for field, expected in (
        ("year", observed_on.year), ("month", observed_on.month),
        ("day_of_year", observed_on.timetuple().tm_yday),
    ):
        if integer(row[field], field) != expected:
            raise RowValidationError("date_mismatch", field)
    # A documented missing Aqua acquisition has no LST, flags or status at all.
    # Unknown metadata is distinct from an explicit false flag. Permit this
    # coherent absent-retrieval state per period, without clearing independent
    # vegetation/monthly context attached to the same fusion record.
    absent = {
        (sensor, period): all(row[field] == '' for field in (
            f'{sensor}_lst_{period}_c', f'{sensor}_{period}_valid',
            f'{sensor}_{period}_qa_accepted', f'{sensor}_{period}_status'))
        for sensor in ('terra', 'aqua') for period in ('day', 'night')
    }
    flags = {}
    for field in FLAG_FIELDS:
        sensor, period = field.split('_')[:2]
        missing_allowed = absent[(sensor, period)]
        if field.endswith('qc_source_masked'):
            missing_allowed = missing_allowed and row[f'{sensor}_night_qc'] == ''
        flags[field] = None if row[field] == '' and missing_allowed else boolean(row[field], field)
    for field in STATUS_FIELDS:
        sensor, period = field.split('_')[:2]
        if (not row[field] and not absent[(sensor, period)]) or len(row[field]) > 100:
            raise RowValidationError("invalid_status", field)
    for field in QC_FIELDS:
        if row[field] != "" and not 0 <= integer(row[field], field) <= 255:
            raise RowValidationError("out_of_bounds", field)
    for field in DERIVED_FIELDS:
        finite_number(row[field], field)
    if row["split"] not in {"train", "validation", "test"}:
        raise RowValidationError("invalid_split", "split")
    values = {field: finite_number(row[field], field) for field in MEASUREMENT_FIELDS}
    for sensor in ("terra", "aqua"):
        for period in ("day", "night"):
            value = values[f"{sensor}_lst_{period}_c"]
            valid = flags[f"{sensor}_{period}_valid"]
            accepted = flags[f"{sensor}_{period}_qa_accepted"]
            if value is not None and not (valid and accepted):
                raise RowValidationError("measurement_flag_mismatch", f"{sensor}_{period}")
            if value is None and valid:
                raise RowValidationError("measurement_flag_mismatch", f"{sensor}_{period}")
        if flags[f"{sensor}_night_qc_source_masked"] and row[f"{sensor}_night_qc"] != "":
            raise RowValidationError("masked_qc_present", f"{sensor}_night_qc")
    for field, value in values.items():
        if value is None:
            continue
        if "ndvi" in field and not -1 <= value <= 1:
            raise RowValidationError("out_of_bounds", field)
        if field.startswith("ghsl_") and value < 0:
            raise RowValidationError("negative_value", field)
    pixels = values["ghsl_2020_valid_pixel_count"]
    if pixels is not None and not pixels.is_integer():
        raise RowValidationError("not_integer", "ghsl_2020_valid_pixel_count")
    if observed_on.year < 2021 and any(values[field] is not None for field in MEASUREMENT_FIELDS if field.startswith("ghsl_")):
        raise RowValidationError("snapshot_not_yet_available", "ghsl_2020")
    # Preserve nonmeasurement source strings (flags, QC, transforms and split).
    # Measurements remain unscaled FLOAT64 values; exact lexical originals stay
    # in the immutable, fingerprinted CSV at source_row. Avoid duplicating them
    # into multi-gigabyte JSON payloads.
    metadata = {
        field: value for field, value in row.items()
        if field not in {"grid_id", "longitude", "latitude", "observation_date", "year", "month", "day_of_year", *MEASUREMENT_FIELDS}
    }
    row_hash = hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    return ParsedRow(grid_id, longitude, latitude, observed_on, row_hash, metadata, values)
