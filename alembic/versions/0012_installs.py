"""sikstack installs: the pre-user row and its sign-ins

Revision ID: 0012_installs
Revises: 0011_workspace_store
Create Date: 2026-11-21 00:00:00

Two tables for the sikstack plugin (``server.installs_api``):

* ``installs``: one row per machine that ran ``/sikstack:setup``: the install id
  (unique), the setup email, the plugin version, when it was made and last seen,
  and, once a signed-in account approved one of its codes, that account
  (``claimed_by``, ``SET NULL`` when the account goes) and when.
* ``install_sign_ins``: one row per sign-in from an install: its short code
  (unique), the sha256 of the plugin's poll token (unique), the repo folder's name,
  the plugin version, ``state`` pending | approved | denied, the expiry, the last
  poll, who decided and when, the org and project an approval made, and when the
  plugin collected its key. Cascades from ``installs``.

No CHECK constraints: value checks are app-layer, the repo's convention.

Downgrade drops both tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012_installs"
down_revision: str | None = "0011_workspace_store"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _ts(name: str, nullable: bool = False) -> sa.Column:
    if nullable:
        return sa.Column(name, sa.DateTime(timezone=True), nullable=True)
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )


def _set_null_fk(table: str, column: str, target: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{target}.id"],
        name=op.f(f"fk_{table}_{column}_{target}"),
        ondelete="SET NULL",
    )


def upgrade() -> None:
    """Create ``installs`` and ``install_sign_ins``."""

    op.create_table(
        "installs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("install_id", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("plugin_version", sa.Text(), nullable=False),
        _ts("created_at"),
        _ts("last_seen_at"),
        sa.Column("claimed_by", sa.UUID(), nullable=True),
        _ts("claimed_at", nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_installs")),
        sa.UniqueConstraint("install_id", name=op.f("uq_installs_install_id")),
        _set_null_fk("installs", "claimed_by", "users"),
    )

    op.create_table(
        "install_sign_ins",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("install_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("poll_token_hash", sa.Text(), nullable=False),
        sa.Column("repo_name", sa.Text(), nullable=False),
        sa.Column("plugin_version", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        _ts("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        _ts("last_poll_at", nullable=True),
        sa.Column("decided_by", sa.UUID(), nullable=True),
        _ts("decided_at", nullable=True),
        sa.Column("tenant_id", sa.UUID(), nullable=True),
        sa.Column("project_id", sa.UUID(), nullable=True),
        _ts("delivered_at", nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_install_sign_ins")),
        sa.UniqueConstraint("code", name=op.f("uq_install_sign_ins_code")),
        sa.UniqueConstraint(
            "poll_token_hash", name=op.f("uq_install_sign_ins_poll_token_hash")
        ),
        sa.ForeignKeyConstraint(
            ["install_id"],
            ["installs.id"],
            name=op.f("fk_install_sign_ins_install_id_installs"),
            ondelete="CASCADE",
        ),
        _set_null_fk("install_sign_ins", "decided_by", "users"),
        _set_null_fk("install_sign_ins", "tenant_id", "tenants"),
        _set_null_fk("install_sign_ins", "project_id", "projects"),
    )
    op.create_index(
        "ix_install_sign_ins_install_id", "install_sign_ins", ["install_id"]
    )


def downgrade() -> None:
    """Drop ``install_sign_ins`` and ``installs``."""

    op.drop_index("ix_install_sign_ins_install_id", table_name="install_sign_ins")
    op.drop_table("install_sign_ins")
    op.drop_table("installs")
