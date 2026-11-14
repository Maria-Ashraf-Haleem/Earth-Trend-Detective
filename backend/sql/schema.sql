BEGIN TRANSACTION;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

GO

-- Running upgrade  -> 9381ba7a224e

CREATE TABLE data_sources (
    id VARCHAR(40) NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    documentation_url VARCHAR(500) NULL, 
    PRIMARY KEY (id)
);

GO

CREATE TABLE datasets (
    id VARCHAR(80) NOT NULL, 
    name VARCHAR(250) NOT NULL, 
    description VARCHAR(2000) NOT NULL, 
    PRIMARY KEY (id)
);

GO

CREATE TABLE regions (
    id VARCHAR(80) NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    country VARCHAR(80) NOT NULL, 
    description VARCHAR(1000) NOT NULL, 
    PRIMARY KEY (id)
);

GO

CREATE TABLE dataset_versions (
    id INTEGER NOT NULL IDENTITY, 
    dataset_id VARCHAR(80) NOT NULL, 
    sha256 VARCHAR(64) NOT NULL, 
    source_size BIGINT NOT NULL, 
    audit_json NVARCHAR(max) NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(dataset_id) REFERENCES datasets (id), 
    UNIQUE (sha256)
);

GO

CREATE INDEX ix_dataset_versions_dataset_id ON dataset_versions (dataset_id);

GO

CREATE TABLE indicators (
    id VARCHAR(80) NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    source_id VARCHAR(40) NOT NULL, 
    unit VARCHAR(40) NOT NULL, 
    temporal_support VARCHAR(40) NOT NULL, 
    description VARCHAR(1200) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(source_id) REFERENCES data_sources (id)
);

GO

CREATE TABLE locations (
    id INTEGER NOT NULL IDENTITY, 
    region_id VARCHAR(80) NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    longitude FLOAT NOT NULL, 
    latitude FLOAT NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (latitude BETWEEN -90 AND 90), 
    CHECK (longitude BETWEEN -180 AND 180), 
    FOREIGN KEY(region_id) REFERENCES regions (id)
);

GO

CREATE INDEX ix_locations_region_id ON locations (region_id);

GO

CREATE TABLE spatial_cells (
    id INTEGER NOT NULL IDENTITY, 
    grid_id VARCHAR(160) NOT NULL, 
    region_id VARCHAR(80) NOT NULL, 
    longitude FLOAT NOT NULL, 
    latitude FLOAT NOT NULL, 
    PRIMARY KEY (id), 
    CHECK (latitude BETWEEN -90 AND 90), 
    CHECK (longitude BETWEEN -180 AND 180), 
    FOREIGN KEY(region_id) REFERENCES regions (id), 
    UNIQUE (grid_id)
);

GO

CREATE INDEX ix_spatial_cells_region_id ON spatial_cells (region_id);

GO

CREATE TABLE analysis_runs (
    id VARCHAR(36) NOT NULL, 
    kind VARCHAR(40) NOT NULL, 
    parameters NVARCHAR(max) NOT NULL, 
    dataset_version_id INTEGER NULL, 
    created_at DATETIME NOT NULL, 
    status VARCHAR(30) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions (id)
);

GO

CREATE TABLE import_jobs (
    id VARCHAR(36) NOT NULL, 
    dataset_version_id INTEGER NULL, 
    status VARCHAR(20) NOT NULL, 
    processed_rows BIGINT NOT NULL, 
    inserted_rows BIGINT NOT NULL, 
    duplicate_rows BIGINT NOT NULL, 
    rejected_rows BIGINT NOT NULL, 
    checkpoint_row BIGINT NOT NULL, 
    total_rows BIGINT NULL, 
    created_at DATETIME NOT NULL, 
    started_at DATETIME NULL, 
    finished_at DATETIME NULL, 
    error_code VARCHAR(80) NULL, 
    PRIMARY KEY (id), 
    CHECK (status IN ('queued','running','paused','completed','failed')), 
    FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions (id)
);

GO

CREATE INDEX ix_import_jobs_status ON import_jobs (status);

GO

