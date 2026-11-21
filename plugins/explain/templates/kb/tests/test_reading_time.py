"""A document's reading time: the formula, and the stored column across a reindex.

The formula (``server/reading_time.py``): words a minute for space-separated scripts,
characters a minute for Korean and the other unspaced scripts, summed, rounded up to a
whole minute, never under one. The column is written by every upsert (publish and
reindex alike) and back-filled once on a store that predates it.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from server import db, reading_time, reindex

WPM = reading_time.WORDS_PER_MINUTE
CPM = reading_time.CHARS_PER_MINUTE


def _words(n: int) -> str:
    return " ".join(f"word{i}" for i in range(n))


def _hangul(n: int) -> str:
    # 가 to 힣 cycled, broken by spaces every 4 syllables as Korean is written: the
    # spaces never count, only the syllables do.
    syllables = [chr(0xAC00 + (i * 37) % 11172) for i in range(n)]
    return " ".join("".join(syllables[i : i + 4]) for i in range(0, n, 4))


def test_the_constants_are_the_recorded_ones():
    assert (WPM, CPM) == (230, 500)


def test_english_boundaries():
    assert reading_time.minutes("") == 1  # empty: the floor
    assert reading_time.minutes("one") == 1  # one word
    assert reading_time.minutes(_words(WPM)) == 1  # exactly one minute
    assert reading_time.minutes(_words(WPM + 1)) == 2  # one over
    assert reading_time.minutes(_words(6 * WPM)) == 6
    assert reading_time.minutes(_words(6 * WPM + 1)) == 7


def test_korean_counts_characters_not_words():
    body = _hangul(CPM)
    assert len(body.split()) == CPM // 4  # 125 "words" by spaces...
    assert reading_time.minutes(body) == 1  # ...but 500 syllables: exactly one minute
    assert reading_time.minutes(_hangul(CPM + 1)) == 2  # one over
    assert reading_time.minutes(_hangul(4 * CPM)) == 4


def test_mixed_scripts_add_up():
    # Half a minute of English and half a minute of Korean is one minute, not two.
    body = _words(WPM // 2) + "\n\n" + _hangul(CPM // 2)
    assert reading_time.minutes(body) == 1
    assert reading_time.minutes(body + " extra") == 2


def test_markdown_addresses_and_markup_are_not_read():
    # 230 words of prose, plus a link address, an image, an html tag, a comment and a
    # bare URL: only the prose and the link's own text count.
    prose = _words(WPM - 2)
    body = (
        f"# Title here\n\n{prose}\n\n"
        "[a link](https://example.com/one/two/three-four) "
        "![a figure of many words](figures/a-b-c.png) "
        "<span class=\"x y z\">ok</span> <!-- a hidden note of six words --> "
        "https://example.com/more/path/words\n"
    )
    # words: "Title here" (2) + prose (228) + "a link" (2) + "ok" (1) = 233 -> 2 min.
    assert reading_time.counts(body, "md") == (233, 0)
    assert reading_time.minutes(body, "md") == 2
    # The same text as plain text (an html document's extraction, a native chapter's
    # projection) is read as it stands: the addresses' parts are words there.
    assert reading_time.counts(body, "native")[0] > 233


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def _doc(title: str, body: str) -> str:
    return f'---\ntitle: "{title}"\ndate: 2026-07-02\ntags: []\n---\n\n{body}\n'


def test_the_column_is_written_on_upsert_and_survives_a_reindex(tmp_path, monkeypatch):
    monkeypatch.setenv("KB_ROOT", str(tmp_path))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "data" / "kb.sqlite3"))
    docs = tmp_path / "docs"
    _write(docs / "proj" / "2026-07-02-en.md", _doc("English", _words(3 * WPM + 1)))
    _write(docs / "proj" / "2026-07-02-ko.md", _doc("Korean", _hangul(2 * CPM)))

    assert reindex.reindex()["indexed"] == 2
    conn = db.connect()
    try:
        got = dict(conn.execute("SELECT slug, reading_minutes FROM documents").fetchall())
    finally:
        conn.close()
    assert got == {"en": 4, "ko": 2}

    # Wipe the disposable store and rebuild it from disk: the same minutes come back.
    for f in (tmp_path / "data").iterdir():
        f.unlink()
    assert reindex.reindex()["indexed"] == 2
    conn = db.connect()
    try:
        again = dict(conn.execute("SELECT slug, reading_minutes FROM documents").fetchall())
    finally:
        conn.close()
    assert again == got


def test_a_store_that_predates_the_column_is_back_filled(tmp_path):
    path = tmp_path / "old.sqlite3"
    conn = db.connect(path)
    db.upsert_document(
        conn, project="p", slug="s", date="2026-07-02", title="T", tags=[],
        source_repo=None, rel_path="p/2026-07-02-s.md", markdown=_words(2 * WPM + 5),
    )
    conn.close()
    # Make it an old store: drop the column (SQLite >= 3.35).
    raw = sqlite3.connect(str(path))
    raw.execute("ALTER TABLE documents DROP COLUMN reading_minutes")
    raw.commit()
    raw.close()

    conn = db.connect(path)  # init_db adds the column and fills it
    try:
        row = conn.execute("SELECT reading_minutes FROM documents").fetchone()
    finally:
        conn.close()
    assert row["reading_minutes"] == 3
