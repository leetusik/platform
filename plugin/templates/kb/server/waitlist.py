"""The sign-up waitlist: its two mails and the operator's command.

With ``KB_SIGNUP_WAITLIST`` on, ``/auth/signup`` creates the account ``waitlisted``
(``users.status``, 0010) and mints no session; the account signs in only once the
operator approves it here. Run on the box as::

    docker compose exec api python -m server.waitlist list
    docker compose exec api python -m server.waitlist approve <email>

``list`` prints the waitlisted accounts, oldest first (email and created time).
``approve`` flips one ``waitlisted`` account to ``approved`` and then sends it one
approval mail. Approving an approved or unknown email changes nothing and sends
nothing. Exit codes: 0 when the account is approved (now or already), 1 for an
unknown email or a missing ``DATABASE_URL``, 2 when the approval landed but its mail
failed (the approval stays; tell the person yourself).

Both mails go from ``KB_SMTP_FROM`` over ``server.feedback.notify.send_message``,
plain text. The waitlist mail is sent by sign-up after its response, best-effort
(:func:`notify_waitlisted` never raises). With SMTP unconfigured no mail is sent and
everything else works.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from email.message import EmailMessage

from server import config
from server.feedback import notify

logger = logging.getLogger(__name__)

WAITLIST_SUBJECT = "You're on the hi2vi waitlist"
WAITLIST_BODY = """\
Hi,

Your hi2vi account for {email} has been created.

hi2vi is still under development, so new accounts start on a waitlist. We will email you when your account opens.

hi2vi
"""

APPROVAL_SUBJECT = "Your hi2vi account is open"
APPROVAL_BODY = """\
Hi,

Your hi2vi account for {email} is open. Sign in at {login_url}

hi2vi
"""


def login_url() -> str:
    """The sign-in page on the site's public origin (``KB_PUBLIC_BASE_URL``)."""

    return f"{config.public_base_url()}/login"


def _message(subject: str, body: str, to_email: str) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.smtp_from() or ""
    message["To"] = to_email
    message.set_content(body)
    return message


def render_waitlist_message(to_email: str) -> EmailMessage:
    """The mail a new waitlisted account gets: created, under development, on the list."""

    return _message(WAITLIST_SUBJECT, WAITLIST_BODY.format(email=to_email), to_email)


def render_approval_message(to_email: str) -> EmailMessage:
    """The one mail an approved account gets: open, sign in at the site."""

    body = APPROVAL_BODY.format(email=to_email, login_url=login_url())
    return _message(APPROVAL_SUBJECT, body, to_email)


async def notify_waitlisted(email: str) -> None:
    """Send the waitlist mail; never raises (scheduled after sign-up's response)."""

    if not config.smtp_configured():
        logger.info("SMTP is not configured; no waitlist mail for %s", email)
        return
    try:
        await asyncio.to_thread(notify.send_message, render_waitlist_message(email))
    except Exception:  # best-effort: a mail never fails or delays a sign-up
        logger.exception("Waitlist mail to %s failed; dropped", email)


# --- the operator's command -------------------------------------------------------


async def list_waitlisted():
    """The waitlisted accounts, oldest first."""

    from server.accounts.service import get_accounts_service
    from server.accounts.types import USER_WAITLISTED

    return await get_accounts_service().list_users_by_status(USER_WAITLISTED)


async def approve(email: str) -> int:
    """Approve one waitlisted account and mail it once; the command's exit code."""

    from server.accounts.service import get_accounts_service
    from server.accounts.types import USER_APPROVED, USER_WAITLISTED

    email = email.strip().lower()
    service = get_accounts_service()
    user = await service.get_user_by_email(email)
    if user is None:
        print(f"no account for {email}: nothing changed, no mail sent", file=sys.stderr)
        return 1
    flipped = await service.update_user_status(
        email, from_status=USER_WAITLISTED, to_status=USER_APPROVED
    )
    if flipped is None:
        print(f"{email} is already approved: nothing changed, no mail sent")
        return 0
    print(f"approved {email}")

    if not config.smtp_configured():
        print("no approval mail sent: SMTP is not configured (KB_SMTP_HOST, KB_SMTP_FROM)")
        return 0
    try:
        await asyncio.to_thread(notify.send_message, render_approval_message(email))
    except Exception as exc:
        print(
            f"the approval stands, but the approval mail to {email} failed: {exc!r}",
            file=sys.stderr,
        )
        return 2
    print(f"approval mail sent to {email}")
    return 0


async def _run(args: argparse.Namespace) -> int:
    from server.persistence.engine import dispose_engine

    try:
        if args.command == "list":
            users = await list_waitlisted()
            if not users:
                print("no waitlisted accounts")
            for user in users:
                print(f"{user.email}\t{user.created_at.isoformat()}")
            return 0
        return await approve(args.email)
    finally:
        # The CLI is not the app lifespan, so dispose the engine ourselves.
        await dispose_engine()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m server.waitlist", description="The sign-up waitlist."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="the waitlisted accounts, oldest first")
    approve_cmd = commands.add_parser("approve", help="approve one account and mail it")
    approve_cmd.add_argument("email")
    args = parser.parse_args(argv)

    if not config.database_url():
        print(
            "set DATABASE_URL (the waitlist lives in the Postgres accounts plane, "
            "e.g. postgresql+psycopg://kb:pass@host:5432/kb)",
            file=sys.stderr,
        )
        return 1
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
