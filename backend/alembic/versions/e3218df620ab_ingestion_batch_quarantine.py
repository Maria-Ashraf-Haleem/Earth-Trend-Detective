"""Add uncapped quarantine, atomic batch audit and version validation provenance."""
from alembic import op
import sqlalchemy as sa

revision = 'e3218df620ab'
down_revision = 'c028a1f6b047'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('dataset_versions', sa.Column('validation_json', sa.JSON(), nullable=False,
                                              server_default=sa.text("'{}'")))
    op.add_column('dataset_versions', sa.Column('validated_at', sa.DateTime(), nullable=True))
    op.add_column('import_jobs', sa.Column('scope_json', sa.JSON(), nullable=False,
                                         server_default=sa.text("'{\"kind\":\"full_csv\"}'")))
    op.create_table('import_batches',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('job_id', sa.String(36), sa.ForeignKey('import_jobs.id'), nullable=False),
        sa.Column('batch_number', sa.Integer(), nullable=False),
        sa.Column('source_start_row', sa.BigInteger(), nullable=False),
        sa.Column('source_end_row', sa.BigInteger(), nullable=False),
        sa.Column('processed_rows', sa.BigInteger(), nullable=False),
        sa.Column('inserted_rows', sa.BigInteger(), nullable=False),
        sa.Column('duplicate_rows', sa.BigInteger(), nullable=False),
        sa.Column('rejected_rows', sa.BigInteger(), nullable=False),
        sa.Column('committed_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('job_id', 'batch_number', name='uq_import_batch_number'),
        sa.CheckConstraint('processed_rows = inserted_rows + duplicate_rows + rejected_rows',
                           name='ck_import_batch_reconciled'),
        sa.CheckConstraint('source_start_row > 0 AND source_end_row >= source_start_row'),
        sa.CheckConstraint('inserted_rows >= 0 AND duplicate_rows >= 0 AND rejected_rows >= 0'),
    )
    op.create_index('ix_import_batches_job_id', 'import_batches', ['job_id'])
    op.add_column('observations', sa.Column('import_job_id', sa.String(36), nullable=True))
    op.add_column('observations', sa.Column('import_batch_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key('fk_observation_import_job', 'observations', 'import_jobs', ['import_job_id'], ['id'])
    op.create_foreign_key('fk_observation_import_batch', 'observations', 'import_batches', ['import_batch_id'], ['id'])
    # Additive provenance index: protects a source record from being assigned to
    # multiple validated observations and supports bounded source-order exports.
    op.execute('CREATE UNIQUE INDEX uq_observation_version_source_row ON observations '
               '(dataset_version_id, source_row) WITH (DATA_COMPRESSION = PAGE)')
    op.create_table('import_quarantine',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('job_id', sa.String(36), sa.ForeignKey('import_jobs.id'), nullable=False),
        sa.Column('dataset_version_id', sa.Integer(), sa.ForeignKey('dataset_versions.id'), nullable=False),
        sa.Column('source_row', sa.BigInteger(), nullable=False),
        sa.Column('row_hash', sa.String(64), nullable=False),
        sa.Column('error_code', sa.String(80), nullable=False),
        sa.Column('error_field', sa.String(160), nullable=False),
        sa.Column('raw_payload', sa.JSON(), nullable=False),
        sa.Column('resolution', sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('resolved_by_job_id', sa.String(36), sa.ForeignKey('import_jobs.id'), nullable=True),
        sa.Column('resolved_observation_id', sa.BigInteger(), sa.ForeignKey('observations.id'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('job_id', 'source_row', name='uq_quarantine_job_source_row'),
        sa.CheckConstraint("resolution IN ('pending','resolved','duplicate')", name='ck_quarantine_resolution'),
        sa.CheckConstraint('source_row > 0'),
    )
    op.create_index('ix_quarantine_job_resolution_row', 'import_quarantine', ['job_id', 'resolution', 'source_row'])
    op.create_index('ix_quarantine_version_row', 'import_quarantine', ['dataset_version_id', 'source_row'])
    op.execute('ALTER TABLE import_quarantine REBUILD WITH (DATA_COMPRESSION = PAGE)')


def downgrade():
    raise RuntimeError('Destructive downgrades are intentionally disabled. Restore a backup instead.')
