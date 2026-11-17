"""Transport-neutral workspace-store data types.

No ORM objects cross this boundary. ``CommitBatch`` and its ``*Op`` types are the
engine's sync batch as the service applies it; ``CommitAnswer`` is the answer the
service returns (and keeps, by ``batch_id``, for a replay); the ``*Record`` types are
what the reads return.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

#: A record's kinds: a revisioned ``file``, or an ``append``-only file (the event log,
#: the loop logs) whose lines are stored one by one and never conflict.
KIND_FILE = "file"
KIND_APPEND = "append"
RECORD_KINDS = (KIND_FILE, KIND_APPEND)

#: The ops a batch carries.
OP_PUT = "put"
OP_DELETE = "delete"
OP_MOVE = "move"
OP_APPEND = "append"
OP_NAMES = (OP_PUT, OP_DELETE, OP_MOVE, OP_APPEND)

#: The states of a web inbox entry; an engine's result may set only the two final ones.
INBOX_PENDING = "pending"
INBOX_APPLIED = "applied"
INBOX_REFUSED = "refused"
INBOX_DISCARDED = "discarded"
INBOX_STATES = (INBOX_PENDING, INBOX_APPLIED, INBOX_REFUSED, INBOX_DISCARDED)
INBOX_RESULT_STATES = (INBOX_APPLIED, INBOX_REFUSED)


@dataclass(slots=True, frozen=True, kw_only=True)
class Writer:
    """Who sends a batch: a workspace key from a checkout, or a web user."""

    credential_id: UUID | None = None
    user_id: UUID | None = None
    checkout: str | None = None
    engine_version: str | None = None


@dataclass(slots=True, frozen=True, kw_only=True)
class PutOp:
    """Write ``content`` at ``path``; ``base_rev`` ``None`` means it must not exist."""

    path: str
    base_rev: int | None
    sha256: str
    content: bytes
    kind: str | None = None
    origin: str | None = None


@dataclass(slots=True, frozen=True, kw_only=True)
class DeleteOp:
    path: str
    base_rev: int | None
    origin: str | None = None


@dataclass(slots=True, frozen=True, kw_only=True)
class MoveOp:
    """Move the record at ``from_path`` to ``to_path``; its history follows it."""

    from_path: str
    to_path: str
    base_rev: int | None
    origin: str | None = None


@dataclass(slots=True, frozen=True, kw_only=True)
class AppendOp:
    """Append ``lines`` (no newline inside one) to an append-only file; never conflicts."""

    path: str
    lines: tuple[str, ...]
    origin: str | None = None


Op = PutOp | DeleteOp | MoveOp | AppendOp


@dataclass(slots=True, frozen=True, kw_only=True)
class DerivedRecord:
    """An engine-rendered projection, stored latest only at the batch's head."""

    path: str
    content: str


@dataclass(slots=True, frozen=True, kw_only=True)
class InboxResult:
    """An engine's result for one web inbox entry, landing with the batch."""

    id: UUID
    state: str
    reason: str | None = None
    exit_code: int | None = None


@dataclass(slots=True, frozen=True, kw_only=True)
class CommitBatch:
    """One all-or-nothing sync batch, idempotent by ``batch_id``."""

    batch_id: UUID
    command: str | None
    origin: str | None
    ops: tuple[Op, ...]
    derived: tuple[DerivedRecord, ...] = ()
    inbox: tuple[InboxResult, ...] = ()


@dataclass(slots=True, frozen=True, kw_only=True)
class CommitAnswer:
    """The answer to a batch: 200 ``{head, revs}`` or 409 ``{conflicts}``.

    ``replayed`` is ``True`` when the batch was seen before and this is its first
    answer again, with nothing applied.
    """

    status: int
    body: dict[str, Any]
    replayed: bool = False


@dataclass(slots=True, frozen=True, kw_only=True)
class HeadRecord:
    head: int
    inbox_pending: int


@dataclass(slots=True, frozen=True, kw_only=True)
class ManifestEntry:
    path: str
    rev: int
    sha256: str
    size: int
    deleted: bool
    kind: str


@dataclass(slots=True, frozen=True, kw_only=True)
class FileContent:
    path: str
    rev: int
    sha256: str
    kind: str
    content: bytes


@dataclass(slots=True, frozen=True, kw_only=True)
class FetchPage:
    """A page of contents; ``rest`` are the asked paths left for the next page."""

    files: tuple[FileContent, ...]
    rest: tuple[str, ...] = ()


@dataclass(slots=True, frozen=True, kw_only=True)
class RevisionRecord:
    path: str
    rev: int
    op: str
    from_path: str | None
    sha256: str | None
    batch_id: UUID | None
    credential_id: UUID | None
    user_id: UUID | None
    checkout: str | None
    command: str | None
    origin: str | None
    created_at: datetime


@dataclass(slots=True, kw_only=True)
class WorkingRecord:
    """A record as a batch sees it while its ops are checked (the service's scratch copy)."""

    path: str
    rev: int
    sha256: str
    size: int
    kind: str
    deleted: bool
    blob_sha256: str | None
    base_seq: int | None
    #: Lines appended by this batch, after the stored ones.
    new_lines: list[str] = field(default_factory=list)
    #: The full content when this batch already knows it (a put, a materialized append).
    content: bytes | None = None
    changed: bool = False
