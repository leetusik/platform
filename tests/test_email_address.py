"""The account-email rule (``server.email_address``): exactly one plain address.

Pure: no database. The sign-up route and the waitlist mailer both apply this rule;
``tests/test_waitlist.py`` proves it at the route (422, no row, no mail) and at the
mailer (a recording SMTP stand-in).
"""

from __future__ import annotations

import smtplib

import pytest

from server.email_address import MAX_LENGTH, is_plain_address

TOO_LONG = "a" * (MAX_LENGTH + 1 - len("@victim.invalid")) + "@victim.invalid"
LONGEST = "a" * (MAX_LENGTH - len("@victim.invalid")) + "@victim.invalid"

# RFC 2047 encoded words: the raw string looks like one address, but the mail's
# ``To:`` decodes the word into another recipient, or several.
ENCODED_WORDS = [
    "a@=?utf-8?q?evil.example=2C_c=40x?=.invalid",  # To: a@evil.example, c@x.invalid
    "=?utf-8?q?a=2C_b=40evil.example?=@victim.invalid",
    "=?UTF-8?Q?a=2C_b=40evil.example?=@victim.invalid",
    "=?utf-8?b?YSwgYkBldmlsLmV4YW1wbGU=?=@victim.invalid",  # b: "a, b@evil.example"
    "=?utf-8?b?yswgykbldmlslmv4yw1wbgu=?=@victim.invalid",  # the same, lowercased
    "=?utf-8?q?claim_your_prize?=@victim.invalid",
    "=?utf-8?q?Claim_your_prize?=@victim.invalid",
    "=?utf-8?q?a?=@victim.invalid",  # decodes to another plain address
    "=?bogus?q?a=2C_b=40c.invalid?=@victim.invalid",  # unknown charset, still decoded
]

REFUSED = [
    "one@victim.invalid, two@victim.invalid, three@victim.invalid",
    "one@victim.invalid,two@victim.invalid",
    "one@victim.invalid; two@victim.invalid",
    '"claim prize" <three@victim.invalid>',
    "name <a@b.invalid>",
    "<a@b.invalid>",
    "a(comment)@b.invalid",
    "six@victim.invalid\r\nbcc: seven@victim.invalid",
    "six@victim.invalid\nseven@victim.invalid",
    "six@victim.invalid\r",
    "a\x00@b.invalid",
    "a b@victim.invalid",
    "a\tb@victim.invalid",
    "a@b .invalid",
    "x:a@b.invalid,c@d.invalid;",
    "a@b@victim.invalid",
    "a[1]@b.invalid",
    "a\\b@c.invalid",
    "@victim.invalid",
    "a@",
    "@",
    "",
    "plain",
    "a@.invalid",
    "a@b..invalid",
    "a@b.invalid.",
    TOO_LONG,
    "noor@example",
    *ENCODED_WORDS,
]
# Odd but single: each is one envelope recipient, exactly the string, so the rule
# keeps them (the rule bounds the recipients, not what a mailbox may be called).
ACCEPTED = [
    "five@victim.invalid",
    "review-wait@p58.test",
    "a+b@c.invalid",
    "a@mail.sub.victim.invalid",
    "a@my-host.victim.invalid",
    "a.b@c.invalid",
    LONGEST,
    "ü@x.invalid",
    "a@münchen.invalid",
    "a%x@relay.invalid",
    "evil!a@relay.invalid",
    "|cmd@x.invalid",
    "a=?b@victim.invalid",  # not an encoded word: the header keeps it as written
]


@pytest.mark.parametrize("value", REFUSED)
def test_refused(value):
    assert not is_plain_address(value)


@pytest.mark.parametrize("value", ACCEPTED)
def test_accepted(value):
    assert is_plain_address(value)


def test_the_length_cases_sit_on_the_limit():
    assert len(TOO_LONG) == 255 and len(LONGEST) == 254


@pytest.fixture
def rcpt(monkeypatch):
    """A recording SMTP stand-in: the real ``send_message`` up to RCPT, nothing sent.

    SMTP counts as configured, but the stand-in opens no connection; it records
    the recipient list ``smtplib.SMTP.send_message`` derives, one list per mail.
    """

    from server import config

    recorded: list[list[str]] = []

    class RecordingSMTP:
        send_message = smtplib.SMTP.send_message

        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self, **kwargs):
            pass

        def ehlo_or_helo_if_needed(self):
            pass

        def has_extn(self, name):
            return name == "smtputf8"  # a server that takes non-ASCII addresses

        def sendmail(self, from_addr, to_addrs, msg, mail_options=(), rcpt_options=()):
            recorded.append(list(to_addrs))
            return {}

    monkeypatch.setattr(smtplib, "SMTP", RecordingSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", RecordingSMTP)
    monkeypatch.setattr(config, "smtp_configured", lambda: True)
    monkeypatch.delenv("KB_SMTP_USER", raising=False)
    return recorded


@pytest.mark.parametrize("value", ACCEPTED)
def test_an_accepted_address_is_mailed_to_exactly_itself(value, rcpt):
    import asyncio

    from server import waitlist

    message = waitlist.render_waitlist_message(value)
    assert [str(v) for v in message.get_all("To")] == [value]
    asyncio.run(waitlist.notify_waitlisted(value))
    assert rcpt == [[value]]


@pytest.mark.parametrize("value", REFUSED)
def test_a_refused_address_renders_no_mail(value, rcpt):
    import asyncio

    from server.waitlist import NotOneAddressError, notify_waitlisted, render_approval_message

    with pytest.raises(NotOneAddressError):
        render_approval_message(value)
    asyncio.run(notify_waitlisted(value))
    assert rcpt == []


@pytest.mark.parametrize("value", ENCODED_WORDS)
def test_the_mailer_checks_the_rendered_mail_itself(value, rcpt, monkeypatch):
    """The mailer's last check stands alone: with the rule waved through, it still
    builds no mail whose ``To:`` names anything but the one stored string."""

    import asyncio

    from server import waitlist

    monkeypatch.setattr(waitlist, "is_plain_address", lambda value: True)
    for render in (waitlist.render_waitlist_message, waitlist.render_approval_message):
        with pytest.raises(waitlist.NotOneAddressError):
            render(value)
    asyncio.run(waitlist.notify_waitlisted(value))
    assert rcpt == []
