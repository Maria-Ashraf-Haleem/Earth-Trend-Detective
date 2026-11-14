"""Raw fusion records retain their source grain: one version/cell/eight-day date.

Wide nullable measurement columns avoid multiplying 7.3M source rows into >100M
EAV records. Indicator metadata defines units and temporal interpretation.
"""
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, BigInteger, CheckConstraint, Date, DateTime, Float,
                        ForeignKey, Index, String, UniqueConstraint)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Region(Base):
    __tablename__ = 'regions'
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(80), default='Egypt')
    description: Mapped[str] = mapped_column(String(1000))
    cells: Mapped[list['SpatialCell']] = relationship(back_populates='region')


class Location(Base):
    __tablename__ = 'locations'
    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[str] = mapped_column(ForeignKey('regions.id'), index=True)
    name: Mapped[str] = mapped_column(String(200))
    longitude: Mapped[float] = mapped_column(Float)
    latitude: Mapped[float] = mapped_column(Float)
    __table_args__ = (CheckConstraint('longitude BETWEEN -180 AND 180'),
                      CheckConstraint('latitude BETWEEN -90 AND 90'))


class SpatialCell(Base):
    __tablename__ = 'spatial_cells'
    id: Mapped[int] = mapped_column(primary_key=True)
    grid_id: Mapped[str] = mapped_column(String(160), unique=True)
    region_id: Mapped[str] = mapped_column(ForeignKey('regions.id'), index=True)
    longitude: Mapped[float] = mapped_column(Float)
    latitude: Mapped[float] = mapped_column(Float)
    region: Mapped[Region] = relationship(back_populates='cells')
    __table_args__ = (CheckConstraint('longitude BETWEEN -180 AND 180'),
                      CheckConstraint('latitude BETWEEN -90 AND 90'))


class DataSource(Base):
    __tablename__ = 'data_sources'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    documentation_url: Mapped[str | None] = mapped_column(String(500))


class Dataset(Base):
    __tablename__ = 'datasets'
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(250))
    description: Mapped[str] = mapped_column(String(2000))
    versions: Mapped[list['DatasetVersion']] = relationship(back_populates='dataset')


class DatasetVersion(Base):
    __tablename__ = 'dataset_versions'
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey('datasets.id'), index=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    source_size: Mapped[int] = mapped_column(BigInteger)
    audit_json: Mapped[dict] = mapped_column(JSON, default=dict)
    validation_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default='{}')
    validated_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    dataset: Mapped[Dataset] = relationship(back_populates='versions')


class Indicator(Base):
    __tablename__ = 'indicators'
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    source_id: Mapped[str] = mapped_column(ForeignKey('data_sources.id'))
    unit: Mapped[str] = mapped_column(String(40))
    temporal_support: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(String(1200))


MEASUREMENT_COLUMNS = (
    'terra_lst_day_c', 'terra_lst_night_c', 'aqua_lst_day_c', 'aqua_lst_night_c',
    'terra_ndvi_spatial_prev_month', 'terra_evi_spatial_prev_month',
    'aqua_ndvi_spatial_prev_month', 'aqua_evi_spatial_prev_month',
    'terra_monthly_day_spatial_prev_month', 'terra_monthly_night_spatial_prev_month',
    'aqua_monthly_day_spatial_prev_month', 'aqua_monthly_night_spatial_prev_month',
    'ghsl_2020_built_surface_m2_sum', 'ghsl_2020_valid_pixel_count',
)


class Observation(Base):
    __tablename__ = 'observations'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    dataset_version_id: Mapped[int] = mapped_column(ForeignKey('dataset_versions.id'))
    cell_id: Mapped[int] = mapped_column(ForeignKey('spatial_cells.id'))
    observed_on: Mapped[date] = mapped_column(Date)
    source_row: Mapped[int] = mapped_column(BigInteger)
    row_hash: Mapped[str] = mapped_column(String(64))
    source_metadata: Mapped[dict] = mapped_column(JSON)
    import_job_id: Mapped[str | None] = mapped_column(ForeignKey('import_jobs.id'))
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey('import_batches.id'))
    __table_args__ = (
        UniqueConstraint('dataset_version_id', 'observed_on', 'cell_id', name='uq_observation_grain'),
        Index('ix_observations_cell_date', 'cell_id', 'observed_on'),
        Index('uq_observation_version_source_row', 'dataset_version_id', 'source_row', unique=True),
        CheckConstraint('source_row > 0'),
    )


for _name in MEASUREMENT_COLUMNS:
    setattr(Observation, _name, mapped_column(Float, nullable=True))


class ImportJob(Base):
    __tablename__ = 'import_jobs'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_version_id: Mapped[int | None] = mapped_column(ForeignKey('dataset_versions.id'))
    status: Mapped[str] = mapped_column(String(20), default='queued', index=True)
    processed_rows: Mapped[int] = mapped_column(BigInteger, default=0)
    inserted_rows: Mapped[int] = mapped_column(BigInteger, default=0)
    duplicate_rows: Mapped[int] = mapped_column(BigInteger, default=0)
    rejected_rows: Mapped[int] = mapped_column(BigInteger, default=0)
    checkpoint_row: Mapped[int] = mapped_column(BigInteger, default=0)
    total_rows: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    error_code: Mapped[str | None] = mapped_column(String(80))
    scope_json: Mapped[dict] = mapped_column(JSON, default=lambda: {'kind': 'full_csv'},
                                           server_default='{"kind":"full_csv"}')
    __table_args__ = (CheckConstraint("status IN ('queued','running','paused','completed','failed')"),)


