"""user status: users.status, waitlisted or approved

Revision ID: 0010_user_status
Revises: 0009_feedback
Create Date: 2026-11-16 00:00:00

One additive value column, ``users.status`` ``TEXT NOT NULL`` with the constant
server default ``'approved'``: PostgreSQL stores a non-volatile ``ADD COLUMN``
default in the table's metadata and uses it for every existing row, so every account
made before this revision is ``approved`` at once and no data step is needed. A
self-hosted install, which never turns ``KB_SIGNUP_WAITLIST`` on, keeps signing up
``approved`` accounts through the same default.

The values are ``approved`` | ``waitlisted``, held app-side in
``server.accounts.types.USER_STATUSES`` with no DB ``CHECK`` (the ``tenants.plan``
precedent, 0008).

Downgrade drops the column (a waitlisted account then reads as an ordinary one).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_user_status"
down_revision: str | None = "0009_feedback"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Add ``users.status`` with the constant default ``'approved'``."""

    op.add_column(
        "users",
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'approved'")),
    )


def downgrade() -> None:
    """Drop ``users.status``."""

    op.drop_column("users", "status")
