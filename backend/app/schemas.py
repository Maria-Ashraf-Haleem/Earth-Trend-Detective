from datetime import date, datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Filters(BaseModel):
    region_id: str | None = None
    cell_id: int | None = Field(default=None, ge=1)
    indicator: str | None = Field(default=None, min_length=1)
    start_date: date | None = None
    end_date: date | None = None
    year: int | None = Field(default=None, ge=1900, le=2200)
    month: int | None = Field(default=None, ge=1, le=12)
    data_source: Literal['terra', 'aqua', 'ghsl'] | None = None
    dataset_version_id: int | None = Field(default=None, ge=1)
    allow_uncertified: bool = Field(default=False, description='Explicit, authenticated preview of a selected uncertified version.')
    west: float | None = Field(default=None, ge=-180, le=180)
    south: float | None = Field(default=None, ge=-90, le=90)
    east: float | None = Field(default=None, ge=-180, le=180)
    north: float | None = Field(default=None, ge=-90, le=90)

    @model_validator(mode='after')
    def date_order(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError('start_date must be on or before end_date')
        bounds = [self.west, self.south, self.east, self.north]
        if any(value is not None for value in bounds):
            if any(value is None for value in bounds):
                raise ValueError('Supply all four bounding-box coordinates')
            if self.west >= self.east or self.south >= self.north:
                raise ValueError('Bounding box must have increasing longitude and latitude bounds')
        return self


class TrendFilters(Filters):
    indicator: str = Field(min_length=1)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    resume_job_id: str | None = Field(default=None, min_length=36, max_length=36)
    retry_quarantine_job_id: str | None = Field(default=None, min_length=36, max_length=36)

    @model_validator(mode='after')
    def one_operation(self):
        if self.resume_job_id and self.retry_quarantine_job_id:
            raise ValueError('Resume and quarantine replay are mutually exclusive')
        return self


class ErrorResponse(BaseModel):
    code: str
    message: str
    status: int
    request_id: str | None = None


class ObservationRead(BaseModel):
    id: int
    cell_id: int
    dataset_version_id: int
    date: date
    values: dict[str, float | None]
    quality: dict[str, str | None]


class ObservationPage(BaseModel):
    items: list[ObservationRead]
    page: int
    page_size: int
    total: int
    availability: str
    dataset_version_id: int | None


# Responses describe the existing wire format. Extensible metadata is retained;
# these models do not remap source identifiers or manufacture unavailable data.
class PublicResponse(BaseModel):
    model_config = ConfigDict(extra='allow')


Availability = Literal['available', 'unavailable', 'insufficient_data']
ItemT = TypeVar('ItemT')


class Pagination(PublicResponse, Generic[ItemT]):
    items: list[ItemT]
    total: int
    page: int
    page_size: int


class HealthRead(PublicResponse):
    status: Literal['ok']
    service: str
    version: str


class DatabaseHealthRead(PublicResponse):
    status: Literal['ok']
    database: Literal['connected']


class ReadinessRead(PublicResponse):
    status: Literal['ready', 'not_ready']
    checks: dict[str, bool]
    dataset_version_id: int | None


class GeoBounds(PublicResponse):
    west: float
    south: float
    east: float
    north: float


class GeoPolygon(PublicResponse):
    type: Literal['Polygon']
    coordinates: list[list[tuple[float, float]]]


class RegionRead(PublicResponse):
    id: str
    name: str
    country: str
    description: str
    centroid: tuple[float, float] | None = Field(description='Latitude, longitude; null without cells.')
    bounds: GeoBounds | None
    boundary: GeoPolygon | None
    boundaryKind: str
    availability: Availability


class SpatialCellRead(PublicResponse):
    id: int
    grid_id: str
    longitude: float
    latitude: float
    region_id: str


class LocationRead(PublicResponse):
    id: int
    name: str
    region_id: str
    longitude: float
    latitude: float


class LocationPage(Pagination[LocationRead]):
    availability: Availability


class IndicatorRead(PublicResponse):
    id: str
    name: str
    unit: str
    data_source: str
    temporal_support: str
    description: str


class TemperatureVariableRead(PublicResponse):
    id: str
    name: str
    shortName: str
    unit: str
    datasetId: str
    observationWindow: Literal['daytime', 'nighttime']
    description: str
    scaleFactor: float
    nativeUnit: str
    temporalSupport: str


class StudyPeriod(PublicResponse):
    start: date | None
    end: date | None


class DatasetRead(PublicResponse):
    id: str
    name: str
    shortName: str
    provider: str
    version: str
    datasetVersionId: int | None
    importComplete: bool
    dataVerified: bool
    spatialResolution: str
    temporalResolution: str
    availableBands: list[str]
    studyPeriod: StudyPeriod | None
    documentationUrl: str
    notes: list[str]
    availability: Availability


class DatasetVersionRead(PublicResponse):
    id: int
    sha256: str
    source_size_bytes: int
    created_at: datetime
    provenance: dict[str, Any]
    validation: dict[str, Any]


class DatasetDetail(DatasetRead):
    versions: list[DatasetVersionRead]


class ImportJobRead(PublicResponse):
    id: str
    dataset_version_id: int | None
    status: Literal['queued', 'running', 'paused', 'completed', 'failed']
    processed_rows: int
    inserted_rows: int
    duplicate_rows: int
    rejected_rows: int
    checkpoint_row: int
    total_rows: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error_code: str | None
    scope: dict[str, Any]


class ImportBatchRead(PublicResponse):
    id: int
    job_id: str
    batch_number: int
    source_start_row: int
    source_end_row: int
    processed_rows: int
    inserted_rows: int
    duplicate_rows: int
    rejected_rows: int
    committed_at: datetime


class QuarantineRead(PublicResponse):
    id: int
    job_id: str
    dataset_version_id: int
    source_row: int
    row_hash: str
    error_code: str
    error_field: str
    resolution: Literal['pending', 'resolved', 'duplicate']
    resolved_by_job_id: str | None
    resolved_observation_id: int | None
    resolved_at: datetime | None
    created_at: datetime


class ImportLogRead(PublicResponse):
    row_number: int | None
    level: str
    code: str
    message: str


class ImportDetail(ImportJobRead):
    logs: list[ImportLogRead]


class ImportSubmission(PublicResponse):
    job: ImportJobRead
    execution: str


class QualityReportRead(PublicResponse):
    id: int
    job_id: str
    created_at: datetime
    report: dict[str, Any]


class VersionStatus(PublicResponse):
    dataset_version_id: int | None
    import_complete: bool
    warning: str | None
    data_verified: bool


class DashboardSummary(VersionStatus):
    observation_rows: int
    spatial_cells: int
    start_date: date | None
    end_date: date | None
    availability: Availability
    air_temperature: Literal['unavailable']
    tourism: Literal['unavailable']
    predictions: Literal['unavailable']


class EnvironmentalOverviewItem(PublicResponse):
    indicator: str
    mean_attached_source_value: float | None
    availability: Availability


class EnvironmentalOverview(VersionStatus):
    items: list[EnvironmentalOverviewItem]
    methodology: str


class CoverageItem(PublicResponse):
    indicator: str
    present_rows: int
    missing_rows: int
    present_ratio: float | None


class DataCoverage(VersionStatus):
    source_rows: int
    items: list[CoverageItem]
    denominator: str


class AggregateSummary(PublicResponse):
    observation_count: int
    total_slots: int
    missing_data_ratio: float | None
    start_date: date | None
    end_date: date | None
    mean: float | None


class MonthlyPoint(PublicResponse):
    date: date
    value: float | None
    observed_cells: int
    contributing_cells: int
    source_rows: int


class TrendRead(AggregateSummary, VersionStatus):
    availability: Availability
    unit: str
    absolute_change: float | None
    percentage_change: float | None
    slope_per_year: float | None
    p_value: float | None
    significant: bool | None
    confidence_interval: tuple[float, float] | None
    confidence_level: float
    alpha: float
    method: str
    methodology: str
    warnings: list[str]
    indicator: str
    series: list[MonthlyPoint]
    analysis_id: str = Field(description='Ephemeral computation ID; GET does not save analysis history.')


class ComparisonRead(VersionStatus):
    availability: Availability
    unit: str
    period_a: AggregateSummary
    period_b: AggregateSummary
    absolute_change: float | None
    percentage_change: float | None
    p_value: float | None
    significant: bool | None
    method: str
    methodology: str
    warnings: list[str]
    indicator: str
    analysis_id: str = Field(description='Ephemeral computation ID; GET does not save analysis history.')


# --- Optional model integration contract -------------------------------------
# No trained model exists yet. These schemas keep the future inference contract
# explicit so the observed-data API never has to guess or fabricate results.

ModelAvailability = Literal['not_configured', 'available', 'unreachable', 'not_implemented']


class ModelStatusRead(BaseModel):
    enabled: bool
    status: ModelAvailability
    provider: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    feature_version: str
    message: str = Field(description='Plain-language state; never implies a prediction exists.')


class ModelFeatureRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    region_id: str | None = Field(default=None, min_length=1, max_length=128)
    cell_id: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    source_split: Literal['train', 'validation', 'test', 'holdout'] | None = None

    @model_validator(mode='after')
    def date_order(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError('start_date must be on or before end_date')
        return self


class ModelPredictionRequest(ModelFeatureRequest):
    """One bounded inference request; validated before an adapter sees it."""


class ModelPredictionRead(BaseModel):
    request_id: str
    model_name: str
    model_version: str
    provider: str
    unit: str
    value: float
    confidence: float | None = Field(default=None, description='Present only when the model supplies it.')
    feature_version: str
    rows_used: int
    details: dict[str, Any] = Field(default_factory=dict)
    disclaimer: str = 'Model output for a configured provider; not an observed measurement.'
