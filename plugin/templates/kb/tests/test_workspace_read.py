"""The workspace read model and the web's read routes: Postgres-gated.

A made-up workspace tree (``tests/fixtures/workspace/tree.json``) is committed through
the engine's sync API, then read back through ``/app/projects/{id}/workspace/…`` and
compared field for field with ``tests/fixtures/workspace/expected.json``. Also: every
read route answers 404 for another tenant's project and for an unknown one, a
resolved question reads ``resolved``, the memo follows the head, and the sync state
reads ``unlinked``, ``never``, ``fresh`` and ``behind`` as the store moves.

Like its neighbours this runs only with a disposable Postgres via
``KB_TEST_DATABASE_URL`` (or ``DATABASE_URL``) and skips otherwise.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, make_url, text

_RAW_DSN = os.environ.get("KB_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
_SMTP_ENV = ("KB_SMTP_HOST", "KB_SMTP_PORT", "KB_SMTP_USER", "KB_SMTP_PASSWORD", "KB_SMTP_FROM")
_ENGINE_HEADERS = {"X-Hi2vi-Checkout": "test-checkout", "X-Hi2vi-Engine": "v99"}
_FIXTURES = Path(__file__).parent / "fixtures" / "workspace"


@pytest.fixture
def store(tmp_path, monkeypatch):
    """``(client, url, sync_engine)`` on a Postgres accounts plane, or skip."""

    if not _RAW_DSN:
        pytest.skip(
            "set KB_TEST_DATABASE_URL (or DATABASE_URL) to a disposable Postgres to "
            "run the workspace read tests"
        )
    url = (
        make_url(_RAW_DSN)
        .set(drivername="postgresql+psycopg")
        .render_as_string(hide_password=False)
    )
    sync_engine = create_engine(url)
    try:
        with sync_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - environment dependent
        sync_engine.dispose()
        pytest.skip(f"Postgres at the test DSN is unreachable: {exc}")

    from server.persistence import models  # noqa: F401 - registers the tables
    from server.persistence.base import Base

    Base.metadata.create_all(sync_engine, checkfirst=True)

    (tmp_path / "docs").mkdir()
    monkeypatch.setenv("KB_ROOT", str(tmp_path))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "data" / "kb.sqlite3"))
    monkeypatch.setenv("KB_FEEDBACK_ATTACHMENTS_DIR", str(tmp_path / "attachments"))
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("KB_AUTH_RATE_LIMIT", "0")
    for name in _SMTP_ENV:
        monkeypatch.delenv(name, raising=False)

    import server.api_auth as api_auth
    import server.persistence.engine as engine_mod
    import server.workspace_read as workspace_read

    engine_mod._engine = None
    engine_mod._session_maker = None
    api_auth._tenant_one_cache = None
    workspace_read.clear_memo()

    from server.main import app

    try:
        with TestClient(app) as client:
            yield client, url, sync_engine
    finally:
        api_auth._tenant_one_cache = None
        engine_mod._engine = None
        engine_mod._session_maker = None
        workspace_read.clear_memo()
        sync_engine.dispose()


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _signup(client: TestClient) -> dict:
    res = client.post(
        "/auth/signup",
        json={"email": f"wsread-{uuid4().hex}@example.com", "password": "hunter2pass"},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _session(owner: dict) -> dict:
    return {"Authorization": f"Bearer {owner['token']}"}


def _owner_with_key(client: TestClient) -> tuple[dict, str, dict]:
    """A new owner, their project id and its workspace key headers."""

    owner = _signup(client)
    project_id = owner["project"]["id"]
    res = client.post(
        f"/app/projects/{project_id}/credentials",
        json={"scope": "workspace"},
        headers=_session(owner),
    )
    assert res.status_code == 201, res.text
    return owner, project_id, {"Authorization": f"Bearer {res.json()['key']}", **_ENGINE_HEADERS}


def _put(path: str, content: str, base_rev: int | None = None, **extra) -> dict:
    return {"op": "put", "path": path, "base_rev": base_rev,
            "sha256": _sha(content.encode("utf-8")), "content": content, **extra}


def _commit(client, project_id, key, ops, derived=()) -> dict:
    body = {"batch_id": str(uuid4()), "command": ["rebuild"], "origin": "command",
            "ops": ops, "events": [], "derived": list(derived), "inbox": []}
    res = client.post(f"/api/workspace/{project_id}/commit", json=body, headers=key)
    assert res.status_code == 200, res.text
    return res.json()


def _tree() -> dict:
    return json.loads((_FIXTURES / "tree.json").read_text(encoding="utf-8"))


def _expected() -> dict:
    return json.loads((_FIXTURES / "expected.json").read_text(encoding="utf-8"))


def _store_tree(client, project_id, key) -> dict:
    """Commit the fixture tree (its derived records with it); returns the answer."""

    tree = _tree()
    ops = []
    for path, content in tree["files"].items():
        if path in tree["append"]:
            ops.append({"op": "append", "path": path, "lines": content.rstrip("\n").split("\n")})
        else:
            ops.append(_put(path, content))
    derived = [{"path": path, "content": content} for path, content in tree["derived"].items()]
    return _commit(client, project_id, key, ops, derived)


def _get(client, owner, url) -> dict:
    res = client.get(url, headers=_session(owner))
    assert res.status_code == 200, res.text
    return res.json()


def _routes(project_id: str) -> list[str]:
    base = f"/app/projects/{project_id}/workspace"
    return [
        base,
        f"{base}/phases/P8-q4",
        f"{base}/phases/P8",
        f"{base}/slices/P8-q4.S1",
        f"{base}/deferred/D20-a3",
        f"{base}/docs/product",
        f"{base}/docs/product?version=v0001",
        f"{base}/agenda/A2-k5",
    ]


def test_shapes_come_back_field_for_field(store):
    client, _url, _engine = store
    owner, project_id, key = _owner_with_key(client)
    _store_tree(client, project_id, key)
    expected = _expected()
    base = f"/app/projects/{project_id}/workspace"

    ws = _get(client, owner, base)
    assert ws.pop("project") == project_id
    assert ws.pop("linked") is True
    assert ws.pop("version") == "v99"
    sync = ws.pop("sync")
    assert sync["state"] == "fresh" and sync["at"].endswith("Z")
    assert ws == expected["workspace"]

    assert _get(client, owner, f"{base}/phases/P8-q4") == expected["phase"]
    assert _get(client, owner, f"{base}/phases/P8") == expected["phase"]  # by short id
    assert _get(client, owner, f"{base}/slices/P8-q4.S1") == expected["slice"]
    assert _get(client, owner, f"{base}/deferred/D20-a3") == expected["job"]
    assert _get(client, owner, f"{base}/docs/product") == expected["doc"]
    assert _get(client, owner, f"{base}/docs/product?version=v0001") == expected["doc_v0001"]
    assert _get(client, owner, f"{base}/agenda/A2-k5") == expected["item"]

    planned = _get(client, owner, f"{base}/phases/P9-r5")
    assert planned["explain"] == {"title": "How export works"}
    assert planned["notebook"] is None and planned["current"] is None
    archived = _get(client, owner, f"{base}/phases/P7-m3")
    assert archived["archived"] is True and archived["slices"][0]["full"] == "P7-m3.S1"
    retired = _get(client, owner, f"{base}/docs/experience")
    assert retired["state"] == "retired" and retired["sections"][0]["title"] == "Journeys"

    for missing in ("phases/P99-zz", "slices/P8-q4.S9", "deferred/D1-zz", "docs/nope",
                    "docs/product?version=v0009", "agenda/A9-zz"):
        res = client.get(f"{base}/{missing}", headers=_session(owner))
        assert res.status_code == 404, (missing, res.text)


def test_a_resolved_question_reads_resolved(store):
    client, _url, _engine = store
    owner, project_id, key = _owner_with_key(client)
    _store_tree(client, project_id, key)
    phase = _get(client, owner, f"/app/projects/{project_id}/workspace/phases/P8-q4")
    states = {q["id"]: (q["state"], q["answer"]) for q in phase["notebook"]["questions"]}
    assert states == {"OQ1": ("open", ""), "OQ2": ("resolved", "D1 (one endpoint)")}


def test_another_tenants_project_is_404_on_every_read_route(store):
    client, _url, _engine = store
    owner, project_id, key = _owner_with_key(client)
    _store_tree(client, project_id, key)
    stranger = _signup(client)

    for url in _routes(project_id):
        assert client.get(url, headers=_session(owner)).status_code == 200, url
        res = client.get(url, headers=_session(stranger))
        assert res.status_code == 404, (url, res.text)
        assert "P8-q4" not in res.text and "Retry" not in res.text
        unknown = client.get(url.replace(project_id, str(uuid4())), headers=_session(owner))
        assert unknown.status_code == 404, (url, unknown.text)
        assert client.get(url).status_code == 401, url
        # the workspace key is the engine's, never a web session
        assert client.get(url, headers=key).status_code == 401, url


def test_the_memo_is_keyed_by_head(store):
    client, _url, _engine = store
    owner, project_id, key = _owner_with_key(client)
    answer = _store_tree(client, project_id, key)
    base = f"/app/projects/{project_id}/workspace"
    path = "works/phases/active/P9-r5/phase.json"
    first = _get(client, owner, base)
    assert [p["name"] for p in first["phases"]][1] == "Export to Markdown"
    assert _get(client, owner, f"{base}/phases/P9-r5")["name"] == "Export to Markdown"

    data = json.loads(_tree()["files"][path])
    data["name"] = "Export to Markdown and HTML"
    _commit(client, project_id, key,
            [_put(path, json.dumps(data, indent=2) + "\n", answer["revs"][path])])

    second = _get(client, owner, base)
    assert [p["name"] for p in second["phases"]][1] == "Export to Markdown and HTML"
    assert _get(client, owner, f"{base}/phases/P9-r5")["name"] == "Export to Markdown and HTML"


def _set_last_sync(engine, project_id: str, at: datetime) -> None:
    with engine.begin() as conn:
        conn.execute(text("UPDATE workspaces SET last_sync_at = :at WHERE project_id = :p"),
                     {"at": at, "p": project_id})


def test_sync_reads_unlinked_never_fresh_and_behind(store):
    client, url, engine = store
    owner, project_id, key = _owner_with_key(client)
    base = f"/app/projects/{project_id}/workspace"

    ws = _get(client, owner, base)
    assert ws == {"project": project_id, "linked": False, "version": None,
                  "sync": {"state": "unlinked", "at": None}}
    assert client.get(f"{base}/phases/P8-q4", headers=_session(owner)).status_code == 404

    res = client.get(f"/api/workspace/{project_id}/head", headers=key)
    assert res.status_code == 200 and res.json()["head"] == 0
    ws = _get(client, owner, base)
    assert ws["linked"] is True and ws["sync"] == {"state": "never", "at": None}
    assert ws["phases"] == [] and ws["agenda"] == []

    _store_tree(client, project_id, key)
    assert _get(client, owner, base)["sync"]["state"] == "fresh"

    _set_last_sync(engine, project_id, datetime.now(UTC) - timedelta(hours=25))
    assert _get(client, owner, base)["sync"]["state"] == "behind"


def test_an_up_to_date_head_probe_moves_last_sync_throttled(store):
    client, url, engine = store
    owner, project_id, key = _owner_with_key(client)
    answer = _store_tree(client, project_id, key)
    head = answer["head"]

    from server.persistence.engine import get_session_maker
    from server.workspace_read import note_head_probe

    old = datetime.now(UTC) - timedelta(hours=30)
    _set_last_sync(engine, project_id, old)
    pid = UUID(project_id)

    async def probe(base: int, at: datetime) -> bool:
        return await note_head_probe(pid, base, get_session_maker(), at=at)

    now = datetime.now(UTC)
    assert asyncio.run(probe(head - 1, now)) is False  # a stale checkout is not a sync
    assert asyncio.run(probe(head, now)) is True
    assert asyncio.run(probe(head, now + timedelta(seconds=30))) is False  # throttled
    assert asyncio.run(probe(head, now + timedelta(seconds=61))) is True
    with engine.connect() as conn:
        at = conn.execute(text("SELECT last_sync_at FROM workspaces WHERE project_id = :p"),
                          {"p": project_id}).scalar_one()
    assert at > old + timedelta(hours=29)


def test_question_and_result_readers():
    from server.workspace_read import notebook_entries, parse_questions, parse_result

    entries = notebook_entries([
        "_guidance_",
        "- **OQ3** (resolved → taken (yes: keep it), by the operator): Keep it (or not)?",
        "- **OQ4 (P1-ab.S2):** Which one?",
        "  more of OQ4",
        "",
        "A paragraph that is no entry.",
    ])
    assert parse_questions(entries) == [
        {"id": "OQ3", "text": "Keep it (or not)?", "state": "resolved",
         "answer": "taken (yes: keep it), by the operator"},
        {"id": "OQ4", "text": "Which one?\n  more of OQ4", "state": "open", "answer": ""},
    ]
    assert parse_result(None) is None
    plain = parse_result("- status: done\n- summary: ok\n\nBody text.\n")
    assert plain["verdict"]["status"] == "done" and plain["verdict"]["files"] is None
    assert plain["body"] == "Body text."
