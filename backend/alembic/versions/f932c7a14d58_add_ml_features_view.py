"""Add a versioned, read-only observed-feature interface for ML consumers.

This is a projection of validated observations, not a trained model or forecast.
The empty UNION ALL member prevents DML through the view without changing rows.
"""
from alembic import op

revision = 'f932c7a14d58'
down_revision = 'e3218df620ab'
branch_labels = None
depends_on = None


VIEW_SQL = r"""
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
FROM feature_rows WHERE 1 = 0;
"""


def upgrade():
    op.execute(VIEW_SQL)


def downgrade():
    raise RuntimeError('Destructive downgrades are intentionally disabled. Restore a backup instead.')
