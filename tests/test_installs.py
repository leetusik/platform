"""sikstack installs: registration, sign-in from the machine, the connect page's calls, install Feedback.

Postgres-gated like its neighbours: runs only with a disposable Postgres via
``KB_TEST_DATABASE_URL`` (or ``DATABASE_URL``) and skips otherwise, bar the dormant
check, which needs none. Each rule of ``server.installs_api`` has its test here:
the pre-user row holds exactly what setup sent; a code is claimed only by a signed-in
account's approval; an install another account claimed is refused; an account whose
email equals the setup email sees nothing it never approved; an expired or unknown
code changes nothing; the workspace key is handed over once; a signed-out read is
rate-limited per address; an install's report lands in the configured project,
limited per install.
"""

from __future__ import annotations

import os
import re
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, make_url, text

_RAW_DSN = os.environ.get("KB_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
_SMTP_ENV = ("KB_SMTP_HOST", "KB_SMTP_PORT", "KB_SMTP_USER", "KB_SMTP_PASSWORD", "KB_SMTP_FROM")
_ENGINE_HEADERS = {"X-Sikstack-Checkout": "test-checkout", "X-Sikstack-Engine": "v99"}
_CODE = re.compile(r"[A-HJKMNP-TW-Z2-9]{4}-[A-HJKMNP-TW-Z2-9]{4}")


def _url(raw: str) -> str:
    return make_url(raw).set(drivername="postgresql+psycopg").render_as_string(hide_password=False)


@pytest.fixture
def db(tmp_path, monkeypatch):
    """A TestClient on a Postgres accounts plane plus a sync engine on it, or skip."""

    if not _RAW_DSN:
        pytest.skip("set KB_TEST_DATABASE_URL (or DATABASE_URL) to a disposable Postgres to run the install tests")
    url = _url(_RAW_DSN)
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
    monkeypatch.setenv("KB_PUBLIC_BASE_URL", "https://web.example")
    monkeypatch.delenv("KB_INSTALL_FEEDBACK_PROJECT_ID", raising=False)
    monkeypatch.delenv("KB_INSTALL_RATE_LIMIT", raising=False)
    for name in _SMTP_ENV:
        monkeypatch.delenv(name, raising=False)

    import server.api_auth as api_auth
    import server.feedback.notify as notify
    import server.installs_api as installs_api
    import server.persistence.engine as engine_mod

    monkeypatch.setattr(notify, "send_message", lambda message: None)
    monkeypatch.setattr(installs_api, "_rate_windows", {})
    # Most tests poll back to back; the interval has its own test.
    monkeypatch.setattr(installs_api, "POLL_SLACK_S", 5.0)
    engine_mod._engine = None
    engine_mod._session_maker = None
    api_auth._tenant_one_cache = None

    from server.main import app

    try:
        with TestClient(app) as client:
            yield client, sync_engine
    finally:
        api_auth._tenant_one_cache = None
        engine_mod._engine = None
        engine_mod._session_maker = None
        sync_engine.dispose()


def _signup(client: TestClient, email: str | None = None) -> dict:
    res = client.post(
        "/auth/signup",
        json={"email": email or f"acct-{uuid4().hex}@example.com", "password": "hunter2pass"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    body["session"] = {"Authorization": f"Bearer {body['token']}"}
    return body


def _register(client: TestClient, install_id: str | None = None, email: str | None = None) -> dict:
    body = {
        "install_id": install_id or str(uuid4()),
        "email": email or f"setup-{uuid4().hex}@example.com",
        "plugin_version": "1.0.0",
    }
    res = client.post("/api/installs", json=body)
    assert res.status_code == 200, res.text
    assert res.json() == {"status": "registered"}
    return body


def _start(client: TestClient, install_id: str, repo: str = "platform") -> dict:
    res = client.post(
        "/api/installs/sign-in", json={"install_id": install_id, "repo": repo, "plugin_version": "1.0.0"}
    )
    assert res.status_code == 200, res.text
    return res.json()


def _poll(client: TestClient, started: dict):
    return client.post("/api/installs/sign-in/poll", json={"poll_token": started["poll_token"]})


def _install_row(engine, install_id: str) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM installs WHERE install_id = :i"), {"i": install_id}
        ).mappings().one()
    return dict(row)


def _project_names(client: TestClient, account: dict) -> list[str]:
    res = client.get("/app/projects", headers=account["session"])
    assert res.status_code == 200, res.text
    return sorted(p["name"] for p in res.json()["projects"])


# --- registration (C1) -------------------------------------------------------------


def test_registration_keeps_exactly_the_three_fields_and_a_new_email_updates_the_row(db):
    client, engine = db
    sent = _register(client)
    row = _install_row(engine, sent["install_id"])
    assert set(row) == {
        "id", "install_id", "email", "plugin_version", "created_at", "last_seen_at", "claimed_by", "claimed_at",
    }
    assert (row["install_id"], row["email"], row["plugin_version"]) == (
        sent["install_id"], sent["email"], "1.0.0",
    )
    assert row["claimed_by"] is None and row["claimed_at"] is None

    again = client.post(
        "/api/installs",
        json={"install_id": sent["install_id"], "email": "New@Example.com", "plugin_version": "1.0.1"},
    )
    assert again.status_code == 200 and again.json() == {"status": "registered"}
    updated = _install_row(engine, sent["install_id"])
    assert (updated["id"], updated["email"], updated["plugin_version"]) == (row["id"], "new@example.com", "1.0.1")
    assert updated["created_at"] == row["created_at"] and updated["last_seen_at"] >= row["last_seen_at"]
    with engine.connect() as conn:
        assert conn.execute(
            text("SELECT count(*) FROM installs WHERE install_id = :i"), {"i": sent["install_id"]}
        ).scalar_one() == 1


def test_registration_refuses_a_bad_body_an_oversized_one_and_a_flood_from_one_address(db, monkeypatch):
    client, _ = db
    assert client.post("/api/installs", json={"install_id": str(uuid4()), "email": "a@b.co"}).status_code == 400
    assert client.post(
        "/api/installs", json={"install_id": str(uuid4()), "email": "nope", "plugin_version": "1.0.0"}
    ).status_code == 400
    huge = {"install_id": str(uuid4()), "email": "a@b.co", "plugin_version": "1.0.0", "pad": "x" * 5000}
    assert client.post("/api/installs", json=huge).status_code == 413

    monkeypatch.setenv("KB_INSTALL_RATE_LIMIT", "2")
    import server.installs_api as installs_api

    monkeypatch.setattr(installs_api, "_rate_windows", {})
    ip = {"X-Real-IP": "203.0.113.7"}
    body = {"install_id": str(uuid4()), "email": "a@b.co", "plugin_version": "1.0.0"}
    assert [client.post("/api/installs", json=body, headers=ip).status_code for _ in range(3)] == [200, 200, 429]
    assert client.post("/api/installs", json=body, headers={"X-Real-IP": "203.0.113.8"}).status_code == 200


# --- start and poll -----------------------------------------------------------------


def test_start_refuses_an_unregistered_install_and_answers_a_code_url_and_poll_token(db):
    client, _ = db
    res = client.post(
        "/api/installs/sign-in", json={"install_id": str(uuid4()), "repo": "platform", "plugin_version": "1.0.0"}
    )
    assert res.status_code == 404 and "/sikstack:setup" in res.json()["detail"]

    sent = _register(client)
    started = _start(client, sent["install_id"])
    assert _CODE.fullmatch(started["code"]), started["code"]
    assert started["url"] == f"https://web.example/connect?code={started['code']}"
    assert started["expires_in"] == 900 and started["interval"] == 5
    assert len(started["poll_token"]) >= 32
    assert _poll(client, started).json() == {"status": "pending"}
    assert client.post("/api/installs/sign-in/poll", json={"poll_token": "nope"}).status_code == 404


def test_a_poll_sooner_than_the_interval_is_slowed_down(db, monkeypatch):
    client, _ = db
    import server.installs_api as installs_api

    monkeypatch.setattr(installs_api, "POLL_SLACK_S", 1.0)
    started = _start(client, _register(client)["install_id"])
    assert _poll(client, started).json() == {"status": "pending"}
    soon = _poll(client, started)
    assert soon.status_code == 429 and soon.json()["status"] == "slow_down"
    assert soon.headers["Retry-After"] == "5"


# --- approve, the one-time key (C3) -----------------------------------------------


def test_approval_claims_the_install_makes_the_repo_project_and_hands_the_key_over_once(db):
    client, engine = db
    sent = _register(client)
    started = _start(client, sent["install_id"], repo="platform")
    owner = _signup(client)

    read = client.get(f"/app/connect/{started['code']}", headers=owner["session"])
    assert read.status_code == 200, read.text
    ready = read.json()
    assert ready["state"] == "ready" and ready["project"] == {"name": "platform"}
    assert ready["install"]["email"] == sent["email"] and ready["install"]["version"] == "1.0.0"
    assert ready["install"]["id"] == f"{sent['install_id'][:4]}…{sent['install_id'][-4:]}"
    assert ready["account"]["email"] == owner["user"]["email"]
    assert [o["id"] for o in ready["account"]["orgs"]] == [owner["tenant"]["id"]]

    approved = client.post(f"/app/connect/{started['code'].lower()}/approve", json={}, headers=owner["session"])
    assert approved.status_code == 200, approved.text
    project_id = approved.json()["project"]["id"]
    assert approved.json()["project"]["name"] == "platform" and approved.json()["org_id"] == owner["tenant"]["id"]
    assert _project_names(client, owner) == ["default", "platform"]

    row = _install_row(engine, sent["install_id"])
    assert str(row["claimed_by"]) == owner["user"]["id"] and row["claimed_at"] is not None

    first = _poll(client, started).json()
    assert first["status"] == "approved" and first["project_id"] == project_id
    assert first["org_id"] == owner["tenant"]["id"] and first["project_name"] == "platform"
    assert first["web_url"] == f"https://web.example/projects/{project_id}/workspace"
    key = first["key"]
    assert key.startswith("vk_")
    head = client.get(
        f"/api/workspace/{project_id}/head", headers={"Authorization": f"Bearer {key}", **_ENGINE_HEADERS}
    )
    assert head.status_code == 200, head.text and head.json()["project_id"] == project_id

    second = _poll(client, started).json()
    assert second["status"] == "approved" and "key" not in second
    with engine.connect() as conn:
        scopes = conn.execute(
            text("SELECT scope FROM project_credentials WHERE project_id = :p"), {"p": project_id}
        ).scalars().all()
    assert scopes == ["workspace"]

    # The page, read again: already connected; signed out, the used code shows nothing.
    assert client.get(f"/app/connect/{started['code']}", headers=owner["session"]).json() == {
        "state": "already", "code": started["code"], "project": {"id": project_id, "name": "platform"},
    }
    assert client.get(f"/app/connect/{started['code']}").json() == {"state": "expired", "code": started["code"]}


def test_only_a_signed_in_account_approves(db):
    client, engine = db
    sent = _register(client)
    started = _start(client, sent["install_id"])
    assert client.post(f"/app/connect/{started['code']}/approve", json={}).status_code == 401
    assert client.post(
        f"/app/connect/{started['code']}/approve", json={}, headers={"Authorization": "Bearer nope"}
    ).status_code == 401
    assert _install_row(engine, sent["install_id"])["claimed_by"] is None
    assert _poll(client, started).json() == {"status": "pending"}


def test_an_org_the_account_is_not_in_is_refused(db):
    client, engine = db
    sent = _register(client)
    started = _start(client, sent["install_id"])
    owner, stranger = _signup(client), _signup(client)
    res = client.post(
        f"/app/connect/{started['code']}/approve", json={"org_id": stranger["tenant"]["id"]}, headers=owner["session"]
    )
    assert res.status_code == 403
    assert _install_row(engine, sent["install_id"])["claimed_by"] is None
    assert _project_names(client, stranger) == ["default"]


# --- the security rules (C2) -------------------------------------------------------


def test_an_install_another_account_claimed_is_refused(db):
    client, engine = db
    sent = _register(client)
    first = _start(client, sent["install_id"])
    alice, bob = _signup(client), _signup(client)
    assert client.post(f"/app/connect/{first['code']}/approve", json={}, headers=alice["session"]).status_code == 200

    second = _start(client, sent["install_id"], repo="other-repo")
    assert client.get(f"/app/connect/{second['code']}", headers=bob["session"]).json() == {
        "state": "other", "code": second["code"],
    }
    refused = client.post(f"/app/connect/{second['code']}/approve", json={}, headers=bob["session"])
    assert refused.status_code == 403
    assert client.post(f"/app/connect/{second['code']}/decline", headers=bob["session"]).status_code == 403
    assert str(_install_row(engine, sent["install_id"])["claimed_by"]) == alice["user"]["id"]
    assert _project_names(client, bob) == ["default"]
    assert _poll(client, second).json() == {"status": "pending"}
    # Alice's own second repo connects: an install claimed by her takes more projects.
    assert client.post(f"/app/connect/{second['code']}/approve", json={}, headers=alice["session"]).status_code == 200
    assert _project_names(client, alice) == ["default", "other-repo", "platform"]


def test_the_setup_email_alone_claims_nothing(db):
    client, engine = db
    setup_email = f"same-{uuid4().hex}@example.com"
    sent = _register(client, email=setup_email)
    started = _start(client, sent["install_id"])

    # An account with the setup email that approved nothing: no install, no project.
    same = _signup(client, email=setup_email)
    assert _project_names(client, same) == ["default"]
    assert _install_row(engine, sent["install_id"])["claimed_by"] is None
    assert _poll(client, started).json() == {"status": "pending"}

    # Another account approves; the same-email account still sees none of it.
    owner = _signup(client)
    assert client.post(f"/app/connect/{started['code']}/approve", json={}, headers=owner["session"]).status_code == 200
    assert _project_names(client, same) == ["default"]
    assert client.get(f"/app/connect/{started['code']}", headers=same["session"]).json()["state"] == "other"
    assert str(_install_row(engine, sent["install_id"])["claimed_by"]) == owner["user"]["id"]


def test_an_expired_or_unknown_code_changes_nothing(db):
    client, engine = db
    sent = _register(client)
    started = _start(client, sent["install_id"], repo="expired-repo")
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE install_sign_ins SET expires_at = now() - :d WHERE code = :c"),
            {"d": timedelta(seconds=1), "c": started["code"].replace("-", "")},
        )
    owner = _signup(client)
    assert client.get(f"/app/connect/{started['code']}", headers=owner["session"]).json() == {
        "state": "expired", "code": started["code"],
    }
    assert client.get(f"/app/connect/{started['code']}").json()["state"] == "expired"
    for verb in ("approve", "decline"):
        res = client.post(f"/app/connect/{started['code']}/{verb}", json={}, headers=owner["session"])
        assert res.status_code == 410, res.text
    for unknown in ("AAAA-AAAA", "not-a-code"):
        assert client.get(f"/app/connect/{unknown}", headers=owner["session"]).json()["state"] == "expired"
        assert client.post(f"/app/connect/{unknown}/approve", json={}, headers=owner["session"]).status_code == 410
    assert _install_row(engine, sent["install_id"])["claimed_by"] is None
    assert _project_names(client, owner) == ["default"]
    assert _poll(client, started).json() == {"status": "expired"}


def test_a_declined_code_denies_the_poll_and_claims_nothing(db):
    client, engine = db
    sent = _register(client)
    started = _start(client, sent["install_id"])
    owner = _signup(client)
    assert client.post(f"/app/connect/{started['code']}/decline", headers=owner["session"]).json() == {
        "state": "declined",
    }
    assert _poll(client, started).json() == {"status": "denied"}
    assert client.get(f"/app/connect/{started['code']}", headers=owner["session"]).json()["state"] == "declined"
    assert client.post(f"/app/connect/{started['code']}/approve", json={}, headers=owner["session"]).status_code == 410
    assert _install_row(engine, sent["install_id"])["claimed_by"] is None
    assert _project_names(client, owner) == ["default"]


def test_a_signed_out_read_shows_the_setup_email_and_is_rate_limited_per_address(db, monkeypatch):
    client, _ = db
    sent = _register(client)
    started = _start(client, sent["install_id"])
    out = client.get(f"/app/connect/{started['code']}").json()
    assert out["state"] == "out" and out["install"]["email"] == sent["email"]
    assert "account" not in out and out["project"] == {"name": "platform"}

    monkeypatch.setenv("KB_INSTALL_RATE_LIMIT", "3")
    import server.installs_api as installs_api

    monkeypatch.setattr(installs_api, "_rate_windows", {})
    ip = {"X-Real-IP": "198.51.100.4"}
    codes = [client.get(f"/app/connect/{started['code']}", headers=ip).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    assert client.get(f"/app/connect/{started['code']}", headers={"X-Real-IP": "198.51.100.5"}).status_code == 200


# --- an install's Feedback ----------------------------------------------------------


def _report(client: TestClient, install_id: str, message: str = "setup said pending twice"):
    return client.post(
        "/api/installs/feedback",
        json={"install_id": install_id, "message": message, "plugin_version": "1.0.0"},
    )


def test_install_feedback_is_dormant_until_its_project_is_set(db):
    client, _ = db
    assert _report(client, _register(client)["install_id"]).status_code == 404


def test_an_installs_report_lands_in_the_configured_project_limited_per_install(db, monkeypatch):
    client, engine = db
    operator = _signup(client)
    destination = client.post("/app/projects", json={"name": "sikstack"}, headers=operator["session"]).json()
    monkeypatch.setenv("KB_INSTALL_FEEDBACK_PROJECT_ID", destination["project"]["id"])
    monkeypatch.setenv("KB_INSTALL_FEEDBACK_RATE_LIMIT", "2")

    anonymous = _register(client)
    assert _report(client, str(uuid4())).status_code == 404  # never registered
    first = _report(client, anonymous["install_id"])
    assert first.status_code == 202, first.text
    assert first.json()["status"] == "accepted"
    assert _report(client, anonymous["install_id"]).status_code == 202
    limited = _report(client, anonymous["install_id"])
    assert limited.status_code == 429

    # Another install still sends; a claimed install's report carries its account.
    claimed = _register(client)
    started = _start(client, claimed["install_id"])
    owner = _signup(client)
    assert client.post(f"/app/connect/{started['code']}/approve", json={}, headers=owner["session"]).status_code == 200
    assert _report(client, claimed["install_id"], "sign-in opened the page").status_code == 202

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT message, source_product, user_id, tags, attributes FROM feedback_events "
                "WHERE project_id = :p ORDER BY ingested_at"
            ),
            {"p": destination["project"]["id"]},
        ).mappings().all()
    assert len(rows) == 3
    assert rows[0]["source_product"] == "sikstack" and rows[0]["user_id"] is None
    assert list(rows[0]["tags"]) == ["sikstack", f"install:{anonymous['install_id']}"]
    assert rows[0]["attributes"] == {"install_id": anonymous["install_id"], "plugin_version": "1.0.0"}
    assert rows[2]["message"] == "sign-in opened the page" and rows[2]["user_id"] == owner["user"]["id"]
    assert rows[2]["attributes"]["account_email"] == owner["user"]["email"]


