"""workspace store: a linked project's workspace as revisioned files

Revision ID: 0011_workspace_store
Revises: 0010_user_status
Create Date: 2026-11-18 00:00:00

Eight tables, every one cascading from ``projects``, that hold a project's
workflow workspace as the files its engine writes (``server.persistence.models``
explains each one):

* ``workspaces``: one row per linked project with its revision counter ``head``,
  the row a sync batch takes ``FOR UPDATE``.
* ``workspace_blobs``: content stored once per ``(project_id, sha256)``.
* ``workspace_files``: the head, one row per path (``rev``, ``sha256``, ``size``,
  ``kind`` file | append, ``deleted``, the content's blob, an append record's
  ``base_seq``), indexed on ``(project_id, rev)`` for ``manifest?since=``.
* ``workspace_revisions``: one row per applied op (who, when, which command; a
  move's ``from_path``).
* ``workspace_batches``: each batch's first answer by ``batch_id``.
* ``workspace_events``: the lines appended to append-only files, by a per-project
  ``seq``.
* ``workspace_derived``: the engine-rendered ``works/state.json`` and
  ``works/index.json``, latest only.
* ``workspace_inbox``: the web's agenda changes until an engine applies them.

No CHECK constraints: value checks are app-layer, the repo's convention.

Downgrade drops the eight tables (and every stored workspace with them).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_workspace_store"
down_revision: str | None = "0010_user_status"
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


def _project_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["project_id"],
        ["projects.id"],
        name=op.f(f"fk_{table}_project_id_projects"),
        ondelete="CASCADE",
    )


def _set_null_fk(table: str, column: str, target: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column],
        [f"{target}.id"],
        name=op.f(f"fk_{table}_{column}_{target}"),
        ondelete="SET NULL",
    )


def upgrade() -> None:
    """Create the eight workspace-store tables and their indexes."""

    op.create_table(
        "workspaces",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("head", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        _ts("linked_at"),
        _ts("last_sync_at", nullable=True),
        sa.Column("engine_version", sa.Text(), nullable=True),
        _ts("created_at"),
        sa.PrimaryKeyConstraint("project_id", name=op.f("pk_workspaces")),
        _project_fk("workspaces"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_workspaces_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "workspace_blobs",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        _ts("created_at"),
        sa.PrimaryKeyConstraint("project_id", "sha256", name=op.f("pk_workspace_blobs")),
        _project_fk("workspace_blobs"),
    )

    op.create_table(
        "workspace_files",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("rev", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("blob_sha256", sa.Text(), nullable=True),
        sa.Column("base_seq", sa.BigInteger(), nullable=True),
        _ts("updated_at"),
        sa.PrimaryKeyConstraint("project_id", "path", name=op.f("pk_workspace_files")),
        _project_fk("workspace_files"),
        sa.ForeignKeyConstraint(
            ["project_id", "blob_sha256"],
            ["workspace_blobs.project_id", "workspace_blobs.sha256"],
            name="fk_workspace_files_blob_workspace_blobs",
        ),
    )
    op.create_index(
        "ix_workspace_files_project_id_rev", "workspace_files", ["project_id", "rev"]
    )

    op.create_table(
        "workspace_revisions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("rev", sa.BigInteger(), nullable=False),
        sa.Column("op", sa.Text(), nullable=False),
        sa.Column("from_path", sa.Text(), nullable=True),
        sa.Column("sha256", sa.Text(), nullable=True),
        sa.Column("batch_id", sa.UUID(), nullable=True),
        sa.Column("credential_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("checkout", sa.Text(), nullable=True),
        sa.Column("command", sa.Text(), nullable=True),
        sa.Column("origin", sa.Text(), nullable=True),
        _ts("created_at"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspace_revisions")),
        _project_fk("workspace_revisions"),
        _set_null_fk("workspace_revisions", "credential_id", "project_credentials"),
        _set_null_fk("workspace_revisions", "user_id", "users"),
    )
    op.create_index(
        "ix_workspace_revisions_project_id_path", "workspace_revisions", ["project_id", "path"]
    )
    op.create_index(
        "ix_workspace_revisions_project_id_from_path",
        "workspace_revisions",
        ["project_id", "from_path"],
    )
    op.create_index(
        "ix_workspace_revisions_project_id_rev", "workspace_revisions", ["project_id", "rev"]
    )

    op.create_table(
        "workspace_batches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("head", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False),
        sa.Column("command", sa.Text(), nullable=True),
        sa.Column("checkout", sa.Text(), nullable=True),
        sa.Column("engine_version", sa.Text(), nullable=True),
        sa.Column("credential_id", sa.UUID(), nullable=True),
        sa.Column("response", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _ts("created_at"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspace_batches")),
        _project_fk("workspace_batches"),
        _set_null_fk("workspace_batches", "credential_id", "project_credentials"),
    )
    op.create_index(
        "ix_workspace_batches_project_id_created_at",
        "workspace_batches",
        ["project_id", "created_at"],
    )

    op.create_table(
        "workspace_events",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("seq", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("line", sa.Text(), nullable=False),
        sa.Column("batch_id", sa.UUID(), nullable=True),
        _ts("created_at"),
        sa.PrimaryKeyConstraint("project_id", "seq", name=op.f("pk_workspace_events")),
        _project_fk("workspace_events"),
    )
    op.create_index(
        "ix_workspace_events_project_id_path_seq",
        "workspace_events",
        ["project_id", "path", "seq"],
    )

    op.create_table(
        "workspace_derived",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("head", sa.BigInteger(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        _ts("updated_at"),
        sa.PrimaryKeyConstraint("project_id", "path", name=op.f("pk_workspace_derived")),
        _project_fk("workspace_derived"),
    )

    op.create_table(
        "workspace_inbox",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column(
            "items",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "fields",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("minted_id", sa.Text(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("state", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("batch_id", sa.UUID(), nullable=True),
        _ts("created_at"),
        _ts("resolved_at", nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspace_inbox")),
        _project_fk("workspace_inbox"),
        _set_null_fk("workspace_inbox", "user_id", "users"),
    )
    op.create_index(
        "ix_workspace_inbox_project_id_state_created_at",
        "workspace_inbox",
        ["project_id", "state", "created_at"],
    )


def downgrade() -> None:
    """Drop the eight tables (their indexes go with them)."""

    op.drop_table("workspace_inbox")
    op.drop_table("workspace_derived")
    op.drop_table("workspace_events")
    op.drop_table("workspace_batches")
    op.drop_table("workspace_revisions")
    op.drop_table("workspace_files")
    op.drop_table("workspace_blobs")
    op.drop_table("workspaces")
