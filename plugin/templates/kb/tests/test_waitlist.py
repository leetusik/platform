"""The sign-up waitlist (``users.status``, ``KB_SIGNUP_WAITLIST``): Postgres-gated.

A waitlisted account never holds a session: sign-up with the switch on mints none,
sign-in with the right password mints none, and every session resolver refuses a
token that belongs to one (the token is inserted directly, since no endpoint mints
it). ``python -m server.waitlist approve`` flips the account and sends one mail.
Runs only with ``KB_TEST_DATABASE_URL`` (or ``DATABASE_URL``) set, like the other
accounts suites; ``smtplib`` is never reached (the send is monkeypatched).
"""

from __future__ import annotations

import os
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, make_url, text

_RAW_DSN = os.environ.get("KB_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
SMTP_ENV = ("KB_SMTP_HOST", "KB_SMTP_PORT", "KB_SMTP_USER", "KB_SMTP_PASSWORD", "KB_SMTP_FROM")
PASSWORD = "hunter2pass"


@pytest.fixture
def wl(tmp_path, monkeypatch):
    """A TestClient on a Postgres accounts plane, SMTP configured but faked."""

    if not _RAW_DSN:
        pytest.skip(
            "set KB_TEST_DATABASE_URL (or DATABASE_URL) to a disposable Postgres to "
            "run the waitlist tests"
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

    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "data" / "kb.sqlite3"))
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("KB_AUTH_RATE_LIMIT", "0")
    for name in SMTP_ENV:
        monkeypatch.delenv(name, raising=False)
    # Configured, so every mail reaches the (faked) send.
    monkeypatch.setenv("KB_SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("KB_SMTP_FROM", "hi@example.com")
    monkeypatch.setenv("KB_PUBLIC_BASE_URL", "https://kb.example.com")

    import server.feedback.notify as notify
    import server.persistence.engine as engine_mod

    sent: list = []
    monkeypatch.setattr(notify, "send_message", lambda message: sent.append(message))
    engine_mod._engine = None
    engine_mod._session_maker = None

    from server.main import app

    with TestClient(app) as client:
        client.sent = sent  # type: ignore[attr-defined]
        client.db = sync_engine  # type: ignore[attr-defined]
        yield client

    engine_mod._engine = None
    engine_mod._session_maker = None
    sync_engine.dispose()


def _email() -> str:
    return f"P58-{uuid4().hex}@Example.com"


def _status(client, email: str) -> str:
    with client.db.connect() as conn:
        return conn.execute(
            text("SELECT status FROM users WHERE email = :e"), {"e": email.lower()}
        ).scalar_one()


def _token_count(client, email: str) -> int:
    with client.db.connect() as conn:
        return conn.execute(
            text(
                "SELECT count(*) FROM auth_tokens t JOIN users u ON u.id = t.user_id "
                "WHERE u.email = :e"
            ),
            {"e": email.lower()},
        ).scalar_one()


def _waitlisted(client, monkeypatch) -> str:
    """A fresh waitlisted account, made through sign-up with the switch on."""

    monkeypatch.setenv("KB_SIGNUP_WAITLIST", "on")
    email = _email()
    res = client.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert res.status_code == 202, res.text
    monkeypatch.delenv("KB_SIGNUP_WAITLIST")
    client.sent.clear()
    return email.lower()


def test_switch_on_signup_answers_waitlisted_and_mints_no_token(wl, monkeypatch):
    monkeypatch.setenv("KB_SIGNUP_WAITLIST", "on")
    email = _email()
    res = wl.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert res.status_code == 202, res.text
    assert res.json() == {"status": "waitlisted", "email": email.lower()}
    assert _status(wl, email) == "waitlisted"
    assert _token_count(wl, email) == 0
    with wl.db.connect() as conn:  # the org and project are provisioned as today
        orgs = conn.execute(
            text(
                "SELECT count(*) FROM tenant_members m JOIN users u ON u.id = m.user_id "
                "JOIN projects p ON p.tenant_id = m.tenant_id WHERE u.email = :e"
            ),
            {"e": email.lower()},
        ).scalar_one()
    assert orgs == 1
    # One waitlist mail, after the response.
    assert len(wl.sent) == 1
    mail = wl.sent[0]
    assert mail["To"] == email.lower() and mail["From"] == "hi@example.com"
    assert "waitlist" in mail.get_content()
    # A taken email answers as today, waitlisted or not.
    again = wl.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert again.status_code == 409


def test_switch_off_signup_is_todays(wl, monkeypatch):
    monkeypatch.delenv("KB_SIGNUP_WAITLIST", raising=False)
    email = _email()
    res = wl.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert res.status_code == 201, res.text
    body = res.json()
    assert set(body) == {"token", "user", "tenant", "project"} and body["token"]
    assert _status(wl, email) == "approved"
    assert wl.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"}).status_code == 200
    assert wl.sent == []


@pytest.mark.parametrize("switch", ["on", None])
def test_waitlisted_signin_never_gets_a_token(wl, monkeypatch, switch):
    email = _waitlisted(wl, monkeypatch)
    if switch:
        monkeypatch.setenv("KB_SIGNUP_WAITLIST", switch)

    right = wl.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert right.status_code == 403, right.text
    assert right.json() == {"detail": "waitlisted", "status": "waitlisted", "email": email}
    assert "token" not in right.json()
    assert _token_count(wl, email) == 0

    wrong = wl.post("/auth/login", json={"email": email, "password": "wrong-password"})
    unknown = wl.post("/auth/login", json={"email": _email(), "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "invalid email or password"}
    assert wl.sent == []


def _insert_session(client, email: str) -> str:
    from server.accounts.security import generate_opaque_token, sha256_hex
    from server.persistence.models import utc_now

    raw = generate_opaque_token()
    with client.db.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO auth_tokens (id, user_id, token_hash, expires_at) "
                "SELECT :id, id, :h, :exp FROM users WHERE email = :e"
            ),
            {"id": uuid4(), "h": sha256_hex(raw), "exp": utc_now() + timedelta(days=1), "e": email},
        )
    return raw


def _request(token: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )


def test_every_session_resolver_refuses_a_waitlisted_user(wl, monkeypatch):
    from server.accounts.auth import AuthError, optional_user, require_user
    from server.api_auth import _resolve_tenant_bearer

    email = _waitlisted(wl, monkeypatch)
    token = _insert_session(wl, email)

    with pytest.raises(AuthError):
        wl.portal.call(require_user, _request(token))
    assert wl.portal.call(optional_user, _request(token)) is None
    assert wl.portal.call(_resolve_tenant_bearer, token, _request(token)) is None
    me = wl.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401 and me.json() == {"detail": "Unauthorized"}
    api = wl.get("/api/documents", headers={"Authorization": f"Bearer {token}"})
    assert api.status_code == 401

    # The same token resolves once the account is approved: the refusal is the status.
    with wl.db.begin() as conn:
        conn.execute(text("UPDATE users SET status = 'approved' WHERE email = :e"), {"e": email})
    assert wl.portal.call(require_user, _request(token)).user.email == email
    assert wl.portal.call(optional_user, _request(token)) is not None
    assert wl.portal.call(_resolve_tenant_bearer, token, _request(token)) is not None


def test_approve_flips_once_and_mails_once(wl, monkeypatch, capsys):
    from server import waitlist

    first = _waitlisted(wl, monkeypatch)
    second = _waitlisted(wl, monkeypatch)
    listed = [u.email for u in wl.portal.call(waitlist.list_waitlisted)]
    assert listed.index(first) < listed.index(second)  # oldest first

    assert wl.portal.call(waitlist.approve, first) == 0
    assert _status(wl, first) == "approved"
    assert len(wl.sent) == 1
    mail = wl.sent[0]
    assert mail["To"] == first and mail["From"] == "hi@example.com"
    assert "https://kb.example.com/login" in mail.get_content()
    assert first not in [u.email for u in wl.portal.call(waitlist.list_waitlisted)]

    assert wl.portal.call(waitlist.approve, first) == 0  # already approved: nothing
    assert len(wl.sent) == 1
    assert "already approved" in capsys.readouterr().out

    unknown = _email().lower()
    assert wl.portal.call(waitlist.approve, unknown) != 0
    assert len(wl.sent) == 1
    with wl.db.connect() as conn:
        assert conn.execute(
            text("SELECT count(*) FROM users WHERE email = :e"), {"e": unknown}
        ).scalar_one() == 0

    # Approved now, the account signs in with a token.
    login = wl.post("/auth/login", json={"email": first, "password": PASSWORD})
    assert login.status_code == 200 and login.json()["token"]


def test_a_failed_approval_mail_keeps_the_approval(wl, monkeypatch, capsys):
    import server.feedback.notify as notify
    from server import waitlist

    email = _waitlisted(wl, monkeypatch)

    def boom(message):
        raise OSError("smtp down")

    monkeypatch.setattr(notify, "send_message", boom)
    code = wl.portal.call(waitlist.approve, email)
    assert code != 0
    assert _status(wl, email) == "approved"
    assert "mail" in capsys.readouterr().err


def test_a_failed_waitlist_mail_never_fails_the_signup(wl, monkeypatch):
    import server.feedback.notify as notify

    def boom(message):
        raise OSError("smtp down")

    monkeypatch.setattr(notify, "send_message", boom)
    monkeypatch.setenv("KB_SIGNUP_WAITLIST", "true")
    email = _email()
    res = wl.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert res.status_code == 202, res.text
    assert res.json() == {"status": "waitlisted", "email": email.lower()}
    assert _status(wl, email) == "waitlisted"
    assert _token_count(wl, email) == 0
