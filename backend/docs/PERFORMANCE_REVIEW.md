# SQL Server read performance review

This review was performed while the full CSV import was running. It used code inspection, SQL compilation tests, and metadata-only SQL queries. No observation-table scans, index builds, isolation changes, or performance configuration changes were executed for this review. Suggested optimizations below are candidates for measurement after ingestion, not claimed measured improvements.

## Observed configuration and limits of the timing evidence

Metadata inspection of `earthtrend_db` confirmed:

- Clustered primary key on `observations.id`.
- Unique nonclustered observation-grain index on `(dataset_version_id, observed_on, cell_id)`.
- Nonclustered index on `(cell_id, observed_on)`.
- `READ_COMMITTED_SNAPSHOT` disabled and snapshot isolation `OFF`.

During partial ingestion, the main implementation run reported approximately 5.6 seconds for an indicator-filtered first observation page with only two returned rows, and approximately 2.4 seconds for a two-month NDVI analysis. These are concurrent-ingestion measurements, not completed-dataset benchmarks. They do not establish whether the dominant cost was blocking, I/O, sorting, aggregation, or another resource. Wait statistics and actual execution plans were not captured for those requests.

The database contains wide source-provenance JSON as well as numerical measurements. PAGE compression can reduce stored pages, but a query that needs a nonindexed measurement can still touch many wide clustered pages. More indexes also increase ingestion work and disk use; they should be selected from the measured workload. See [Microsoft's index design guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide?view=sql-server-ver17).

## Observation-list query

`GET /api/v1/observations` executes an exact filtered count followed by an ordered page query. A small page size limits returned rows; it does not limit the work of the exact count. When an indicator is supplied, both queries test that its measurement is nonnull. None of the current narrow indexes contains the numerical indicator value. SQL Server may need clustered-row lookups or a wider scan to determine that count.

The default sort is `(observed_on, id)`. The grain index orders equal dates by cell before the implicit clustered key, so it does not directly provide that exact ordering. A sort may be needed. Sorting by `cell_id` or `id` has different access requirements. Large OFFSET values add work because earlier qualifying rows still need to be located and skipped.

The page selects named identity, date, provenance, and measurement columns; it does not use `SELECT *`. Fetching provenance is appropriate for returned rows. Including that large JSON payload in another index would duplicate substantial storage and is not recommended merely to cover a small result page.

Candidates after measurement:

1. Use date bounds and a dataset version for interactive requests. This narrows the existing version/date key range and makes the response's scope explicit.
2. Observation year filtering now uses equivalent raw-date year bounds, as does the analytical repository. This avoids a year-only `DATEPART` predicate on the indexed date. A month-only filter still uses `DATEPART`; pair it with year/date bounds when narrowing an interactive request.
3. Add a narrow, workload-specific covering index for the most-used indicator and default ordering, after checking storage and actual plans. Keep JSON out of it. For example, if Terra daytime LST and Terra NDVI dominate the workload, a candidate is `(dataset_version_id, observed_on, id) INCLUDE (cell_id, terra_lst_day_c, terra_ndvi_spatial_prev_month)`. Other indicators are not covered by that example. Do not add one index per indicator without workload evidence.
4. Consider a separate cursor-paginated endpoint ordered by `(observed_on, id)` for deep navigation. Keep existing page-based contracts stable; specify null filtering and ascending/descending cursor behavior. Cursor pagination does not remove an exact-count scan if the same endpoint still promises that count.
5. If exact totals dominate latency, introduce an explicit contract for an optional count or a versioned precomputed count. Never substitute an approximate or cached total while labeling it an exact current filtered count.

Adding a covering index can help both the filtered count and row selection, but its actual benefit and storage cost have not been measured here. Filtered indexes may be useful for sparse indicators; Terra NDVI is dense in the supplied audit, so its `IS NOT NULL` predicate alone offers little selectivity.

## Monthly analytical query

The repository executes SQL aggregation and returns at most one row per selected source month. It never downloads the raw observations into Python. It first computes one mean per cell/source-month, then an equal-cell regional mean. Native eight-day acquisitions are averaged within a cell. Repeated previous-month context is collapsed at its source-month grain before regional or temporal analysis.

Date constraints are translated into predicates on the indexed raw `observed_on` column. For December monthly context, the query reads January attachment rows. This translation is necessary for both correctness and a bounded index range. The SQL Server date-expression constants are trusted SQL literals, not repeated bound positional parameters; actual SQL Server integration tests verify the resulting grouped query. Request values remain parameters.

For previous-month indicators, the query also aggregates minimum and maximum values for every cell/source-month. If nonmissing repeated context disagrees, the API returns HTTP 409 for a data quality review. All-null context is missing; a mixture of null and agreeing finite values is not a conflicting numerical value. Native eight-day values may vary within a month and do not trigger that context check.

The existing version/date index bounds the scan but does not contain indicator values. A suitable numerical covering index can reduce wide-row access. For repeated analysis across the full study period, the next structural option is a derived monthly-cell table keyed by dataset version, cell, source month, and indicator. It must retain valid/source counts and context-conflict checks, identify its aggregation version, preserve the raw table, and be regenerated idempotently. A regional summary alone cannot answer arbitrary cell or region filters. This derived table is a future optimization, not implemented infrastructure or a prediction model.

Monthly `missing_data_ratio` is the proportion of empty selected time slots. It does not count every missing raw source value. `observed_cells`, `contributing_cells`, and `source_rows` expose actual support, and partial-import warnings remain necessary. Performance tuning must preserve those meanings.

## Concurrent ingestion and consistency

The worker commits bounded batches with observations and progress in the same transaction. Under the inspected database's lock-based READ COMMITTED setting, readers and writers can block one another. That is a plausible contributor to concurrent-load latency, but it was not established as the cause of the reported timings. Dirty-read hints would weaken analytical correctness and must not be used to make these endpoints appear faster.

A database administrator can evaluate row-versioned READ COMMITTED after ingestion, with storage and operational effects understood. Changing the setting requires a maintenance plan and suitable connection state; this review does not execute it or terminate sessions. Row-versioned READ COMMITTED provides statement-level consistency, not automatically one shared snapshot for multiple statements. A count followed by a page, or two period aggregates, can still observe different committed progress while a dataset is being imported. See [Microsoft's locking and row-versioning guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-ver17).

The comparison route pins the second period to the dataset version selected by the first period. That prevents an unrequested version change between period queries. It does not freeze a partially imported version's contents. Reproducible final scientific analysis should use a completed, explicitly identified version and record its content fingerprint and analytical parameters.

The application pool is bounded. Slow queries also hold connections and can queue later requests. `SQL_TIMEOUT` currently configures connection establishment; it is not a separately implemented SQL statement-duration limit. Operational query deadlines, rate control, and external request limits can be added with measured workload requirements.

## Post-import validation sequence

1. Confirm the import is completed and record its dataset version, source SHA-256, observed row count, database size, available disk space, and server state.
2. Repeat the same bounded date/indicator queries without an active importer. Record first-request and repeated-request durations separately. Measure more than one sample before reporting a latency percentile.
3. Capture actual plans, logical reads, CPU time, elapsed time, and waits for the count and page statements separately. Also measure a short monthly window and the full study period. Use `SET STATISTICS IO, TIME ON` in a controlled SQL session and turn it off afterward; do not expose diagnostic plans through the public API.
4. Inspect statistics and parameter sensitivity before adding indexes. Query Store can retain plan and runtime history; check its actual configuration rather than assuming it is active. See [Microsoft's Query Store documentation](https://learn.microsoft.com/en-us/sql/relational-databases/performance/monitoring-performance-by-using-the-query-store?view=sql-server-ver17).
5. Implement one selected, additive optimization through a migration or an operational change with recorded prerequisites. Re-run the same queries and ingestion/resume tests, verify exact counts and numerical equivalence, and report the measured result and disk/write cost. Keep raw data, foreign keys, and the unique observation grain intact.

No index, isolation, derived-table, cache, or pagination improvement in this review should be represented as implemented or benchmarked until that sequence is performed.
