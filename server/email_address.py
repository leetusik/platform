"""The one rule for an account email: exactly one plain address.

Sign-up stores the email and the waitlist mails it, so a string that names more
than one address (``a@x, b@y``, a group ``g:a@x,b@y;``) or carries a display name
(``"Prize" <a@x>``) would make ``smtplib`` mail every address it names. The rule
refuses those before any row exists; ``server.waitlist`` applies it again before
any mail goes.

An address passes when, as given (callers trim and lowercase first):

- it is at most 254 characters, with exactly one ``@`` and a non-empty local part
  and domain;
- it holds no whitespace, no control character, and none of ``, ; : < > ( ) [ ] " \\``;
- its domain is dot-separated labels with no empty label, and at least one dot
  (``noor@example`` is refused: a sign-up names a mailable domain);
- ``email.utils.getaddresses`` reads it back as itself, alone and unnamed.

Cases (``tests/test_email_address.py`` holds them all): ``five@victim.invalid``,
``a+b@c.invalid``, ``a@mail.sub.example.com`` and ``a@my-host.example.com`` pass;
``a@x.invalid, b@y.invalid``, ``a@x.invalid; b@y.invalid``, ``Name <a@x.invalid>``,
``a b@x.invalid``, ``a@b@x.invalid``, ``@x.invalid``, ``a@``, ``a@x..invalid``,
``noor@example`` and anything with a CR or LF are refused.
"""

from __future__ import annotations

import unicodedata
from email.utils import getaddresses

MAX_LENGTH = 254
_FORBIDDEN = frozenset(',;:<>()[]"\\')


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
    return getaddresses([value]) == [("", value)]
