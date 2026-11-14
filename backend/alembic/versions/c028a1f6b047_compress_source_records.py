"""Compress large source records and ingestion indexes on SQL Server.

PAGE compression reduces repeated JSON keys and repeated nullable context. This
retains every value and does not change database recovery or durability settings.
"""
from alembic import op

revision = 'c028a1f6b047'
down_revision = '9381ba7a224e'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('ALTER TABLE observations REBUILD PARTITION = ALL WITH (DATA_COMPRESSION = PAGE)')
    op.execute('ALTER INDEX ALL ON observations REBUILD WITH (DATA_COMPRESSION = PAGE)')


def downgrade():
    raise RuntimeError('Destructive downgrades are intentionally disabled. Restore a backup instead.')
