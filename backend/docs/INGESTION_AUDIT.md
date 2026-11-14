# Batch and quarantine audit contract

Migration `e3218df620ab` adds `import_batches`, `import_quarantine`, version
validation metadata, explicit job scope and a unique `(dataset_version_id,
source_row)` observation index. It retains all existing observations and job
history. Older observations have null `import_job_id` and `import_batch_id`;
those links are not guessed retroactively. Their source version, ordinal and raw
row hash still identify the immutable original CSV record.

Every new CSV or quarantine batch commits its validated observations, detailed
quarantine records, batch accounting, quality counters and checkpoint together.
The SQL constraint enforces:

`processed_rows = inserted_rows + duplicate_rows + rejected_rows`.

The same equation holds for cumulative job counters. Source-row bounds on a batch
are its minimum and maximum ordinal; scoped recovery selections can be sparse.
No transaction commits a checkpoint without its corresponding data and audit.

## Rejected records

`import_quarantine` retains every rejection, independently of the 1,000-message
diagnostic log cap. It records the original job and version, one-based CSV record
ordinal, a canonical SHA256 of the source dictionary, error code/field, original
raw strings, resolution state and optional successful recovery links.
Malformed extra CSV columns are retained through a structural wrapper containing
`__csv_fields__` and `__extra_columns__`; missing source values are not converted
to zero. The raw file remains unchanged.

The unique key `(job_id, source_row)` represents one rejection outcome for a source
record in that job. A later failed attempt has its own job and audit record.
Consequently, historical rejection counts across jobs must not be summed and
interpreted as unique source records. Dataset reconciliation uses unique source
ordinals and actual validated observations, together with unresolved/excluded
source outcomes.

Successful replay updates matching pending audit entries to `resolved` or
`duplicate`. The match includes dataset version, source ordinal and raw payload
hash. Resolved records are retained, along with the first successful recovery
job and observation link; they are never deleted or overwritten by another
successful retry. `duplicate` means the exact validated observation already
existed. A conflicting observation key remains a rejection.

## Targeted recovery

`retry_quarantine(job_id, source_job_id, max_rows=None)` accepts an already-created
target job. It captures a stable maximum quarantine ID for the source job and
replays that bounded snapshot in source-row order. It reads retained payloads,
not the entire source CSV. Raw payload hashes are checked before validation.
The snapshot includes already-resolved entries, making a repeated recovery
explicitly idempotent; those entries become exact duplicate outcomes.

The target job's `scope_json.kind` is `quarantine_replay` and names its source job,
selection policy and maximum quarantine ID. Its `total_rows` is the selected
record count. Its checkpoint is a source CSV ordinal, which may be much larger
than `processed_rows`; never divide that checkpoint by the scoped total to
calculate progress. `max_rows` counts selected records examined in that invocation.
Paused/failed recovery resumes using the same target/source job pair.

A completed scoped job does not establish complete dataset coverage. Consumers
must use independent version validation metadata (`validation_json` and
`validated_at`) and the exact source fingerprint. Inserting a new observation or
backfilling an unresolved rejection clears previous validation metadata so it
cannot silently describe an outdated row set.

## Historical backfill

`backfill_quarantine(job_id, records, batch_size=None)` is an internal operator
helper for older job history predating record-level quarantine. `records` must be
a trusted streaming iterator of `(source_row, raw_dict, error_code, error_field)`
read from the immutable configured CSV according to the documented historical
validation policy. It checks the full file SHA256 against the job's dataset
version before auditing; arbitrary HTTP payloads are not accepted by this helper.

Backfill is bounded and idempotent, checks source ordinals against the historical
checkpoint, rejects differing payloads at an existing audit key, and does not
change historical job counters or observations. Records whose validated source
ordinal already exists are marked resolved and linked to that observation. For
these legacy records, `resolved_at` is the time the backfill confirmed resolution;
the original insertion actor/time is not invented. New unresolved records remain
pending for targeted recovery.