CREATE TABLE observations (
    id BIGINT NOT NULL IDENTITY, 
    dataset_version_id INTEGER NOT NULL, 
    cell_id INTEGER NOT NULL, 
    observed_on DATETIME NOT NULL, 
    source_row BIGINT NOT NULL, 
    row_hash VARCHAR(64) NOT NULL, 
    source_metadata NVARCHAR(max) NOT NULL, 
    terra_lst_day_c FLOAT NULL, 
    terra_lst_night_c FLOAT NULL, 
    aqua_lst_day_c FLOAT NULL, 
    aqua_lst_night_c FLOAT NULL, 
    terra_ndvi_spatial_prev_month FLOAT NULL, 
    terra_evi_spatial_prev_month FLOAT NULL, 
    aqua_ndvi_spatial_prev_month FLOAT NULL, 
    aqua_evi_spatial_prev_month FLOAT NULL, 
    terra_monthly_day_spatial_prev_month FLOAT NULL, 
    terra_monthly_night_spatial_prev_month FLOAT NULL, 
    aqua_monthly_day_spatial_prev_month FLOAT NULL, 
    aqua_monthly_night_spatial_prev_month FLOAT NULL, 
    ghsl_2020_built_surface_m2_sum FLOAT NULL, 
    ghsl_2020_valid_pixel_count FLOAT NULL, 
    PRIMARY KEY (id), 
    CHECK (source_row > 0), 
    FOREIGN KEY(cell_id) REFERENCES spatial_cells (id), 
    FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions (id), 
    CONSTRAINT uq_observation_grain UNIQUE (dataset_version_id, observed_on, cell_id)
);

GO

CREATE INDEX ix_observations_cell_date ON observations (cell_id, observed_on);

GO

CREATE TABLE tourism_observations (
    id BIGINT NOT NULL IDENTITY, 
    region_id VARCHAR(80) NOT NULL, 
    source_id VARCHAR(40) NOT NULL, 
    dataset_version_id INTEGER NOT NULL, 
    observed_on DATETIME NOT NULL, 
    occupancy_rate FLOAT NULL, 
    tourist_arrivals BIGINT NULL, 
    hotel_capacity BIGINT NULL, 
    seasonal_indicator VARCHAR(80) NULL, 
    PRIMARY KEY (id), 
    CHECK (hotel_capacity IS NULL OR hotel_capacity >= 0), 
    CHECK (occupancy_rate IS NULL OR occupancy_rate BETWEEN 0 AND 1), 
    CHECK (tourist_arrivals IS NULL OR tourist_arrivals >= 0), 
    FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions (id), 
    FOREIGN KEY(region_id) REFERENCES regions (id), 
    FOREIGN KEY(source_id) REFERENCES data_sources (id), 
    UNIQUE (region_id, dataset_version_id, observed_on)
);

GO

CREATE TABLE environmental_summaries (
    id INTEGER NOT NULL IDENTITY, 
    run_id VARCHAR(36) NOT NULL, 
    summary_json NVARCHAR(max) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(run_id) REFERENCES analysis_runs (id)
);

GO

CREATE INDEX ix_environmental_summaries_run_id ON environmental_summaries (run_id);

GO

CREATE TABLE import_logs (
    id INTEGER NOT NULL IDENTITY, 
    job_id VARCHAR(36) NOT NULL, 
    row_number BIGINT NULL, 
    level VARCHAR(20) NOT NULL, 
    code VARCHAR(80) NOT NULL, 
    message VARCHAR(500) NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(job_id) REFERENCES import_jobs (id)
);

GO

CREATE INDEX ix_import_logs_job_id ON import_logs (job_id);

GO

CREATE TABLE period_comparisons (
    id INTEGER NOT NULL IDENTITY, 
    run_id VARCHAR(36) NOT NULL, 
    result_json NVARCHAR(max) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(run_id) REFERENCES analysis_runs (id), 
    UNIQUE (run_id)
);

GO

CREATE TABLE quality_reports (
    id INTEGER NOT NULL IDENTITY, 
    job_id VARCHAR(36) NOT NULL, 
    report_json NVARCHAR(max) NOT NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(job_id) REFERENCES import_jobs (id)
);

GO

CREATE INDEX ix_quality_reports_job_id ON quality_reports (job_id);

GO

CREATE TABLE trend_results (
    id INTEGER NOT NULL IDENTITY, 
    run_id VARCHAR(36) NOT NULL, 
    result_json NVARCHAR(max) NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(run_id) REFERENCES analysis_runs (id), 
    UNIQUE (run_id)
);

GO

INSERT INTO alembic_version (version_num) OUTPUT inserted.version_num VALUES ('9381ba7a224e');

GO

-- Running upgrade 9381ba7a224e -> c028a1f6b047

ALTER TABLE observations REBUILD PARTITION = ALL WITH (DATA_COMPRESSION = PAGE);

GO

ALTER INDEX ALL ON observations REBUILD WITH (DATA_COMPRESSION = PAGE);

GO

