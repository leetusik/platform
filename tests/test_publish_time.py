"""Each version's own publish time (P63, D171-qk).

A publish stamps ``published: "<UTC time>"`` into the version's header, the archive
keeps it with the body, and reindex re-derives it from the file alone (never from a
file time), so it survives a rebuild from an empty store over a copy whose file times
are new. A file without the line reads exactly as before. ``server.published_fill``
gives the versions published before P63 one best-effort time, once.
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server import db, documents, published_fill, reindex
from server.native import parse_chapter

_REL = "alpha/2026-07-02-one.md"
_ARCHIVE_V1 = ".versions/alpha/2026-07-02-one/v0001.md"
_PAYLOAD = {
    "title": "One",
    "markdown": "# One\n\nFirst edition.\n",
    "project": "alpha",
    "tags": ["t", "u"],
    "source_repo": "repo",
    "date": "2026-07-02",
    "slug": "one",
}
_T1 = "2026-11-01T10:00:00Z"
_T2 = "2026-11-05T12:30:45Z"


def _git(root, *args):
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, check=True
    )


@pytest.fixture
def client(tmp_path, monkeypatch):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "index.md").write_text("# KB\n\n<!-- explain:recent -->\n")
    _git(tmp_path, "init")
    _git(tmp_path, "config", "user.name", "kb-test")
    _git(tmp_path, "config", "user.email", "kb-test@example.com")
    _git(tmp_path, "add", "docs/index.md")
    _git(tmp_path, "commit", "-m", "seed")
    monkeypatch.setenv("KB_ROOT", str(tmp_path))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "data" / "kb.sqlite3"))
    stamps = iter([_T1, _T2])
    monkeypatch.setattr("server.documents.now_stamp", lambda: next(stamps))
    from server.main import app

    return TestClient(app), tmp_path


def _age(root: Path) -> None:
    """Give every file a fresh time, as a clone or a plain copy does."""
    now = time.time() + 3600
    for path in root.rglob("*"):
        if path.is_file():
            os.utime(path, (now, now))


def _times(conn, rel=_REL):
    doc = db.get_document_by_path(conn, rel)
    rows = db.list_document_versions(conn, rel)
    return (
        (doc["published"], doc["published_best_effort"]),
        {r["version"]: (r["published"], r["published_best_effort"]) for r in rows},
    )


def test_a_version_carries_its_own_time_through_reindex_and_a_rebuild(client, tmp_path):
    tc, root = client
    first = tc.post("/api/documents", json=_PAYLOAD)
    assert first.status_code == 201, first.text
    assert f'published: "{_T1}"\n' in (root / "docs" / _REL).read_text()
    got = tc.get(f"/api/documents/by-path/{_REL}").json()
    assert (got["published"], got["published_best_effort"]) == (_T1, False)

    second = tc.post(
        "/api/documents",
        json={**_PAYLOAD, "new_version": True, "markdown": "# One\n\nSecond edition.\n"},
    )
    assert second.status_code == 201, second.text
    assert f'published: "{_T2}"\n' in (root / "docs" / _REL).read_text()
    # The archived v1 keeps v1's own time, in its header and in the version read.
    assert f'published: "{_T1}"\n' in (root / "docs" / _ARCHIVE_V1).read_text()
    page = tc.get(f"/api/documents/by-path/{_REL}/versions").json()
    assert [(v["version"], v["published"], v["published_best_effort"])
            for v in page["versions"]] == [(1, _T1, False)]
    assert tc.get(f"/api/documents/by-path/{_REL}").json()["published"] == _T2
    # The stamp rides the same scoped commit; nothing else is staged.
    names = set(_git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")
                .stdout.split())
    assert names == {f"docs/{_REL}", f"docs/{_ARCHIVE_V1}"}

    # A reindex in place, then a rebuild from an empty store over a copy whose file
    # times are all new: the times come from the headers, never from the files.
    conn = db.connect()
    try:
        reindex.reindex(conn=conn)
        assert _times(conn) == ((_T2, False), {1: (_T1, False)})
    finally:
        conn.close()
    copy = tmp_path / "copy"
    shutil.copytree(root / "docs", copy / "docs", copy_function=shutil.copyfile)
    _age(copy)
    fresh = db.connect(tmp_path / "fresh.sqlite3")
    try:
        reindex.reindex(conn=fresh, docs_root=copy / "docs")
        assert _times(fresh) == ((_T2, False), {1: (_T1, False)})
    finally:
        fresh.close()


def _write(path: Path, text: str, mtime: float | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    if mtime is not None:
        os.utime(path, (mtime, mtime))


def _md(title: str, date: str, body: str, version: int = 1, extra: str = "") -> str:
    v = f"version: {version}\n" if version >= 2 else ""
    return (
        f'---\ntitle: "{title}"\ndate: {date}\n{v}{extra}tags:\n  - t\n'
        f"source:\n  project: alpha\n  repo: r\n---\n\n{body}"
    )


def test_a_file_without_the_stamp_reads_as_before(tmp_path):
    docs = tmp_path / "docs"
    _write(docs / "alpha/2026-07-02-one.md", _md("One", "2026-07-02", "# One\n\nNow.\n", 2))
    _write(docs / _ARCHIVE_V1, _md("One", "2026-07-02", "# One\n\nThen.\n", 1), 1_700_000_000)
    conn = db.connect(tmp_path / "kb.sqlite3")
    try:
        report = reindex.reindex(conn=conn, docs_root=docs)
        assert report["skipped"] == []
        assert _times(conn) == ((None, False), {1: (None, False)})
        # The archive time still comes from the file, exactly as before P63.
        (row,) = db.list_document_versions(conn, _REL)
        assert row["created_at"].startswith("2023-11-1")
    finally:
        conn.close()


def test_a_malformed_stamp_is_no_time_and_never_skips_the_file(tmp_path):
    docs = tmp_path / "docs"
    _write(docs / _REL, _md("One", "2026-07-02", "# One\n", extra="published: soon\n"))
    conn = db.connect(tmp_path / "kb.sqlite3")
    try:
        assert reindex.reindex(conn=conn, docs_root=docs)["skipped"] == []
        assert _times(conn)[0] == (None, False)
    finally:
        conn.close()


def test_the_published_line_forms_parse():
    assert documents.parse_published(_T1) == (_T1, False)
    assert documents.parse_published({"at": "2026-07-02", "best_effort": True}) == (
        "2026-07-02", True,
    )
    assert documents.parse_published("2026-11-01T19:00:00+09:00") == (_T1, False)
    assert documents.parse_published("later") is None
    assert documents.parse_published({"best_effort": True}) is None


def test_a_native_header_takes_both_forms():
    content, _offset = documents.native_file_content(
        title="N", date="2026-07-02", tags=[], project="alpha", source_repo="r",
        body="Text.\n", published=_T1,
    )
    parsed = parse_chapter(content)
    assert f'published: "{_T1}"' in parsed.source
    filled = documents.set_frontmatter_published(
        content.replace(f'published: "{_T1}"\n', ""), "2026-07-02", best_effort=True
    )
    assert '"best_effort": true' in parse_chapter(filled).source


# --- the one-time fill --------------------------------------------------------

_TENANT = "0b0b0b0b-0000-4000-8000-000000000001"
_V1_STORE_TIME = "2026-10-05T09:00:00+09:00"  # the store's archive time of two's v1
_V2_MTIME = 1_760_000_000  # 2025-10-09T08:53:20Z, two's v2 archive (no store row)
_FOUR_V1_MTIME = 1_750_000_000  # 2025-06-15T15:06:40Z


def _html(title: str, date: str, body: str, version: int = 1) -> str:
    v = f"version: {version}\n" if version >= 2 else ""
    return (
        f'<!--kb\ntitle: "{title}"\ndate: {date}\n{v}tags:\n  - t\n'
        f"source:\n  project: beta\n  repo: r\n-->\n\n{body}"
    )


def _corpus(tmp_path: Path) -> tuple[Path, Path, dict[str, Path]]:
    docs = tmp_path / "kb" / "docs"
    tenant = tmp_path / "kb" / "tenants" / _TENANT
    files = {
        "one": docs / "alpha/2026-10-01-one.md",
        "two": docs / "alpha/2026-10-02-two.md",
        "two1": docs / ".versions/alpha/2026-10-02-two/v0001.md",
        "two2": docs / ".versions/alpha/2026-10-02-two/v0002.md",
        "three": docs / "alpha/2026-10-03-three.md",
        "four": tenant / "beta/2026-10-04-four.html",
        "four1": tenant / ".versions/beta/2026-10-04-four/v0001.html",
    }
    _write(files["one"], _md("One", "2026-10-01", "# One\n\nBody one.\n"))
    _write(files["two"], _md("Two", "2026-10-02", "# Two\n\nThird.\n", 3))
    _write(files["two1"], _md("Two", "2026-10-02", "# Two\n\nFirst.\n", 1), 1_759_000_000)
    _write(files["two2"], _md("Two", "2026-10-02", "# Two\n\nSecond.\n", 2), _V2_MTIME)
    _write(files["three"], _md("Three", "2026-10-03", "# Three\n", extra=f'published: "{_T1}"\n'))
    _write(files["four"], _html("Four", "2026-10-04", "<!DOCTYPE html><p>new</p>\n", 2))
    _write(files["four1"], _html("Four", "2026-10-04", "<!DOCTYPE html><p>old</p>\n"),
           _FOUR_V1_MTIME)
    return docs, tenant, files


def _store(tmp_path: Path) -> sqlite3.Connection:
    conn = db.connect(tmp_path / "store.sqlite3")
    db.upsert_document_version(
        conn, rel_path="alpha/2026-10-02-two.md", version=1,
        archive_path=".versions/alpha/2026-10-02-two/v0001.md", title="Two",
        date="2026-10-02", tags=[], markdown="", created_at=_V1_STORE_TIME,
    )
    return conn


def _snapshot(files: dict[str, Path]) -> dict[str, tuple[bytes, int]]:
    return {k: (p.read_bytes(), p.stat().st_mtime_ns) for k, p in files.items()}


def test_the_fill_stamps_each_version_once_best_effort(tmp_path):
    docs, tenant, files = _corpus(tmp_path)
    store = _store(tmp_path)
    roots = [(docs, None), (tenant, {_TENANT})]
    before = _snapshot(files)

    # The dry run plans every file and writes nothing.
    dry = published_fill.fill(dry_run=True, store=store, roots=roots)
    planned = {p.path: (p.version, p.at, p.skip) for p in dry.planned}
    assert _snapshot(files) == before
    assert planned == {
        files["one"]: (1, "2026-10-01", None),
        files["two1"]: (1, "2026-10-02", None),
        files["two2"]: (2, "2026-10-05T00:00:00Z", None),  # v1's archive time, the store's
        files["two"]: (3, "2025-10-09T08:53:20Z", None),  # v2's archive time, the file's
        files["three"]: (1, None, "stamped"),
        files["four1"]: (1, "2026-10-04", None),
        files["four"]: (2, "2025-06-15T15:06:40Z", None),
    }

    report = published_fill.fill(dry_run=False, store=store, roots=roots)
    assert report.errors == [] and len(report.written) == 6
    after = _snapshot(files)
    for key, path in files.items():
        old_bytes, old_mtime = before[key]
        new_bytes, new_mtime = after[key]
        assert new_mtime == old_mtime, key  # the file time the store re-derives stays
        if key == "three":
            assert new_bytes == old_bytes
            continue
        version, at, _skip = planned[path]
        line = documents.published_line(at, best_effort=True) + "\n"
        assert '"best_effort": true' in line
        # exactly one line more, and no other byte changed (the body included)
        assert new_bytes.decode().replace(line, "", 1).encode() == old_bytes, key
    assert files["one"].read_text().split("\n")[2:4] == [
        "date: 2026-10-01", 'published: {"at": "2026-10-01", "best_effort": true}',
    ]
    assert files["two"].read_text().split("\n")[3:5] == [
        "version: 3", 'published: {"at": "2025-10-09T08:53:20Z", "best_effort": true}',
    ]

    # Idempotent: a second run plans nothing and writes nothing.
    again = published_fill.fill(dry_run=False, store=store, roots=roots)
    assert again.written == [] and all(p.skip == "stamped" for p in again.planned)
    assert _snapshot(files) == after
    store.close()

    # Reindex reads the fill as best-effort, in both roots' rows.
    conn = db.connect(tmp_path / "kb.sqlite3")
    try:
        reindex.reindex(conn=conn, docs_root=docs)
        assert _times(conn, "alpha/2026-10-02-two.md") == (
            ("2025-10-09T08:53:20Z", True),
            {1: ("2026-10-02", True), 2: ("2026-10-05T00:00:00Z", True)},
        )
        assert _times(conn, "alpha/2026-10-03-three.md")[0] == (_T1, False)
    finally:
        conn.close()


def test_the_fill_without_a_store_uses_the_archive_file_times(tmp_path):
    docs, _tenant, files = _corpus(tmp_path)
    report = published_fill.fill(dry_run=True, store=None, roots=[(docs, None)])
    at = {p.path: p.at for p in report.planned}
    assert at[files["two2"]] == "2025-09-27T19:06:40Z"  # v1's archive file time


def test_the_fill_command_commits_only_what_git_tracks(tmp_path, monkeypatch):
    docs, _tenant, files = _corpus(tmp_path)
    kb = tmp_path / "kb"
    _git(kb, "init")
    _git(kb, "config", "user.name", "kb-test")
    _git(kb, "config", "user.email", "kb-test@example.com")
    _git(kb, "add", "docs")  # the public root is tracked; tenants/ never is
    _git(kb, "commit", "-m", "seed")
    monkeypatch.setenv("KB_ROOT", str(kb))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "absent.sqlite3"))

    assert published_fill.main(["--dry-run", "--commit"]) == 0
    assert _git(kb, "status", "--porcelain", "--untracked-files=no").stdout == ""
    assert published_fill.main(["--push"]) == 2  # --push needs --commit

    assert published_fill.main(["--commit"]) == 0
    assert _git(kb, "status", "--porcelain", "--untracked-files=no").stdout == ""  # the deploy's clean tree
    assert _git(kb, "log", "-1", "--pretty=%s").stdout.strip() == published_fill.COMMIT_MESSAGE
    names = set(_git(kb, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")
                .stdout.split())
    assert names == {
        "docs/alpha/2026-10-01-one.md", "docs/alpha/2026-10-02-two.md",
        "docs/.versions/alpha/2026-10-02-two/v0001.md",
        "docs/.versions/alpha/2026-10-02-two/v0002.md",
    }
    assert '"best_effort": true' in files["four"].read_text()  # filled, never staged


# --- the fill works on bytes (any line ending, the body and the tail kept) ----

_DAY_LINE = b'published: {"at": "2026-07-02", "best_effort": true}'


def _crlf(text: str) -> bytes:
    return text.replace("\n", "\r\n").encode()


# (raw file, the bytes before which the one line goes, the ending it takes): the
# line follows ``date:`` (no ``version:``) and takes the ending of the line it follows.
_ENDINGS = {
    "lf": (b'---\ntitle: "C"\ndate: 2026-07-02\ntags: []\n---\n\nBody\n', b"\n"),
    "crlf": (_crlf('---\ntitle: "C"\ndate: 2026-07-02\ntags: []\n---\n\nBody\n'), b"\r\n"),
    "cr": (b'---\rtitle: "C"\rdate: 2026-07-02\rtags: []\r---\r\rBody\r', b"\r"),
    "crlf-head-lf-body": (
        b'---\r\ntitle: "C"\r\ndate: 2026-07-02\r\ntags: []\r\n---\r\n\nBody\nTwo\r\n', b"\r\n"),
    "mixed-head": (b'---\ntitle: "C"\r\ndate: 2026-07-02\rtags: []\n---\n\nBody\n', b"\r"),
    "no-final-newline": (_crlf('---\ntitle: "C"\ndate: 2026-07-02\ntags: []\n---\n\nBody')
                         , b"\r\n"),
    "trailing-blanks": (b'---\ntitle: "C"\ndate: 2026-07-02\ntags: []\n---\n\nBody\n\n\n\n',
                        b"\n"),
    "crlf-trailing-blanks": (
        _crlf('---\ntitle: "C"\ndate: 2026-07-02\ntags: []\n---\n\nBody\n\n\n'), b"\r\n"),
    "html-crlf": (_crlf('<!--kb\ntitle: "C"\ndate: 2026-07-02\ntags: []\n-->\n\n'
                        "<!DOCTYPE html><p>x</p>\n"), b"\r\n"),
}


@pytest.mark.parametrize("where", ["current", "archive"])
@pytest.mark.parametrize("case", sorted(_ENDINGS))
def test_the_fill_inserts_one_line_and_keeps_every_other_byte(tmp_path, case, where):
    raw, ending = _ENDINGS[case]
    ext = "html" if case.startswith("html") else "md"
    docs = tmp_path / "docs"
    rel = (f"alpha/2026-07-02-c.{ext}" if where == "current"
           else f".versions/alpha/2026-07-02-c/v0001.{ext}")
    path = docs / rel
    path.parent.mkdir(parents=True)
    path.write_bytes(raw)
    os.utime(path, (1_700_000_000, 1_700_000_000))
    cut = raw.index(b"date: 2026-07-02") + len(b"date: 2026-07-02") + len(ending)
    want = raw[:cut] + _DAY_LINE + ending + raw[cut:]
    roots = [(docs, None)]

    dry = published_fill.fill(dry_run=True, store=None, roots=roots)
    assert [(p.path, p.at, p.skip) for p in dry.planned] == [(path, "2026-07-02", None)]
    assert path.read_bytes() == raw  # a dry run writes nothing

    report = published_fill.fill(dry_run=False, store=None, roots=roots)
    assert (report.errors, report.written) == ([], [path])
    assert path.read_bytes() == want  # one line new, in its ending; no other byte
    assert path.stat().st_mtime == 1_700_000_000
    meta, _body = (documents.parse_html_frontmatter if ext == "html"
                   else documents.parse_frontmatter)(path.read_text(encoding="utf-8"))
    assert documents.parse_published(meta["published"]) == ("2026-07-02", True)

    again = published_fill.fill(dry_run=False, store=None, roots=roots)
    assert again.written == [] and [p.skip for p in again.planned] == ["stamped"]
    assert path.read_bytes() == want


def test_the_fill_leaves_a_file_with_a_byte_order_mark_alone(tmp_path):
    # Reindex reads no header past a BOM (the file is skipped there too), so the
    # fill skips it, with the reason, and never touches a byte.
    docs = tmp_path / "docs"
    path = docs / "alpha/2026-07-02-c.md"
    path.parent.mkdir(parents=True)
    raw = b"\xef\xbb\xbf" + _ENDINGS["crlf"][0]
    path.write_bytes(raw)
    report = published_fill.fill(dry_run=False, store=None, roots=[(docs, None)])
    assert report.written == [] and [p.skip for p in report.planned] == ["no header"]
    assert path.read_bytes() == raw


def test_the_fill_refuses_a_change_beyond_its_one_line(tmp_path, monkeypatch):
    docs = tmp_path / "docs"
    path = docs / "alpha/2026-07-02-c.md"
    path.parent.mkdir(parents=True)
    raw = _ENDINGS["crlf"][0]
    path.write_bytes(raw)
    real = documents.set_frontmatter_published
    monkeypatch.setattr(
        "server.documents.set_frontmatter_published",
        lambda text, at, best_effort=False: real(text, at, best_effort).replace("Body", "B"),
    )
    for dry_run in (True, False):
        report = published_fill.fill(dry_run=dry_run, store=None, roots=[(docs, None)])
        (item,) = report.planned
        assert item.skip and item.skip.startswith("refused:"), item.skip
        assert report.written == [] and report.errors == []
        assert path.read_bytes() == raw
        shown = published_fill.format_report(report, dry_run=dry_run, verbose=False)
        assert f"skip alpha/2026-07-02-c.md v1: {item.skip}" in shown
