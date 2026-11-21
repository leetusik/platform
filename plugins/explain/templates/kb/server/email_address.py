"""The one rule for an account email: exactly one plain address.

Sign-up stores the email and the waitlist mails it, so a string that names more
than one address (``a@x, b@y``, a group ``g:a@x,b@y;``), carries a display name
(``"Prize" <a@x>``) or hides either in an RFC 2047 encoded word
(``a@=?utf-8?q?x=2C_b=40y?=.z``, which a mail's ``To:`` decodes) would make
``smtplib`` mail whatever the rendered header names. The rule refuses those before
any row exists; ``server.waitlist`` asks it again before any mail goes, and reads
the mail it built back through :func:`mails_exactly` before handing it on.

An address passes when, as given (callers trim and lowercase first):

- it is at most 254 characters, with exactly one ``@`` and a non-empty local part
  and domain;
- it holds no whitespace, no control character, and none of ``, ; : < > ( ) [ ] " \\``;
- its domain is dot-separated labels with no empty label, and at least one dot
  (``noor@example`` is refused: a sign-up names a mailable domain);
- a mail addressed to it, built as the waitlist mailer builds one, reaches exactly
  one recipient, unnamed and equal to the string (:func:`mails_exactly`). That
  last step is what the mailer itself checks, so the two can never disagree.

The rule bounds the recipients, not what a mailbox may be called: a single odd
address that a mail reaches as written (``ü@x.invalid``, ``a%x@relay.invalid``,
``evil!a@relay.invalid``, ``|cmd@x.invalid``, ``a=?b@x.invalid``) passes.

Cases (``tests/test_email_address.py`` holds them all): ``five@victim.invalid``,
``a+b@c.invalid``, ``a@mail.sub.example.com`` and ``a@my-host.example.com`` pass;
``a@x.invalid, b@y.invalid``, ``a@x.invalid; b@y.invalid``, ``Name <a@x.invalid>``,
``a b@x.invalid``, ``a@b@x.invalid``, ``@x.invalid``, ``a@``, ``a@x..invalid``,
``noor@example``, anything with a CR or LF and any encoded word the header decodes
(``=?utf-8?q?claim_your_prize?=@x.invalid``) are refused.
"""

from __future__ import annotations

import unicodedata
from email.message import EmailMessage
from email.utils import getaddresses

MAX_LENGTH = 254
_FORBIDDEN = frozenset(',;:<>()[]"\\')
# Every header ``smtplib.SMTP.send_message`` may take recipients from.
RECIPIENT_HEADERS = ("To", "Cc", "Bcc", "Resent-To", "Resent-Cc", "Resent-Bcc")


def mails_exactly(message: EmailMessage, address: str) -> bool:
    """True when ``message`` goes to ``address`` alone, unnamed.

    Reads the rendered recipient headers the way ``smtplib.SMTP.send_message``
    derives its envelope (``email.utils.getaddresses`` over their string values,
    which ``EmailMessage`` has already decoded), not the header's own
    ``addresses``, which can disagree with ``smtplib`` (``a@=?utf-8?q?x=2C_c=40y?=.z``
    is one ``Address`` there, two recipients for ``smtplib``).
    """

    fields = [str(v) for name in RECIPIENT_HEADERS for v in message.get_all(name, [])]
    return getaddresses(fields) == [("", address)]


def is_plain_address(value: str) -> bool:
    """True when ``value`` is exactly one plain email address (the rule above)."""

    if not value or len(value) > MAX_LENGTH or value.count("@") != 1:
        return False
    for char in value:
        if char.isspace() or unicodedata.category(char) == "Cc" or char in _FORBIDDEN:
            return False
    local, domain = value.split("@")
    if not local or not domain:
        return False
    labels = domain.split(".")
    if len(labels) < 2 or not all(labels):
        return False
    probe = EmailMessage()
    try:
        probe["To"] = value  # as the mailer sets it; a decoded CR/LF raises here
    except Exception:  # noqa: BLE001 - a header that cannot be built is not one address
        return False
    return mails_exactly(probe, value)
