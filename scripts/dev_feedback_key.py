"""Set up sikstack's own feedback control on a LOCAL dev stack. Never for production.

It signs up (or signs in) a local-only test account, get-or-creates the project
``sikstack``, mints a project-bound ``capture`` key for it, and writes three lines into
the web app's gitignored env file (``web/.env.local`` by default), replacing earlier
copies and keeping every other line:

    SIKSTACK_FEEDBACK_CAPTURE_KEY   the key the web server posts captures with
    SIKSTACK_DEV_TEST_EMAIL         the local test account's email
    SIKSTACK_DEV_TEST_PASSWORD      its generated password

Run it from the repo root against the local API (``uv run uvicorn server.main:app
--port 8766``), with the API's own env so a waitlisted sign-up can be approved::

    uv run --env-file .env python scripts/dev_feedback_key.py

It is idempotent: a second run signs in with the recorded credentials, finds the
project, and keeps the recorded key while it is still live (else mints a new one and
revokes the earlier dev keys it made), so the project keeps exactly one live dev key.
It goes through the API's HTTP routes (``/auth/*``, ``/app/*``); the only other path
is ``python -m server.waitlist approve`` when sign-up answers 202 (waitlist on).

Guards: the API base must be a loopback address (``127.0.0.0/8``, ``::1`` or
``localhost``) and so must ``DATABASE_URL``'s host when the waitlist path runs; the
waitlist approval runs with ``KB_SMTP_HOST`` blanked, so it mails nobody. It prints
what it did and never a key, a password or a token.

The project goes in the org of ``KB_OPERATOR_EMAIL`` when that email and
``KB_OPERATOR_PASSWORD`` are both set and sign in locally (production's choice);
otherwise in the test account's own org. The output says which.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import secrets
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = REPO_ROOT / "web" / ".env.local"
DEFAULT_API = "http://127.0.0.1:8766"

PROJECT_NAME = "sikstack"
KEY_NAME = "sikstack feedback (local dev)"
TEST_EMAILS = ("you@example.com", "dev-p69@example.com")

KEY_VAR = "SIKSTACK_FEEDBACK_CAPTURE_KEY"
EMAIL_VAR = "SIKSTACK_DEV_TEST_EMAIL"
PASSWORD_VAR = "SIKSTACK_DEV_TEST_PASSWORD"


class SetupError(RuntimeError):
    """A step failed; the message never carries a secret."""


# --- guards -----------------------------------------------------------------------


def is_loopback_host(host: str | None) -> bool:
    """True only for ``localhost`` or a literal loopback IP; any other name is refused."""

    if not host:
        return False
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def require_loopback_api(api: str) -> str:
    parts = urlsplit(api)
    if parts.scheme not in ("http", "https") or not is_loopback_host(parts.hostname):
        raise SetupError(
            f"refusing: the API base must be a loopback address, got host "
            f"{parts.hostname!r}. This script is for a local dev stack only."
        )
    return api.rstrip("/")


# --- env file ---------------------------------------------------------------------


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        values[name.strip()] = value.strip()
    return values


def write_env(path: Path, updates: dict[str, str]) -> None:
    """Replace every line setting a name in ``updates``; keep all other lines.

    The first earlier line of a name is replaced in place and any later duplicates
    are dropped, so the file ends with exactly one line per name. Written atomically,
    keeping the file's mode (``0600`` for a new file).
    """

    lines = path.read_text().splitlines() if path.exists() else []
    out: list[str] = []
    written: set[str] = set()
    for line in lines:
        stripped = line.strip()
        name = stripped.partition("=")[0].strip() if "=" in stripped else ""
        if name in updates and not stripped.startswith("#"):
            if name not in written:
                out.append(f"{name}={updates[name]}")
                written.add(name)
            continue
        out.append(line)
    missing = [name for name in updates if name not in written]
    if missing:
        out.append("# sikstack's own feedback control, local dev (scripts/dev_feedback_key.py)")
        out.extend(f"{name}={updates[name]}" for name in missing)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".env.local.")
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write("\n".join(out) + "\n")
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# --- HTTP -------------------------------------------------------------------------


def call(api: str, method: str, path: str, body: dict | None = None, token: str | None = None):
    """One JSON request; returns ``(status, parsed body or None)``. Never raises on 4xx."""

    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{api}{path}", data=data, method=method)
    request.add_header("Accept", "application/json")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = exc.code
    except urllib.error.URLError as exc:
        raise SetupError(f"cannot reach the API at {api}: {exc.reason}") from None
    try:
        parsed = json.loads(raw) if raw else None
    except ValueError:
        parsed = None
    return status, parsed


def login(api: str, email: str, password: str):
    """``(token, status)``: a token on 200, else ``None`` and the status."""

    status, body = call(api, "POST", "/auth/login", {"email": email, "password": password})
    if status == 200 and isinstance(body, dict) and body.get("token"):
        return body["token"], status
    return None, status


def approve_waitlisted(email: str) -> None:
    """Approve through the server's own waitlist command, mail off, local DB only."""

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise SetupError(
            "sign-up is waitlisted and DATABASE_URL is not set: run this with the "
            "API's env (uv run --env-file .env python scripts/dev_feedback_key.py)"
        )
    if not is_loopback_host(urlsplit(database_url).hostname):
        raise SetupError("refusing: DATABASE_URL's host is not a loopback address")
    env = dict(os.environ, KB_SMTP_HOST="")
    result = subprocess.run(
        [sys.executable, "-m", "server.waitlist", "approve", email],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SetupError(f"waitlist approval failed (exit {result.returncode})")


# --- steps ------------------------------------------------------------------------


def ensure_account(api: str, recorded: dict[str, str], say) -> tuple[str, str, str]:
    """``(email, password, token)`` of a signed-in local test account."""

    rec_email, rec_password = recorded.get(EMAIL_VAR), recorded.get(PASSWORD_VAR)
    if rec_email and rec_password:
        token, status = login(api, rec_email, rec_password)
        if token:
            say(f"test account: signed in as {rec_email} (recorded credentials)")
            return rec_email, rec_password, token
        if status == 403:
            approve_waitlisted(rec_email)
            token, status = login(api, rec_email, rec_password)
            if token:
                say(f"test account: approved {rec_email} on the waitlist, signed in")
                return rec_email, rec_password, token
        say(f"test account: the recorded credentials for {rec_email} do not sign in")

    for email in TEST_EMAILS:
        password = secrets.token_urlsafe(18)
        status, body = call(api, "POST", "/auth/signup", {"email": email, "password": password})
        if status == 409:
            say(f"test account: {email} already exists here with a password not on record; trying the next")
            continue
        if status == 201 and isinstance(body, dict) and body.get("token"):
            say(f"test account: created {email}")
            return email, password, body["token"]
        if status == 202:
            approve_waitlisted(email)
            token, status = login(api, email, password)
            if token:
                say(f"test account: created {email}, approved it on the waitlist, signed in")
                return email, password, token
            raise SetupError(f"{email}: sign-in after approval answered {status}")
        raise SetupError(f"{email}: sign-up answered {status}")
    raise SetupError(
        "every test email already exists with an unknown password: "
        + ", ".join(TEST_EMAILS)
    )


def choose_org_token(api: str, test_token: str, say) -> str:
    """The session whose org receives the project (see the module docstring)."""

    operator_email = os.environ.get("KB_OPERATOR_EMAIL", "").strip()
    operator_password = os.environ.get("KB_OPERATOR_PASSWORD", "")
    if operator_email and operator_password:
        token, _status = login(api, operator_email, operator_password)
        if token:
            say(f"org: the KB_OPERATOR_EMAIL org ({operator_email}), production's choice")
            return token
        say("org: KB_OPERATOR_EMAIL does not sign in locally; using the test account's org")
    else:
        say("org: no local operator account (KB_OPERATOR_EMAIL/KB_OPERATOR_PASSWORD unset); "
            "using the test account's own org")
    return test_token


def ensure_project(api: str, token: str, say) -> str:
    status, body = call(api, "GET", "/app/projects", token=token)
    if status != 200:
        raise SetupError(f"listing projects answered {status}")
    existed = any(p.get("name") == PROJECT_NAME for p in body.get("projects", []))
    status, body = call(api, "POST", "/app/projects", {"name": PROJECT_NAME}, token=token)
    if status != 201:
        raise SetupError(f"creating the project answered {status}")
    project_id = body["project"]["id"]
    say(f"project: {'found' if existed else 'created'} {PROJECT_NAME!r} ({project_id})")
    return project_id


def ensure_key(api: str, token: str, project_id: str, recorded_key: str | None, say) -> str:
    """Keep the recorded key while live; else mint one. Revoke every other dev key."""

    base = f"/app/projects/{project_id}/credentials"
    status, body = call(api, "GET", base, token=token)
    if status != 200:
        raise SetupError(f"listing the project's keys answered {status}")
    live = [c for c in body.get("credentials", []) if c.get("revoked_at") is None]

    kept_id = None
    key = None
    if recorded_key:
        for cred in live:
            if cred.get("token_prefix") == recorded_key[:12] and cred.get("scope") == "capture":
                kept_id, key = cred["id"], recorded_key
                say(f"key: kept the recorded capture key ({kept_id})")
                break
    if key is None:
        status, body = call(api, "POST", base, {"name": KEY_NAME, "scope": "capture"}, token=token)
        if status != 201 or body.get("credential", {}).get("scope") != "capture":
            raise SetupError(f"minting the capture key answered {status}")
        kept_id, key = body["credential"]["id"], body["key"]
        if body["credential"].get("project_id") != project_id:
            raise SetupError("the minted key is not bound to the project")
        say(f"key: minted a project-bound capture key ({kept_id})")

    for cred in live:
        if cred.get("name") == KEY_NAME and cred["id"] != kept_id:
            status, _ = call(api, "DELETE", f"{base}/{cred['id']}", token=token)
            if status != 204:
                raise SetupError(f"revoking an earlier dev key answered {status}")
            say(f"key: revoked an earlier dev key ({cred['id']})")
    return key


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE,
                        help="the web app's gitignored env file (default: web/.env.local)")
    parser.add_argument("--api", default=None,
                        help="the local API base (default: KB_API_BASE_URL from the env file, "
                             f"else {DEFAULT_API})")
    args = parser.parse_args(argv)

    env_path: Path = args.env_file.resolve()
    recorded = read_env(env_path)
    try:
        api = require_loopback_api(args.api or recorded.get("KB_API_BASE_URL") or DEFAULT_API)
        print(f"api: {api}")
        email, password, token = ensure_account(api, recorded, print)
        org_token = choose_org_token(api, token, print)
        project_id = ensure_project(api, org_token, print)
        key = ensure_key(api, org_token, project_id, recorded.get(KEY_VAR), print)
        write_env(env_path, {KEY_VAR: key, EMAIL_VAR: email, PASSWORD_VAR: password})
    except SetupError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"wrote {KEY_VAR}, {EMAIL_VAR}, {PASSWORD_VAR} to {env_path} (values not shown)")
    print("restart the web dev server so it reads the new key")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