UPDATE alembic_version SET version_num='c028a1f6b047' WHERE alembic_version.version_num = '9381ba7a224e';

GO

-- Running upgrade c028a1f6b047 -> e3218df620ab

ALTER TABLE dataset_versions ADD validation_json NVARCHAR(max) NOT NULL DEFAULT '{}';

GO

ALTER TABLE dataset_versions ADD validated_at DATETIME NULL;

GO

ALTER TABLE import_jobs ADD scope_json NVARCHAR(max) NOT NULL DEFAULT '{"kind":"full_csv"}';

GO

CREATE TABLE import_batches (
    id BIGINT NOT NULL IDENTITY, 
    job_id VARCHAR(36) NOT NULL, 
    batch_number INTEGER NOT NULL, 
    source_start_row BIGINT NOT NULL, 
    source_end_row BIGINT NOT NULL, 
    processed_rows BIGINT NOT NULL, 
    inserted_rows BIGINT NOT NULL, 
    duplicate_rows BIGINT NOT NULL, 
    rejected_rows BIGINT NOT NULL, 
    committed_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_import_batch_number UNIQUE (job_id, batch_number), 
    CONSTRAINT ck_import_batch_reconciled CHECK (processed_rows = inserted_rows + duplicate_rows + rejected_rows), 
    CHECK (source_start_row > 0 AND source_end_row >= source_start_row), 
    CHECK (inserted_rows >= 0 AND duplicate_rows >= 0 AND rejected_rows >= 0), 
    FOREIGN KEY(job_id) REFERENCES import_jobs (id)
);

GO

CREATE INDEX ix_import_batches_job_id ON import_batches (job_id);

GO

ALTER TABLE observations ADD import_job_id VARCHAR(36) NULL;

GO

ALTER TABLE observations ADD import_batch_id BIGINT NULL;

GO

ALTER TABLE observations ADD CONSTRAINT fk_observation_import_job FOREIGN KEY(import_job_id) REFERENCES import_jobs (id);

GO

ALTER TABLE observations ADD CONSTRAINT fk_observation_import_batch FOREIGN KEY(import_batch_id) REFERENCES import_batches (id);

GO

CREATE UNIQUE INDEX uq_observation_version_source_row ON observations (dataset_version_id, source_row) WITH (DATA_COMPRESSION = PAGE);

GO

CREATE TABLE import_quarantine (
    id BIGINT NOT NULL IDENTITY, 
    job_id VARCHAR(36) NOT NULL, 
    dataset_version_id INTEGER NOT NULL, 
    source_row BIGINT NOT NULL, 
    row_hash VARCHAR(64) NOT NULL, 
    error_code VARCHAR(80) NOT NULL, 
    error_field VARCHAR(160) NOT NULL, 
    raw_payload NVARCHAR(max) NOT NULL, 
    resolution VARCHAR(20) NOT NULL DEFAULT 'pending', 
    resolved_by_job_id VARCHAR(36) NULL, 
    resolved_observation_id BIGINT NULL, 
    resolved_at DATETIME NULL, 
    created_at DATETIME NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_quarantine_job_source_row UNIQUE (job_id, source_row), 
    CONSTRAINT ck_quarantine_resolution CHECK (resolution IN ('pending','resolved','duplicate')), 
    CHECK (source_row > 0), 
    FOREIGN KEY(job_id) REFERENCES import_jobs (id), 
    FOREIGN KEY(dataset_version_id) REFERENCES dataset_versions (id), 
    FOREIGN KEY(resolved_by_job_id) REFERENCES import_jobs (id), 
    FOREIGN KEY(resolved_observation_id) REFERENCES observations (id)
);

GO

CREATE INDEX ix_quarantine_job_resolution_row ON import_quarantine (job_id, resolution, source_row);

GO

CREATE INDEX ix_quarantine_version_row ON import_quarantine (dataset_version_id, source_row);

GO

ALTER TABLE import_quarantine REBUILD WITH (DATA_COMPRESSION = PAGE);

GO

UPDATE alembic_version SET version_num='e3218df620ab' WHERE alembic_version.version_num = 'c028a1f6b047';

GO

-- Running upgrade e3218df620ab -> f932c7a14d58