# --- dormant and the migration -----------------------------------------------------


def test_every_install_route_is_dormant_without_a_database(tmp_path, monkeypatch):
    (tmp_path / "docs").mkdir()
    monkeypatch.setenv("KB_ROOT", str(tmp_path))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "data" / "kb.sqlite3"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("KB_INSTALL_FEEDBACK_PROJECT_ID", str(uuid4()))
    from server.main import app

    with TestClient(app) as client:
        for path in ("/api/installs", "/api/installs/sign-in", "/api/installs/sign-in/poll", "/api/installs/feedback"):
            assert client.post(path, json={}).status_code == 404, path
        assert client.get("/app/connect/AAAA-AAAA").status_code == 404


def test_the_installs_migration_applies_on_a_fresh_database(monkeypatch):
    if not _RAW_DSN:
        pytest.skip("set KB_TEST_DATABASE_URL to a disposable Postgres to run the migration test")
    ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    if not ini.is_file():
        pytest.skip("no alembic/ here (the plugin template ships none)")
    from alembic import command
    from alembic.autogenerate import compare_metadata
    from alembic.config import Config
    from alembic.migration import MigrationContext

    from server.persistence import models  # noqa: F401
    from server.persistence.base import Base

    base = make_url(_url(_RAW_DSN))
    name = f"kb_inst_{uuid4().hex[:10]}"
    admin = create_engine(base.render_as_string(hide_password=False), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    except Exception as exc:  # pragma: no cover - environment dependent
        admin.dispose()
        pytest.skip(f"cannot create a scratch database: {exc}")
    url = base.set(database=name).render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = Config(str(ini))
    tables = ["installs", "install_sign_ins"]
    engine = create_engine(url)
    count = text("SELECT count(*) FROM pg_tables WHERE tablename = ANY(:t)")
    try:
        command.upgrade(cfg, "head")
        with engine.connect() as conn:
            assert conn.execute(count, {"t": tables}).scalar_one() == 2
            assert compare_metadata(
                MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata
            ) == []
        command.downgrade(cfg, "0011_workspace_store")
        with engine.connect() as conn:
            assert conn.execute(count, {"t": tables}).scalar_one() == 0
        command.upgrade(cfg, "head")
    finally:
        engine.dispose()
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_a_code_is_eight_characters_without_look_alikes():
    from server.installs_api import CODE_ALPHABET, normalize_code, shown_code

    assert not set("0O1ILUV") & set(CODE_ALPHABET)
    assert normalize_code(" kq4m-7tzp ") == "KQ4M7TZP" and shown_code("KQ4M7TZP") == "KQ4M-7TZP"
    for bad in ("KQ4M-7TZ", "KQ4M-7TZ0", "", "KQ4M-7TZPP"):
        assert normalize_code(bad) is None
    assert UUID(int=0)  # the module imports clean without a database
