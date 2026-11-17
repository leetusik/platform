"""The web's workspace reads and agenda writes, under ``/app/projects/{id}``.

Session-only (``require_user``), like the rest of ``/app/*``; the project is resolved
through ``_load_scoped_project``, so a project that is missing or another tenant's
answers **404** on every route and nothing of it leaks. The read shapes come from
``server.workspace_read`` (built from the stored files of the project's head,
memoized per head, with the open inbox entries laid over the agenda per request).

- ``GET /app/projects/{id}/workspace``: the Workspace, lists only (an unlinked
  project answers ``{project, linked: false, version: null, sync: {state:
  "unlinked"}}``).
- ``GET …/workspace/phases/{phase}``: a phase by full or short id.
- ``GET …/workspace/slices/{full}``: a slice by full id, with its plan and result.
- ``GET …/workspace/deferred/{id}``: a deferred job with its brief.
- ``GET …/workspace/docs/{doc}[?version=]``: a doc (current or retired) with its
  sections, at its latest version or the one named.
- ``GET …/workspace/agenda/{item}``: an agenda item.

A record that is not in the workspace, or a project with no linked workspace, is a 404.

**Agenda writes.** The web never writes a workspace file: each agenda change is one
inbox entry, which a linked engine applies as its own agenda command at its next sync
and whose result comes back in that sync's batch. Until then the item reads
``sync: 'waiting'``; a refusal reads ``{refused: <the engine's line>, entry}``.

- ``POST …/workspace/agenda {title, note?}`` → 201 ``{entry, item}``: an add, under an
  id the web mints (:func:`mint_agenda_id`).
- ``POST …/workspace/agenda/changes {kind, items, fields?}`` → 201 ``{entry}``: one
  entry for the change, all its items together (the engine's commands are all or
  none). ``kind`` is ``edit`` ``{title?, note?}``, ``move`` (one of ``first``, ``last``:
  ``true``, or ``before``, ``after``: an id), ``defer``, ``solve`` ``{outcome?}``,
  ``drop`` ``{reason?}``, ``reopen`` or ``delete``; ``edit`` and ``move`` take one item.
- ``POST …/workspace/inbox/{entry}/discard`` → 200 ``{entry}``: closes a pending or a
  refused entry; any other is a 409.
- ``POST …/workspace/inbox/{entry}/retry`` → 201 ``{entry, item?}``: Try again on a
  refused entry: the same change as a new entry (an add re-minted), the refused one
  closed in the same transaction; any other is a 409.

The early checks only (422 with one line): a title of 1 to 200 characters on one line
with the signed refusal, full agenda ids (the engine's ``AGENDA_ID_PATTERN``), a known
kind and its fields, and, on a change, ids the workspace holds now (a stored item or a
pending add; the engine's own line, ``<id> names no agenda item``). Everything else is
the engine's to refuse; a refused change whose item has gone since is listed in the
Workspace's ``unplaced``, with its entry for Discard and Try again.
"""

from __future__ import annotations

import re
import secrets
from collections.abc import Collection
from datetime import UTC
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from server.accounts.auth import AuthContext, require_user
from server.app_api import _load_scoped_project
from server.workspace import (
    WorkspaceInputError,
    WorkspacePersistenceError,
    WorkspaceReadError,
    get_workspace_service,
)
from server.workspace.service import InboxStateError
from server.workspace.types import (
    AGENDA_ID_PATTERN,
    AGENDA_TITLE_MAX,
    AGENDA_TITLE_REFUSAL,
    ID_TAIL_ALPHABET,
    ID_TAIL_LETTERS,
    INBOX_ADD,
    INBOX_KINDS,
    INBOX_REFUSED,
    InboxEntry,
)
from server.workspace_read import WorkspaceReader, open_reader

router = APIRouter()


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="the workspace store is unavailable")


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} not found")