CREATE VIEW dbo.ml_features_v1 AS
WITH feature_rows AS (
    SELECT
        o.id,
        o.dataset_version_id,
        o.cell_id,
        c.grid_id,
        c.longitude,
        c.latitude,
        c.region_id,
        o.observed_on AS observation_date,
        DATEPART(year, o.observed_on) AS [year],
        DATEPART(month, o.observed_on) AS [month],
        DATEPART(dayofyear, o.observed_on) AS day_of_year,
        CONVERT(date, DATEADD(month, -1,
            DATEFROMPARTS(DATEPART(year, o.observed_on), DATEPART(month, o.observed_on), 1)))
            AS previous_month_reference,
        o.terra_lst_day_c,
        o.terra_lst_night_c,
        o.aqua_lst_day_c,
        o.aqua_lst_night_c,
        o.terra_ndvi_spatial_prev_month,
        o.terra_evi_spatial_prev_month,
        o.aqua_ndvi_spatial_prev_month,
        o.aqua_evi_spatial_prev_month,
        o.terra_monthly_day_spatial_prev_month,
        o.terra_monthly_night_spatial_prev_month,
        o.aqua_monthly_day_spatial_prev_month,
        o.aqua_monthly_night_spatial_prev_month,
        o.ghsl_2020_built_surface_m2_sum,
        o.ghsl_2020_valid_pixel_count,
        CASE WHEN q.terra_day_valid IN (0, 1) THEN CONVERT(tinyint, q.terra_day_valid) END AS terra_day_valid,
        CASE WHEN q.terra_night_valid IN (0, 1) THEN CONVERT(tinyint, q.terra_night_valid) END AS terra_night_valid,
        CASE WHEN q.aqua_day_valid IN (0, 1) THEN CONVERT(tinyint, q.aqua_day_valid) END AS aqua_day_valid,
        CASE WHEN q.aqua_night_valid IN (0, 1) THEN CONVERT(tinyint, q.aqua_night_valid) END AS aqua_night_valid,
        CASE WHEN q.terra_day_qa_accepted IN (0, 1) THEN CONVERT(tinyint, q.terra_day_qa_accepted) END AS terra_day_qa_accepted,
        CASE WHEN q.terra_night_qa_accepted IN (0, 1) THEN CONVERT(tinyint, q.terra_night_qa_accepted) END AS terra_night_qa_accepted,
        CASE WHEN q.aqua_day_qa_accepted IN (0, 1) THEN CONVERT(tinyint, q.aqua_day_qa_accepted) END AS aqua_day_qa_accepted,
        CASE WHEN q.aqua_night_qa_accepted IN (0, 1) THEN CONVERT(tinyint, q.aqua_night_qa_accepted) END AS aqua_night_qa_accepted,
        CASE WHEN q.terra_night_qc_source_masked IN (0, 1) THEN CONVERT(tinyint, q.terra_night_qc_source_masked) END AS terra_night_qc_source_masked,
        CASE WHEN q.aqua_night_qc_source_masked IN (0, 1) THEN CONVERT(tinyint, q.aqua_night_qc_source_masked) END AS aqua_night_qc_source_masked,
        CASE WHEN q.terra_night_qc BETWEEN 0 AND 255 AND q.terra_night_qc = FLOOR(q.terra_night_qc)
            THEN CONVERT(int, q.terra_night_qc) END AS terra_night_qc,
        CASE WHEN q.aqua_night_qc BETWEEN 0 AND 255 AND q.aqua_night_qc = FLOOR(q.aqua_night_qc)
            THEN CONVERT(int, q.aqua_night_qc) END AS aqua_night_qc,
        JSON_VALUE(o.source_metadata, '$.terra_day_status') AS terra_day_status,
        JSON_VALUE(o.source_metadata, '$.terra_night_status') AS terra_night_status,
        JSON_VALUE(o.source_metadata, '$.aqua_day_status') AS aqua_day_status,
        JSON_VALUE(o.source_metadata, '$.aqua_night_status') AS aqua_night_status,
        TRY_CONVERT(float, NULLIF(JSON_VALUE(o.source_metadata, '$.season_sin'), '')) AS season_sin,
        TRY_CONVERT(float, NULLIF(JSON_VALUE(o.source_metadata, '$.season_cos'), '')) AS season_cos,
        TRY_CONVERT(float, NULLIF(JSON_VALUE(o.source_metadata, '$.terra_day_night_delta_c'), '')) AS terra_day_night_delta_c,
        TRY_CONVERT(float, NULLIF(JSON_VALUE(o.source_metadata, '$.aqua_day_night_delta_c'), '')) AS aqua_day_night_delta_c,
        TRY_CONVERT(float, NULLIF(JSON_VALUE(o.source_metadata, '$.terra_aqua_day_difference_c'), '')) AS terra_aqua_day_difference_c,
        JSON_VALUE(o.source_metadata, '$.split') AS source_split,
        CASE WHEN o.ghsl_2020_built_surface_m2_sum IS NOT NULL OR o.ghsl_2020_valid_pixel_count IS NOT NULL
            THEN CONVERT(smallint, 2020) END AS ghsl_reference_year,
        o.source_row,
        o.row_hash
    FROM dbo.observations AS o
    INNER JOIN dbo.spatial_cells AS c ON c.id = o.cell_id
    CROSS APPLY (
        SELECT
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.terra_day_valid'))), '')) AS terra_day_valid,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.terra_night_valid'))), '')) AS terra_night_valid,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.aqua_day_valid'))), '')) AS aqua_day_valid,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.aqua_night_valid'))), '')) AS aqua_night_valid,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.terra_day_qa_accepted'))), '')) AS terra_day_qa_accepted,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.terra_night_qa_accepted'))), '')) AS terra_night_qa_accepted,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.aqua_day_qa_accepted'))), '')) AS aqua_day_qa_accepted,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.aqua_night_qa_accepted'))), '')) AS aqua_night_qa_accepted,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.terra_night_qc_source_masked'))), '')) AS terra_night_qc_source_masked,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.aqua_night_qc_source_masked'))), '')) AS aqua_night_qc_source_masked,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.terra_night_qc'))), '')) AS terra_night_qc,
            TRY_CONVERT(decimal(38, 18), NULLIF(LTRIM(RTRIM(JSON_VALUE(o.source_metadata, '$.aqua_night_qc'))), '')) AS aqua_night_qc
    ) AS q
)
SELECT
    id, dataset_version_id, cell_id, grid_id, longitude, latitude, region_id,
    observation_date, [year], [month], day_of_year, previous_month_reference,
    terra_lst_day_c, terra_lst_night_c, aqua_lst_day_c, aqua_lst_night_c,
    terra_ndvi_spatial_prev_month, terra_evi_spatial_prev_month,
    aqua_ndvi_spatial_prev_month, aqua_evi_spatial_prev_month,
    terra_monthly_day_spatial_prev_month, terra_monthly_night_spatial_prev_month,
    aqua_monthly_day_spatial_prev_month, aqua_monthly_night_spatial_prev_month,
    ghsl_2020_built_surface_m2_sum, ghsl_2020_valid_pixel_count,
    terra_day_valid, terra_night_valid, aqua_day_valid, aqua_night_valid,
    terra_day_qa_accepted, terra_night_qa_accepted, aqua_day_qa_accepted, aqua_night_qa_accepted,
    terra_night_qc_source_masked, aqua_night_qc_source_masked, terra_night_qc, aqua_night_qc,
    terra_day_status, terra_night_status, aqua_day_status, aqua_night_status,
    season_sin, season_cos, terra_day_night_delta_c, aqua_day_night_delta_c,
    terra_aqua_day_difference_c, source_split, ghsl_reference_year, source_row, row_hash
