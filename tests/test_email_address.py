"""The account-email rule (``server.email_address``): exactly one plain address.

Pure: no database. The sign-up route and the waitlist mailer both apply this rule;
``tests/test_waitlist.py`` proves it at the route (422, no row, no mail) and at the
mailer (a recording SMTP stand-in).
"""

from __future__ import annotations

import pytest

from server.email_address import MAX_LENGTH, is_plain_address

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
    "a@b .invalid",
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
    "a" * (MAX_LENGTH + 1 - len("@victim.invalid")) + "@victim.invalid",
    "noor@example",
]
ACCEPTED = [
    "five@victim.invalid",
    "review-wait@p58.test",
    "a+b@c.invalid",
    "a@mail.sub.victim.invalid",
    "a@my-host.victim.invalid",
    "a.b@c.invalid",
    "a" * (MAX_LENGTH - len("@victim.invalid")) + "@victim.invalid",
]


@pytest.mark.parametrize("value", REFUSED)
def test_refused(value):
    assert not is_plain_address(value)


@pytest.mark.parametrize("value", ACCEPTED)
def test_accepted(value):
    assert is_plain_address(value)


def test_the_length_cases_sit_on_the_limit():
    assert len(REFUSED[-2]) == 255 and len(ACCEPTED[-1]) == 254


@pytest.mark.parametrize("value", ACCEPTED)
def test_an_accepted_address_renders_one_recipient(value):
    from server.waitlist import render_waitlist_message

    message = render_waitlist_message(value)
    assert message.get_all("To") == [value]


@pytest.mark.parametrize("value", REFUSED)
def test_a_refused_address_renders_no_mail(value):
    from server.waitlist import NotOneAddressError, render_approval_message

    with pytest.raises(NotOneAddressError):
        render_approval_message(value)