class ImportBatch(Base):
    __tablename__ = 'import_batches'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey('import_jobs.id'), index=True)
    batch_number: Mapped[int] = mapped_column()
    source_start_row: Mapped[int] = mapped_column(BigInteger)
    source_end_row: Mapped[int] = mapped_column(BigInteger)
    processed_rows: Mapped[int] = mapped_column(BigInteger)
    inserted_rows: Mapped[int] = mapped_column(BigInteger)
    duplicate_rows: Mapped[int] = mapped_column(BigInteger)
    rejected_rows: Mapped[int] = mapped_column(BigInteger)
    committed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    __table_args__ = (
        UniqueConstraint('job_id', 'batch_number', name='uq_import_batch_number'),
        CheckConstraint('processed_rows = inserted_rows + duplicate_rows + rejected_rows',
                        name='ck_import_batch_reconciled'),
        CheckConstraint('source_start_row > 0 AND source_end_row >= source_start_row'),
        CheckConstraint('inserted_rows >= 0 AND duplicate_rows >= 0 AND rejected_rows >= 0'),
    )


class ImportQuarantine(Base):
    __tablename__ = 'import_quarantine'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey('import_jobs.id'))
    dataset_version_id: Mapped[int] = mapped_column(ForeignKey('dataset_versions.id'))
    source_row: Mapped[int] = mapped_column(BigInteger)
    row_hash: Mapped[str] = mapped_column(String(64))
    error_code: Mapped[str] = mapped_column(String(80))
    error_field: Mapped[str] = mapped_column(String(160))
    raw_payload: Mapped[dict] = mapped_column(JSON)
    resolution: Mapped[str] = mapped_column(String(20), default='pending', server_default='pending')
    resolved_by_job_id: Mapped[str | None] = mapped_column(ForeignKey('import_jobs.id'))
    resolved_observation_id: Mapped[int | None] = mapped_column(ForeignKey('observations.id'))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    __table_args__ = (
        UniqueConstraint('job_id', 'source_row', name='uq_quarantine_job_source_row'),
        CheckConstraint("resolution IN ('pending','resolved','duplicate')", name='ck_quarantine_resolution'),
        CheckConstraint('source_row > 0'),
        Index('ix_quarantine_job_resolution_row', 'job_id', 'resolution', 'source_row'),
        Index('ix_quarantine_version_row', 'dataset_version_id', 'source_row'),
    )


class ImportLog(Base):
    __tablename__ = 'import_logs'
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey('import_jobs.id'), index=True)
    row_number: Mapped[int | None] = mapped_column(BigInteger)
    level: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class QualityReport(Base):
    __tablename__ = 'quality_reports'
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey('import_jobs.id'), index=True)
    report_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnalysisRun(Base):
    __tablename__ = 'analysis_runs'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(40))
    parameters: Mapped[dict] = mapped_column(JSON)
    dataset_version_id: Mapped[int | None] = mapped_column(ForeignKey('dataset_versions.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    status: Mapped[str] = mapped_column(String(30))


class TrendResult(Base):
    __tablename__ = 'trend_results'
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey('analysis_runs.id'), unique=True)
    result_json: Mapped[dict] = mapped_column(JSON)


class PeriodComparison(Base):
    __tablename__ = 'period_comparisons'
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey('analysis_runs.id'), unique=True)
    result_json: Mapped[dict] = mapped_column(JSON)


class EnvironmentalSummary(Base):
    __tablename__ = 'environmental_summaries'
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey('analysis_runs.id'), index=True)
    summary_json: Mapped[dict] = mapped_column(JSON)


class TourismObservation(Base):
    __tablename__ = 'tourism_observations'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    region_id: Mapped[str] = mapped_column(ForeignKey('regions.id'))
    source_id: Mapped[str] = mapped_column(ForeignKey('data_sources.id'))
    dataset_version_id: Mapped[int] = mapped_column(ForeignKey('dataset_versions.id'))
    observed_on: Mapped[date] = mapped_column(Date)
    occupancy_rate: Mapped[float | None] = mapped_column(Float)
    tourist_arrivals: Mapped[int | None] = mapped_column(BigInteger)
    hotel_capacity: Mapped[int | None] = mapped_column(BigInteger)
    seasonal_indicator: Mapped[str | None] = mapped_column(String(80))
    __table_args__ = (
        UniqueConstraint('region_id', 'dataset_version_id', 'observed_on'),
        CheckConstraint('occupancy_rate IS NULL OR occupancy_rate BETWEEN 0 AND 1'),
        CheckConstraint('tourist_arrivals IS NULL OR tourist_arrivals >= 0'),
        CheckConstraint('hotel_capacity IS NULL OR hotel_capacity >= 0'),
    )