FROM feature_rows
UNION ALL
SELECT
    id, dataset_version_id, cell_id, grid_id, longitude, latitude, region_id,
    observation_date, [year], [month], day_of_year, previous_month_reference,
    terra_lst_day_c, terra_lst_night_c, aqua_lst_day_c, aqua_lst_night_c,
    terra_ndvi_spatial_prev_month, terra_evi_spatial_prev_month,
    aqua_ndvi_spatial_prev_month, aqua_evi_spatial_prev_month,
    terra_monthly_day_spatial_prev_month, terra_monthly_night_spatial_prev_month,
    aqua_monthly_day_spatial_prev_month, aqua_monthly_night_spatial_prev_month,
    ghsl_2020_built_surface_m2_sum, ghsl_2020_valid_pixel_count,
    terra_day_valid, terra_night_valid, aqua_day_valid, aqua_night_valid,
    terra_day_qa_accepted, terra_night_qa_accepted, aqua_day_qa_accepted, aqua_night_qa_accepted,
    terra_night_qc_source_masked, aqua_night_qc_source_masked, terra_night_qc, aqua_night_qc,
    terra_day_status, terra_night_status, aqua_day_status, aqua_night_status,
    season_sin, season_cos, terra_day_night_delta_c, aqua_day_night_delta_c,
    terra_aqua_day_difference_c, source_split, ghsl_reference_year, source_row, row_hash
FROM feature_rows WHERE 1 = 0;;

GO

UPDATE alembic_version SET version_num='f932c7a14d58' WHERE alembic_version.version_num = 'e3218df620ab';

GO

COMMIT;

GO

