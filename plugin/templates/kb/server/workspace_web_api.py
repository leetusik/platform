"""The web's workspace reads: a linked project's workspace, under ``/app/projects/{id}``.

Session-only (``require_user``), like the rest of ``/app/*``; the project is resolved
through ``_load_scoped_project``, so a project that is missing or another tenant's
answers **404** on every route and nothing of it leaks. Read-only: the shapes come
from ``server.workspace_read`` (built from the stored files of the project's head,
memoized per head).

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
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from server.accounts.auth import AuthContext, require_user
from server.app_api import _load_scoped_project
from server.workspace import WorkspaceReadError
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
