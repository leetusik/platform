"""Persistence repository for the workspace store.

The sole ORM boundary for the workspace domain. It never commits: the service owns
the transaction, and every write here runs inside the service's batch transaction,
after it took the project's ``workspaces`` row with :meth:`lock_workspace`; the one
exception is :meth:`touch_last_sync`, a single guarded ``UPDATE`` of that row. Every
query is scoped by ``project_id``; the caller (the workspace API, behind
``resolve_api_workspace``) has already proved the project is the key's own.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from server.persistence.models import (
    WorkspaceBatchModel,
    WorkspaceBlobModel,
    WorkspaceDerivedModel,
    WorkspaceEventModel,
    WorkspaceFileModel,
    WorkspaceInboxModel,
    WorkspaceModel,
    WorkspaceRevisionModel,
)
from server.workspace.types import (
    INBOX_PENDING,
    FileContent,
    ManifestEntry,
    RevisionRecord,
    WorkingRecord,
)


class WorkspaceRepository:
    """Repository for the workspace store's rows."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # -- the workspace row and its lock -----------------------------------------

    async def ensure_workspace(self, project_id: UUID, tenant_id: UUID) -> None:
        """Create the project's ``workspaces`` row if it has none (head 0)."""

        stmt = (
            pg_insert(WorkspaceModel)
            .values(project_id=project_id, tenant_id=tenant_id, head=0)
            .on_conflict_do_nothing(index_elements=[WorkspaceModel.project_id])
        )
        await self._session.execute(stmt)

    async def lock_workspace(self, project_id: UUID) -> int:
        """Take the project's ``workspaces`` row ``FOR UPDATE`` and return its head.

        A second batch for the same project waits here until the first commits or
        rolls back; under READ COMMITTED its later statements then read the first
        batch's committed rows, so its ``base_rev`` checks see the new revisions.
        """

        result = await self._session.execute(
            select(WorkspaceModel.head)
            .where(WorkspaceModel.project_id == project_id)
            .with_for_update()
        )
        return int(result.scalar_one())

    async def get_head(self, project_id: UUID) -> int:
        result = await self._session.execute(
            select(WorkspaceModel.head).where(WorkspaceModel.project_id == project_id)
        )
        head = result.scalar_one_or_none()
        return int(head) if head is not None else 0

    async def get_workspace(self, project_id: UUID) -> WorkspaceModel | None:
        """The project's ``workspaces`` row, or ``None`` when the project is not linked."""

        result = await self._session.execute(
            select(WorkspaceModel).where(WorkspaceModel.project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def touch_last_sync(
        self, project_id: UUID, *, base: int, at: datetime, every: timedelta
    ) -> bool:
        """Move ``last_sync_at`` to ``at`` for a head probe that is up to date.

        Only when the probe's ``base`` is the head, the project has synced at least
        once (head above 0), and the last move is older than ``every`` (the throttle).
        Returns whether the row moved.
        """

        result = await self._session.execute(
            update(WorkspaceModel)
            .where(
                WorkspaceModel.project_id == project_id,
                WorkspaceModel.head == base,
                WorkspaceModel.head > 0,
                or_(
                    WorkspaceModel.last_sync_at.is_(None),
                    WorkspaceModel.last_sync_at <= at - every,
                ),
            )
            .values(last_sync_at=at)
        )
        return bool(result.rowcount)

    async def live_records(self, project_id: UUID) -> dict[str, WorkingRecord]:
        """Every live (not deleted) record of the project's head, keyed by path."""

        result = await self._session.execute(
            select(WorkspaceFileModel).where(
                WorkspaceFileModel.project_id == project_id,
                WorkspaceFileModel.deleted.is_(False),
            )
        )
        return {
            row.path: WorkingRecord(
                path=row.path,
                rev=int(row.rev),
                sha256=row.sha256,
                size=int(row.size),
                kind=row.kind,
                deleted=False,
                blob_sha256=row.blob_sha256,
                base_seq=int(row.base_seq) if row.base_seq is not None else None,
            )
            for row in result.scalars()
        }

    async def set_landed(
        self,
        project_id: UUID,
        *,
        head: int,
        at: datetime,
        engine_version: str | None,
    ) -> None:
        values: dict[str, Any] = {"head": head, "last_sync_at": at}
        if engine_version:
            values["engine_version"] = engine_version
        await self._session.execute(
            update(WorkspaceModel).where(WorkspaceModel.project_id == project_id).values(**values)
        )

    # -- batches ------------------------------------------------------------------

    async def get_batch(self, batch_id: UUID) -> WorkspaceBatchModel | None:
        result = await self._session.execute(
            select(WorkspaceBatchModel).where(WorkspaceBatchModel.id == batch_id)
        )
        return result.scalar_one_or_none()

    async def insert_batch(
        self,
        *,
        batch_id: UUID,
        project_id: UUID,
        head: int,
        status: int,
        response: dict[str, Any],
        command: str | None,
        checkout: str | None,
        engine_version: str | None,
        credential_id: UUID | None,
    ) -> None:
        self._session.add(
            WorkspaceBatchModel(
                id=batch_id,
                project_id=project_id,
                head=head,
                status=status,
                response=response,
                command=command,
                checkout=checkout,
                engine_version=engine_version,
                credential_id=credential_id,
            )
        )
        await self._session.flush()

    # -- records ------------------------------------------------------------------

    async def load_records(
        self, project_id: UUID, paths: Collection[str]
    ) -> dict[str, WorkingRecord]:
        """The stored records at ``paths`` (deleted ones included), keyed by path."""

        if not paths:
            return {}
        result = await self._session.execute(
            select(WorkspaceFileModel).where(
                WorkspaceFileModel.project_id == project_id,
                WorkspaceFileModel.path.in_(list(paths)),
            )
        )
        return {
            row.path: WorkingRecord(
                path=row.path,
                rev=int(row.rev),
                sha256=row.sha256,
                size=int(row.size),
                kind=row.kind,
                deleted=bool(row.deleted),
                blob_sha256=row.blob_sha256,
                base_seq=int(row.base_seq) if row.base_seq is not None else None,
            )
            for row in result.scalars()
        }

    async def upsert_records(
        self, project_id: UUID, records: Iterable[WorkingRecord], at: datetime
    ) -> None:
        rows = [
            {
                "project_id": project_id,
                "path": rec.path,
                "rev": rec.rev,
                "sha256": rec.sha256,
                "size": rec.size,
                "kind": rec.kind,
                "deleted": rec.deleted,
                "blob_sha256": rec.blob_sha256,
                "base_seq": rec.base_seq,
                "updated_at": at,
            }
            for rec in records
        ]
        if not rows:
            return
        stmt = pg_insert(WorkspaceFileModel)
        stmt = stmt.on_conflict_do_update(
            index_elements=[WorkspaceFileModel.project_id, WorkspaceFileModel.path],
            set_={
                name: stmt.excluded[name]
                for name in (
                    "rev", "sha256", "size", "kind", "deleted", "blob_sha256",
                    "base_seq", "updated_at",
                )
            },
        )
        await self._session.execute(stmt, rows)

    async def manifest(self, project_id: UUID, since: int) -> list[ManifestEntry]:
        result = await self._session.execute(
            select(WorkspaceFileModel)
            .where(WorkspaceFileModel.project_id == project_id, WorkspaceFileModel.rev > since)
            .order_by(WorkspaceFileModel.path)
        )
        return [
            ManifestEntry(
                path=row.path,
                rev=int(row.rev),
                sha256=row.sha256,
                size=int(row.size),
                deleted=bool(row.deleted),
                kind=row.kind,
            )
            for row in result.scalars()
        ]

    # -- blobs --------------------------------------------------------------------

    async def insert_blobs(self, project_id: UUID, blobs: dict[str, bytes]) -> None:
        """Store each content once per ``(project, sha256)``; a known sha is skipped."""

        if not blobs:
            return
        stmt = pg_insert(WorkspaceBlobModel).on_conflict_do_nothing(
            index_elements=[WorkspaceBlobModel.project_id, WorkspaceBlobModel.sha256]
        )
        await self._session.execute(
            stmt,
            [
                {"project_id": project_id, "sha256": sha, "size": len(data), "content": data}
                for sha, data in blobs.items()
            ],
        )

    async def get_blobs(self, project_id: UUID, shas: Collection[str]) -> dict[str, bytes]:
        if not shas:
            return {}
        result = await self._session.execute(
            select(WorkspaceBlobModel.sha256, WorkspaceBlobModel.content).where(
                WorkspaceBlobModel.project_id == project_id,
                WorkspaceBlobModel.sha256.in_(list(shas)),
            )
        )
        return {sha: bytes(content) for sha, content in result.all()}

    # -- append-only lines ----------------------------------------------------------

    async def max_seq(self, project_id: UUID) -> int:
        result = await self._session.execute(
            select(func.coalesce(func.max(WorkspaceEventModel.seq), 0)).where(
                WorkspaceEventModel.project_id == project_id
            )
        )
        return int(result.scalar_one())

    async def lines_after(self, project_id: UUID, path: str, after_seq: int) -> list[str]:
        result = await self._session.execute(
            select(WorkspaceEventModel.line)
            .where(
                WorkspaceEventModel.project_id == project_id,
                WorkspaceEventModel.path == path,
                WorkspaceEventModel.seq > after_seq,
            )
            .order_by(WorkspaceEventModel.seq)
        )
        return list(result.scalars())

    async def insert_events(self, rows: Sequence[dict[str, Any]]) -> None:
        if rows:
            await self._session.execute(pg_insert(WorkspaceEventModel), list(rows))

    async def record_content(self, project_id: UUID, rec: WorkingRecord) -> bytes:
        """A stored record's full content: its blob, then (append) its lines."""

        base = b""
        if rec.blob_sha256 is not None:
            base = (await self.get_blobs(project_id, [rec.blob_sha256]))[rec.blob_sha256]
        if rec.kind != "append":
            return base
        lines = await self.lines_after(project_id, rec.path, rec.base_seq or 0)
        return base + "".join(line + "\n" for line in lines).encode("utf-8")

    async def contents(
        self, project_id: UUID, records: Sequence[WorkingRecord]
    ) -> list[FileContent]:
        """The contents of ``records``, file blobs read in one query."""

        blobs = await self.get_blobs(
            project_id,
            {rec.blob_sha256 for rec in records if rec.kind != "append" and rec.blob_sha256},
        )
        files: list[FileContent] = []
        for rec in records:
            if rec.kind == "append":
                content = await self.record_content(project_id, rec)
            else:
                content = blobs.get(rec.blob_sha256 or "", b"")
            files.append(
                FileContent(
                    path=rec.path, rev=rec.rev, sha256=rec.sha256, kind=rec.kind, content=content
                )
            )
        return files

    # -- revisions ------------------------------------------------------------------

    async def insert_revisions(self, rows: Sequence[dict[str, Any]]) -> None:
        if rows:
            await self._session.execute(pg_insert(WorkspaceRevisionModel), list(rows))

    async def last_revision(self, project_id: UUID, path: str) -> RevisionRecord | None:
        """The newest revision that changed ``path`` (a move away from it included)."""

        result = await self._session.execute(
            select(WorkspaceRevisionModel)
            .where(
                WorkspaceRevisionModel.project_id == project_id,
                or_(
                    WorkspaceRevisionModel.path == path,
                    WorkspaceRevisionModel.from_path == path,
                ),
            )
            .order_by(WorkspaceRevisionModel.rev.desc(), WorkspaceRevisionModel.id.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return _revision(row) if row is not None else None

    async def history(self, project_id: UUID, path: str) -> list[RevisionRecord]:
        """Every revision of the record now at ``path``, newest first, across its moves.

        Walks back through each move to the path it came from, taking that path's
        revisions up to the move's.
        """

        out: list[RevisionRecord] = []
        current: str | None = path
        before: int | None = None
        seen: set[tuple[str, int | None]] = set()
        while current is not None and (current, before) not in seen:
            seen.add((current, before))
            query = select(WorkspaceRevisionModel).where(
                WorkspaceRevisionModel.project_id == project_id,
                WorkspaceRevisionModel.path == current,
            )
            if before is not None:
                query = query.where(WorkspaceRevisionModel.rev <= before)
            result = await self._session.execute(
                query.order_by(
                    WorkspaceRevisionModel.rev.desc(), WorkspaceRevisionModel.id.desc()
                )
            )
            rows = [_revision(row) for row in result.scalars()]
            current = None
            for row in rows:
                out.append(row)
                if row.op == "move" and row.from_path is not None:
                    current, before = row.from_path, row.rev
                    break
        return out

    # -- derived records ------------------------------------------------------------

    async def upsert_derived(
        self, project_id: UUID, items: Iterable[tuple[str, str]], head: int, at: datetime
    ) -> None:
        rows = [
            {"project_id": project_id, "path": path, "head": head, "content": content,
             "updated_at": at}
            for path, content in items
        ]
        if not rows:
            return
        stmt = pg_insert(WorkspaceDerivedModel)
        stmt = stmt.on_conflict_do_update(
            index_elements=[WorkspaceDerivedModel.project_id, WorkspaceDerivedModel.path],
            set_={
                "head": stmt.excluded.head,
                "content": stmt.excluded.content,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        await self._session.execute(stmt, rows)

    async def get_derived(self, project_id: UUID) -> dict[str, tuple[int, str]]:
        result = await self._session.execute(
            select(
                WorkspaceDerivedModel.path,
                WorkspaceDerivedModel.head,
                WorkspaceDerivedModel.content,
            ).where(WorkspaceDerivedModel.project_id == project_id)
        )
        return {path: (int(head), content) for path, head, content in result.all()}

    # -- the inbox ------------------------------------------------------------------

    async def count_pending_inbox(self, project_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(WorkspaceInboxModel)
            .where(
                WorkspaceInboxModel.project_id == project_id,
                WorkspaceInboxModel.state == INBOX_PENDING,
            )
        )
        return int(result.scalar_one())

    async def lock_inbox(self, project_id: UUID, ids: Collection[UUID]) -> dict[UUID, str]:
        """The states of this project's entries among ``ids``, locked ``FOR UPDATE``."""

        if not ids:
            return {}
        result = await self._session.execute(
            select(WorkspaceInboxModel.id, WorkspaceInboxModel.state)
            .where(
                WorkspaceInboxModel.project_id == project_id,
                WorkspaceInboxModel.id.in_(list(ids)),
            )
            .with_for_update()
        )
        return {entry_id: state for entry_id, state in result.all()}

    async def resolve_inbox(
        self,
        project_id: UUID,
        entry_id: UUID,
        *,
        state: str,
        reason: str | None,
        exit_code: int | None,
        batch_id: UUID,
        at: datetime,
    ) -> None:
        await self._session.execute(
            update(WorkspaceInboxModel)
            .where(
                WorkspaceInboxModel.project_id == project_id,
                WorkspaceInboxModel.id == entry_id,
            )
            .values(
                state=state,
                reason=reason,
                exit_code=exit_code,
                batch_id=batch_id,
                resolved_at=at,
            )
        )


def _revision(row: WorkspaceRevisionModel) -> RevisionRecord:
    return RevisionRecord(
        path=row.path,
        rev=int(row.rev),
        op=row.op,
        from_path=row.from_path,
        sha256=row.sha256,
        batch_id=row.batch_id,
        credential_id=row.credential_id,
        user_id=row.user_id,
        checkout=row.checkout,
        command=row.command,
        origin=row.origin,
        created_at=row.created_at,
    )