async def _reader(project_id: UUID, ctx: AuthContext) -> WorkspaceReader:
    project = await _load_scoped_project(project_id, ctx)
    try:
        return await open_reader(project.id)
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


async def _linked(project_id: UUID, ctx: AuthContext) -> WorkspaceReader:
    reader = await _reader(project_id, ctx)
    if not reader.linked:
        raise _not_found("workspace")
    return reader


def _found(value: dict[str, Any] | None, what: str) -> dict[str, Any]:
    if value is None:
        raise _not_found(what)
    return value


@router.get("/app/projects/{project_id}/workspace")
async def get_workspace(
    project_id: UUID, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _reader(project_id, ctx)
    try:
        return await reader.workspace()
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


@router.get("/app/projects/{project_id}/workspace/phases/{phase_id}")
async def get_workspace_phase(
    project_id: UUID, phase_id: str, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    try:
        return _found(await reader.phase(phase_id), "phase")
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


@router.get("/app/projects/{project_id}/workspace/slices/{slice_id}")
async def get_workspace_slice(
    project_id: UUID, slice_id: str, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    try:
        return _found(await reader.slice(slice_id), "slice")
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


@router.get("/app/projects/{project_id}/workspace/deferred/{job_id}")
async def get_workspace_job(
    project_id: UUID, job_id: str, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    try:
        return _found(await reader.job(job_id), "deferred job")
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


@router.get("/app/projects/{project_id}/workspace/docs/{doc_id}")
async def get_workspace_doc(
    project_id: UUID,
    doc_id: str,
    version: str | None = Query(default=None, max_length=200),
    ctx: AuthContext = Depends(require_user),
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    try:
        return _found(await reader.doc(doc_id, version), "doc")
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


@router.get("/app/projects/{project_id}/workspace/agenda/{item_id}")
async def get_workspace_item(
    project_id: UUID, item_id: str, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    try:
        return _found(await reader.item(item_id), "agenda item")
    except WorkspaceReadError as exc:
        raise _unavailable() from exc


# -- agenda writes: inbox entries -------------------------------------------------------

_AGENDA_ID = re.compile(AGENDA_ID_PATTERN)
_NUMBER = re.compile(r"A([0-9]+)-")
#: An entry's bounds: items per change, and characters per note, outcome or reason.
_MAX_ITEMS = 1000
_MAX_TEXT = 20_000
#: The fields each kind takes (``add`` has its own route).
_KIND_FIELDS: dict[str, tuple[str, ...]] = {
    "edit": ("title", "note"),
    "move": ("first", "last", "before", "after"),
    "defer": (),
    "solve": ("outcome",),
    "drop": ("reason",),
    "reopen": (),
    "delete": (),
}
assert set(_KIND_FIELDS) | {INBOX_ADD} == set(INBOX_KINDS)


def mint_agenda_id(known: Collection[str]) -> str:
    """A new agenda id by the engine's rule: ``A<n>-<tail>``.

    ``n`` is one past the highest number among ``known`` (the stored items and every
    open entry's ids, so two web adds in a row never share one), and the tail two
    symbols drawn with ``secrets`` from the engine's alphabet, at least one a letter,
    re-drawn while the full id is known. An engine that mints the same number on a
    checkout not yet synced draws its own tail, so the two ids differ 923 times in
    924; the same full id is the engine's refusal ("exists"), shown as Change refused,
    and Try again re-mints.
    """

    numbers = [int(m.group(1)) for aid in known if (m := _NUMBER.match(aid))]
    number = max(numbers, default=0) + 1
    while True:
        tail = "".join(secrets.choice(ID_TAIL_ALPHABET) for _ in range(2))
        if not any(c in ID_TAIL_LETTERS for c in tail):
            continue
        minted = f"A{number}-{tail}"
        if minted not in known and _AGENDA_ID.fullmatch(minted):
            return minted


def _field_error(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


def _title(raw: Any) -> str:
    """A title as the engine stores it (stripped, one line, 1 to 200), or the signed refusal."""

    title = raw.strip() if isinstance(raw, str) else ""
    if not title or len(title) > AGENDA_TITLE_MAX or len(title.splitlines()) != 1:
        raise _field_error(AGENDA_TITLE_REFUSAL)
    return title


def _text(raw: Any, name: str) -> str:
    if not isinstance(raw, str) or len(raw) > _MAX_TEXT:
        raise _field_error(f"{name} must be text of at most {_MAX_TEXT} characters")
    return raw


def _full_id(raw: Any) -> str:
    if not isinstance(raw, str) or not _AGENDA_ID.fullmatch(raw):
        shown = raw if isinstance(raw, str) and len(raw) <= 40 else "that value"
        raise _field_error(f"{shown} is not a full agenda id (like A7-m3)")
    return raw


def _items(raw: Any) -> list[str]:
    if not isinstance(raw, list) or not raw:
        raise _field_error("items must list one or more agenda ids")
    if len(raw) > _MAX_ITEMS:
        raise _field_error(f"a change takes at most {_MAX_ITEMS} items")
    return list(dict.fromkeys(_full_id(aid) for aid in raw))


def _fields(kind: str, items: list[str], raw: Any) -> dict[str, Any]:
    """The change's fields, checked for shape only; the engine decides the rest."""

    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise _field_error("fields must be an object")
    allowed = _KIND_FIELDS[kind]
    for name in raw:
        if name not in allowed:
            raise _field_error(f"{kind} takes no {name}")
    if kind in ("edit", "move") and len(items) != 1:
        raise _field_error(f"{kind} takes exactly one item")
    fields: dict[str, Any] = {}
    if kind == "edit":
        if "title" not in raw and "note" not in raw:
            raise _field_error("edit takes a title, a note or both")
        if "title" in raw:
            fields["title"] = _title(raw["title"])
        if "note" in raw:
            fields["note"] = _text(raw["note"], "note")
    elif kind == "move":
        places = [name for name in allowed if name in raw]
        if len(places) != 1:
            raise _field_error("move takes exactly one of first, last, before or after")
        place = places[0]
        if place in ("first", "last"):
            if raw[place] is not True:
                raise _field_error(f"{place} must be true")
            fields[place] = True
        else:
            other = _full_id(raw[place])
            if other == items[0]:
                raise _field_error(f"an item cannot move {place} itself")
            fields[place] = other
    else:
        for name in allowed:
            if name in raw and raw[name] is not None:
                fields[name] = _text(raw[name], name)
    return fields


def _serialize(entry: InboxEntry) -> dict[str, Any]:
    return {
        "id": str(entry.id),
        "kind": entry.kind,
        "items": list(entry.items),
        "fields": dict(entry.fields),
        "minted_id": entry.minted_id,
        "state": entry.state,
        "reason": entry.reason,
        "created_at": entry.created_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _closed(exc: InboxStateError) -> HTTPException:
    if exc.state is None:
        return _not_found("inbox entry")
    return HTTPException(status_code=409, detail=f"this change is {exc.state}, not open")


async def _write(
    project_id: UUID,
    ctx: AuthContext,
    *,
    kind: str,
    items: list[str],
    fields: dict[str, Any],
    minted_id: str | None = None,
    replaces: UUID | None = None,
) -> InboxEntry:
    try:
        return await get_workspace_service().add_inbox(
            project_id, kind=kind, items=items, fields=fields, minted_id=minted_id,
            user_id=ctx.user.id, replaces=replaces,
        )
    except InboxStateError as exc:
        raise _closed(exc) from exc
    except WorkspaceInputError as exc:
        raise _field_error(str(exc)) from exc
    except WorkspacePersistenceError as exc:
        raise _unavailable() from exc


async def _add(reader: WorkspaceReader, ctx: AuthContext, fields: dict[str, Any],
               replaces: UUID | None = None) -> dict[str, Any]:
    try:
        minted = mint_agenda_id(await reader.agenda_ids())
    except WorkspaceReadError as exc:
        raise _unavailable() from exc
    entry = await _write(reader.project_id, ctx, kind=INBOX_ADD, items=[minted],
                         fields=fields, minted_id=minted, replaces=replaces)
    return {"entry": _serialize(entry), "item": minted}


async def _held(reader: WorkspaceReader, ids: list[str]) -> None:
    """A 422 in the engine's own words for the first id the workspace does not hold."""

    try:
        held = await reader.held_ids()
    except WorkspaceReadError as exc:
        raise _unavailable() from exc
    for aid in ids:
        if aid not in held:
            raise _field_error(f"{aid} names no agenda item")


def _body(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise _field_error("the body must be a JSON object")
    return raw


@router.post("/app/projects/{project_id}/workspace/agenda", status_code=201)
async def add_agenda_item(
    project_id: UUID,
    payload: Any = Body(default=None),
    ctx: AuthContext = Depends(require_user),
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    body = _body(payload)
    for name in body:
        if name not in ("title", "note"):
            raise _field_error(f"an add takes no {name}")
    fields: dict[str, Any] = {"title": _title(body.get("title"))}
    if body.get("note"):
        fields["note"] = _text(body["note"], "note")
    return await _add(reader, ctx, fields)


@router.post("/app/projects/{project_id}/workspace/agenda/changes", status_code=201)
async def change_agenda_items(
    project_id: UUID,
    payload: Any = Body(default=None),
    ctx: AuthContext = Depends(require_user),
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    body = _body(payload)
    kind = body.get("kind")
    if kind not in _KIND_FIELDS:
        raise _field_error(
            f"kind must be one of {', '.join(_KIND_FIELDS)} (an add has its own route)"
        )
    items = _items(body.get("items"))
    fields = _fields(kind, items, body.get("fields"))
    await _held(reader, [*items, *(fields[p] for p in ("before", "after") if p in fields)])
    entry = await _write(reader.project_id, ctx, kind=kind, items=items, fields=fields)
    return {"entry": _serialize(entry)}


async def _open_entry(reader: WorkspaceReader, entry_id: str) -> InboxEntry:
    try:
        eid = UUID(entry_id)
    except ValueError:
        raise _not_found("inbox entry") from None
    try:
        entry = await get_workspace_service().inbox_entry(reader.project_id, eid)
    except WorkspaceReadError as exc:
        raise _unavailable() from exc
    if entry is None:
        raise _not_found("inbox entry")
    return entry


@router.post("/app/projects/{project_id}/workspace/inbox/{entry_id}/discard")
async def discard_inbox_entry(
    project_id: UUID, entry_id: str, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    entry = await _open_entry(reader, entry_id)
    try:
        closed = await get_workspace_service().discard_inbox(reader.project_id, entry.id)
    except InboxStateError as exc:
        raise _closed(exc) from exc
    except WorkspacePersistenceError as exc:
        raise _unavailable() from exc
    return {"entry": _serialize(closed)}


@router.post("/app/projects/{project_id}/workspace/inbox/{entry_id}/retry", status_code=201)
async def retry_inbox_entry(
    project_id: UUID, entry_id: str, ctx: AuthContext = Depends(require_user)
) -> dict[str, Any]:
    reader = await _linked(project_id, ctx)
    entry = await _open_entry(reader, entry_id)
    if entry.state != INBOX_REFUSED:
        raise HTTPException(status_code=409, detail=f"this change is {entry.state}, not refused")
    if entry.kind == INBOX_ADD:
        return await _add(reader, ctx, dict(entry.fields), replaces=entry.id)
    again = await _write(reader.project_id, ctx, kind=entry.kind, items=list(entry.items),
                         fields=dict(entry.fields), replaces=entry.id)
    return {"entry": _serialize(again)}
