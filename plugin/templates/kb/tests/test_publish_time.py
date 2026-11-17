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
    _git(kb, "init", "-q", "-b", "main")  # the fill commits only on main (F8)
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


# --- a follow-up run finishes whatever an earlier run left ---------------------

_PUBLIC = {
    "docs/alpha/2026-10-01-one.md", "docs/alpha/2026-10-02-two.md",
    "docs/.versions/alpha/2026-10-02-two/v0001.md",
    "docs/.versions/alpha/2026-10-02-two/v0002.md",
}
_FINISH = "python -m server.published_fill --commit --push"


def _box(tmp_path, monkeypatch):
    """The box's checkout: the corpus with docs/ tracked and pushed to a bare origin."""
    _docs, _tenant, files = _corpus(tmp_path)
    kb = tmp_path / "kb"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(tmp_path / "origin.git")],
                   check=True)
    _git(kb, "init", "-q", "-b", "main")
    _git(kb, "config", "user.name", "kb-test")
    _git(kb, "config", "user.email", "kb-test@example.com")
    _git(kb, "add", "docs")
    _git(kb, "commit", "-q", "-m", "seed")
    _git(kb, "remote", "add", "origin", str(tmp_path / "origin.git"))
    _git(kb, "push", "-q", "origin", "main")
    monkeypatch.setenv("KB_ROOT", str(kb))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "absent.sqlite3"))
    return kb, files


def _fill(capsys, *args):
    rc = published_fill.main(list(args))
    out = capsys.readouterr()
    return rc, out.out + out.err


def _dirty(kb) -> set[str]:
    return set(_git(kb, "diff", "HEAD", "--name-only").stdout.split())


def _ahead(kb) -> int:
    return int(_git(kb, "rev-list", "--count", "origin/main..HEAD").stdout)


def _in_head(kb) -> set[str]:
    return set(_git(kb, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").stdout.split())


@pytest.mark.parametrize("follow_ups", [
    [["--commit"], ["--commit", "--push"]],
    [["--commit", "--push"]],
], ids=["commit-then-push", "commit-push"])
def test_a_follow_up_run_finishes_a_run_that_did_not_commit(tmp_path, monkeypatch, capsys,
                                                             follow_ups):
    kb, _files = _box(tmp_path, monkeypatch)
    rc, out = _fill(capsys)  # no flag: it writes, and names the command that finishes
    assert rc == 0 and _dirty(kb) == _PUBLIC and _FINISH in out, out
    for i, args in enumerate(follow_ups):
        rc, out = _fill(capsys, *args)
        assert rc == 0, out
        if i < len(follow_ups) - 1:
            assert _dirty(kb) == set() and _ahead(kb) == 1 and _FINISH in out, out
    assert _dirty(kb) == set() and _ahead(kb) == 0, out
    assert _in_head(kb) == _PUBLIC
    assert _git(kb, "log", "-1", "--pretty=%s").stdout.strip() == published_fill.COMMIT_MESSAGE
    # A run on a clean, pushed tree has nothing to do: no commit, no push.
    head = _git(kb, "rev-parse", "HEAD").stdout
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 0 and "nothing to do" in out and _FINISH not in out, out
    assert _git(kb, "rev-parse", "HEAD").stdout == head and _ahead(kb) == 0


def test_a_follow_up_run_pushes_the_commit_an_earlier_run_left(tmp_path, monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    rc, out = _fill(capsys, "--commit")
    assert rc == 0 and _dirty(kb) == set() and _ahead(kb) == 1 and _FINISH in out, out
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 0 and _ahead(kb) == 0 and "pushed" in out, out
    assert _git(tmp_path / "origin.git", "rev-parse", "main").stdout == \
        _git(kb, "rev-parse", "HEAD").stdout


def test_a_failed_push_exits_non_zero_and_a_re_run_pushes(tmp_path, monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    _git(kb, "remote", "set-url", "origin", str(tmp_path / "gone.git"))
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 1 and "the local commit stays" in out and _FINISH in out, out
    assert _dirty(kb) == set() and _in_head(kb) == _PUBLIC
    _git(kb, "remote", "set-url", "origin", str(tmp_path / "origin.git"))  # origin is back
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 0 and _ahead(kb) == 0 and "pushed" in out, out


def test_a_follow_up_run_commits_the_stamps_of_an_interrupted_run(tmp_path, monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    plan = [p for p in published_fill.fill(dry_run=True).planned if p.skip is None]
    for item in plan[:2]:  # a run cut off after two files, before any commit
        published_fill._write(item)
    _git(kb, "add", str(plan[0].path))  # ... one of them already staged
    assert len(_dirty(kb)) == 2
    rc, out = _fill(capsys, "--commit")
    assert rc == 0 and _dirty(kb) == set() and _in_head(kb) == _PUBLIC, out


def test_the_fill_commits_only_its_own_stamps(tmp_path, monkeypatch, capsys):
    kb, files = _box(tmp_path, monkeypatch)
    for name in ("notes.md", "staged.md"):
        (kb / "docs" / name).write_text("a\n")
    _git(kb, "add", "docs/notes.md", "docs/staged.md")
    _git(kb, "commit", "-q", "-m", "pages")
    _git(kb, "push", "-q", "origin", "main")
    (kb / "docs" / "notes.md").write_text("a\nb\n")  # an operator's change elsewhere
    (kb / "docs" / "staged.md").write_text("a\nc\n")  # ... and a staged one
    _git(kb, "add", "docs/staged.md")
    two1 = files["two1"]  # an operator's change in a version file the fill then stamps
    two1.write_bytes(two1.read_bytes().replace(b"First.", b"First!"))
    private = kb / "docs" / "gamma" / "2026-10-05-five.md"  # a private project: untracked
    private.parent.mkdir()
    private.write_text('---\ntitle: "Five"\ndate: 2026-10-05\ntags: []\n---\n\nFive.\n')

    rc, out = _fill(capsys, "--commit")
    assert rc == 1, out  # one of the fill's lines stays uncommitted: said, and not 0
    assert _in_head(kb) == _PUBLIC - {"docs/.versions/alpha/2026-10-02-two/v0001.md"}
    for left in ("docs/.versions/alpha/2026-10-02-two/v0001.md", "docs/notes.md",
                 "docs/staged.md"):
        assert left in out, out
    assert _dirty(kb) == {"docs/.versions/alpha/2026-10-02-two/v0001.md", "docs/notes.md",
                          "docs/staged.md"}
    assert _git(kb, "diff", "--cached", "--name-only").stdout.split() == ["docs/staged.md"]
    assert '"best_effort": true' in private.read_text()  # filled, never staged
    assert "?? docs/gamma/" in _git(kb, "status", "--porcelain").stdout

    rc, out = _fill(capsys, "--commit", "--push")  # git cannot rebase over them
    assert rc == 1 and "push not attempted" in out and _ahead(kb) == 1, out


def test_a_dry_run_says_what_a_commit_would_take_and_writes_nothing(tmp_path, monkeypatch,
                                                                    capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    head = _git(kb, "rev-parse", "HEAD").stdout
    rc, out = _fill(capsys, "--dry-run", "--commit", "--push")
    assert rc == 0 and "would commit 4 file(s)" in out and _dirty(kb) == set(), out
    rc, out = _fill(capsys)  # stamps, no commit
    rc, out = _fill(capsys, "--dry-run", "--commit")
    assert rc == 0 and "would commit 4 file(s)" in out and _dirty(kb) == _PUBLIC, out
    assert _git(kb, "rev-parse", "HEAD").stdout == head


def test_the_fill_waits_for_the_index_lock(tmp_path, monkeypatch, capsys):
    import threading

    kb, _files = _box(tmp_path, monkeypatch)
    lock = kb / ".git" / "index.lock"
    lock.write_text("")
    monkeypatch.setattr(published_fill, "INDEX_LOCK_WAIT_S", 0.3)
    start = time.monotonic()
    rc, out = _fill(capsys, "--commit")
    assert rc == 4 and "index.lock" in out and _dirty(kb) == set(), out  # wrote nothing
    assert time.monotonic() - start < 5, "the wait is the module's, read at run time"
    threading.Timer(0.5, lock.unlink).start()  # a write's git that finishes in time
    monkeypatch.setattr(published_fill, "INDEX_LOCK_WAIT_S", 5.0)
    rc, out = _fill(capsys, "--commit")
    assert rc == 0 and _in_head(kb) == _PUBLIC, out  # it waited, then committed


# --- the checkout's state: git only in the one state the box's helper is written for ---

def _git_raw(root, *args) -> bytes:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True,
                          check=True).stdout


def _try(root, *args):
    """A git command expected to stop part-way (a conflict): its exit is not checked."""
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)


def _notes(kb, text, msg, rel="docs/notes.md"):
    (kb / rel).write_text(text)
    _git(kb, "add", rel)
    _git(kb, "commit", "-q", "-m", msg)


def _origin_commit(tmp_path, rel, change, msg):
    """Someone else pushes a commit to origin's main (``change(path)`` edits ``rel``)."""
    other = tmp_path / "other"
    subprocess.run(["git", "clone", "-q", str(tmp_path / "origin.git"), str(other)],
                   check=True)
    _git(other, "config", "user.name", "other")
    _git(other, "config", "user.email", "other@example.com")
    path = other / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    change(path)
    _git(other, "add", rel)
    _git(other, "commit", "-q", "-m", msg)
    _git(other, "push", "-q", "origin", "main")


def _side_conflict(kb):
    """Branch ``side`` and ``main`` each change docs/notes.md their own way."""
    _notes(kb, "base\n", "notes")
    _git(kb, "checkout", "-q", "-b", "side")
    _notes(kb, "side\n", "side notes")
    _notes(kb, "more\n", "side more", rel="docs/more.md")
    _git(kb, "checkout", "-q", "main")
    _notes(kb, "main\n", "main notes")


def _mid_rebase(kb, tmp_path):  # C08: stopped, HEAD detached and ahead of origin/main
    _notes(kb, "a\n", "c1 notes")
    _notes(kb, "a\nb\n", "c2 notes")
    _try(kb, "rebase", "-q", "-x", "false", "HEAD~2")


def _mid_rebase_apply(kb, tmp_path):
    _origin_commit(tmp_path, "docs/notes.md", lambda p: p.write_text("theirs\n"), "theirs")
    _notes(kb, "ours\n", "ours")
    _git(kb, "fetch", "-q", "origin")
    _try(kb, "rebase", "--apply", "origin/main")


def _mid_merge(kb, tmp_path):
    _side_conflict(kb)
    _try(kb, "merge", "side")


def _mid_cherry_pick(kb, tmp_path):
    _side_conflict(kb)
    _try(kb, "cherry-pick", "side~1")


def _mid_sequence(kb, tmp_path):  # the conflict settled by hand; the sequence goes on
    _side_conflict(kb)
    _try(kb, "cherry-pick", "main..side")
    (kb / "docs" / "notes.md").write_text("settled\n")
    _git(kb, "add", "docs/notes.md")
    _git(kb, "commit", "-q", "--no-edit")


def _mid_revert(kb, tmp_path):
    _notes(kb, "a\n", "n1")
    _notes(kb, "b\n", "n2")
    _try(kb, "revert", "--no-edit", "HEAD~1")


def _mid_bisect(kb, tmp_path):  # HEAD stays on main
    _git(kb, "bisect", "start")


def _on_a_branch(kb, tmp_path):  # C09
    _git(kb, "checkout", "-q", "-b", "wip")
    _notes(kb, "experiment\n", "wip: operator experiment")


def _detached(kb, tmp_path):
    _git(kb, "checkout", "-q", "--detach")
    _notes(kb, "detached\n", "detached work")


def _unborn(kb, tmp_path):  # HEAD names main, which has no commit
    _git(kb, "update-ref", "-d", "refs/heads/main")


def _a_subdirectory(kb, tmp_path):  # KB_ROOT is a folder of a larger checkout
    shutil.move(str(kb / ".git"), str(tmp_path / ".git"))


_STATES = {
    "rebase": (_mid_rebase, "a rebase is in progress"),
    "rebase-apply": (_mid_rebase_apply, "a rebase or am is in progress"),
    "merge": (_mid_merge, "a merge is in progress"),
    "cherry-pick": (_mid_cherry_pick, "a cherry-pick is in progress"),
    "sequence": (_mid_sequence, "a cherry-pick or revert sequence is in progress"),
    "revert": (_mid_revert, "a revert is in progress"),
    "bisect": (_mid_bisect, "a bisect is in progress"),
    "branch": (_on_a_branch, "HEAD is on branch wip, not main"),
    "detached": (_detached, "HEAD is detached"),
    "unborn": (_unborn, "the checkout has no commit yet"),
    "subdirectory": (_a_subdirectory, "inside a larger git checkout"),
}
_MODES = {
    "write": [],
    "commit": ["--commit"],
    "push": ["--commit", "--push"],
    "dry": ["--dry-run", "--commit", "--push"],
}


def _everything(kb, tmp_path) -> dict:
    """Every byte of the work tree and the checkout's git dir, and origin's refs."""
    gitdir = Path(_git(kb, "rev-parse", "--absolute-git-dir").stdout.strip())
    out: dict = {}
    for base in (kb, gitdir):
        for path in sorted(base.rglob("*")):
            if path.is_file():
                out[str(path)] = (path.read_bytes(), path.stat().st_mode)
    out["origin"] = _git(tmp_path / "origin.git", "for-each-ref").stdout
    return out


@pytest.mark.parametrize("mode", sorted(_MODES))
@pytest.mark.parametrize("state", sorted(_STATES))
def test_the_fill_touches_nothing_outside_the_normal_state(tmp_path, monkeypatch, capsys,
                                                           state, mode):
    kb, _files = _box(tmp_path, monkeypatch)
    setup, why = _STATES[state]
    setup(kb, tmp_path)
    before = _everything(kb, tmp_path)
    rc, out = _fill(capsys, *_MODES[mode])
    assert rc == 3 and why in out and "refused" in out, out
    assert _everything(kb, tmp_path) == before  # not a byte written, staged or pushed


def test_a_root_outside_git_is_filled_but_never_committed(tmp_path, monkeypatch, capsys):
    _docs, _tenant, files = _corpus(tmp_path)
    monkeypatch.setenv("KB_ROOT", str(tmp_path / "kb"))
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "absent.sqlite3"))
    rc, out = _fill(capsys, "--commit")
    assert rc == 3 and "not inside a git checkout" in out, out
    assert "best_effort" not in files["one"].read_text()
    rc, out = _fill(capsys)  # the stamps alone: nothing in git to finish
    assert rc == 0 and "best_effort" in files["one"].read_text(), out


def test_a_checkout_without_origin_commits_but_never_pushes(tmp_path, monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    _git(kb, "remote", "remove", "origin")
    before = _everything(kb, tmp_path)
    for args in (["--dry-run", "--commit", "--push"], ["--commit", "--push"]):
        rc, out = _fill(capsys, *args)
        assert rc == 3 and "no origin remote" in out, out
        assert _everything(kb, tmp_path) == before
    rc, out = _fill(capsys, "--commit")
    assert rc == 0 and _in_head(kb) == _PUBLIC and "unpushed" not in out, out
    assert "--push" not in out, out  # no step that this checkout cannot take
    rc, out = _fill(capsys)
    assert rc == 0 and "nothing to do" in out and "unpushed" not in out, out


def test_an_origin_without_main_is_refused_before_anything_is_written(tmp_path, monkeypatch,
                                                                      capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    origin = tmp_path / "origin.git"
    _git(kb, "push", "-q", "origin", "main:master")
    _git(origin, "symbolic-ref", "HEAD", "refs/heads/master")
    _git(origin, "branch", "-q", "-D", "main")
    _git(kb, "fetch", "-q", "--prune", "origin")
    before = _everything(kb, tmp_path)
    for args in (["--dry-run", "--commit", "--push"], ["--commit", "--push"]):
        rc, out = _fill(capsys, *args)
        assert rc == 3 and "origin has no branch main" in out, out
        assert _everything(kb, tmp_path) == before
    rc, out = _fill(capsys, "--commit")  # a local commit: never called pushed
    assert rc == 0 and _in_head(kb) == _PUBLIC and "unpushed" not in out, out
    rc, out = _fill(capsys)
    assert rc == 0 and "nothing to do" in out and "unpushed" not in out, out
    assert "origin/main is not known here" in out, out


def test_a_push_that_cannot_replay_names_the_conflict_and_keeps_the_commit(tmp_path,
                                                                           monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    seed = _git(kb, "rev-parse", "HEAD").stdout

    def by_hand(path):
        path.write_text(path.read_text().replace(
            "date: 2026-10-01\n", 'date: 2026-10-01\npublished: "2026-10-01T09:00:00Z"\n'))

    _origin_commit(tmp_path, "docs/alpha/2026-10-01-one.md", by_hand, "stamp one by hand")
    for _ in range(2):  # following the step without settling it gives the same line
        rc, out = _fill(capsys, "--commit", "--push")
        assert rc == 1 and "do not replay cleanly" in out and "git pull --rebase" in out, out
        assert "reachable" not in out, out
        # the checkout as it was, plus the fill's own commit on main; nothing pushed
        assert _git(kb, "rev-parse", "HEAD~1").stdout == seed
        assert _git(kb, "log", "-1", "--pretty=%s").stdout.strip() == published_fill.COMMIT_MESSAGE
        assert _git(kb, "symbolic-ref", "HEAD").stdout.strip() == "refs/heads/main"
        assert not (kb / ".git" / "rebase-merge").exists()
        assert not (kb / ".git" / "rebase-apply").exists()
        assert _git(kb, "status", "--porcelain", "--untracked-files=no").stdout == ""
        assert _git(tmp_path / "origin.git", "log", "-1", "--pretty=%s", "main").stdout.strip() \
            == "stamp one by hand"


def test_a_push_says_what_it_carries_and_replays_onto_a_moved_origin(tmp_path, monkeypatch,
                                                                     capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    _origin_commit(tmp_path, "docs/elsewhere.md", lambda p: p.write_text("theirs\n"),
                   "their page")
    _notes(kb, "mine\n", "operator: my notes")
    rc, out = _fill(capsys, "--dry-run", "--commit", "--push")
    assert rc == 0 and "operator: my notes (not the fill's)" in out, out
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 0 and "pushed" in out, out
    assert "2 commit(s)" in out and "operator: my notes (not the fill's)" in out, out
    log = _git(tmp_path / "origin.git", "log", "--pretty=%s", "main").stdout.splitlines()
    assert log[:3] == [published_fill.COMMIT_MESSAGE, "operator: my notes", "their page"]
    assert _ahead(kb) == 0 and _dirty(kb) == set()


def test_a_refused_push_says_origin_refused_it(tmp_path, monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    hook = tmp_path / "origin.git" / "hooks" / "pre-receive"
    hook.write_text("#!/bin/sh\necho 'main is protected' >&2\nexit 1\n")
    hook.chmod(0o755)
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 1 and "origin refused the push" in out and "main is protected" in out, out
    assert "reachable" not in out, out
    assert _in_head(kb) == _PUBLIC and _ahead(kb) == 1


def test_a_mode_change_on_a_stamped_file_is_left_and_named(tmp_path, monkeypatch, capsys):
    kb, files = _box(tmp_path, monkeypatch)
    _fill(capsys)
    files["one"].chmod(0o755)
    rc, out = _fill(capsys, "--commit")
    assert rc == 1, out
    assert "left docs/alpha/2026-10-01-one.md: the fill's line and a change of the file's " \
           "mode" in out, out
    assert _in_head(kb) == _PUBLIC - {"docs/alpha/2026-10-01-one.md"}
    assert "mode change" not in _git(kb, "show", "--summary", "--format=", "HEAD").stdout


def test_a_stamped_file_moved_or_deleted_since_is_left_and_named(tmp_path, monkeypatch,
                                                                 capsys):
    kb, files = _box(tmp_path, monkeypatch)
    _fill(capsys)
    _git(kb, "mv", "docs/alpha/2026-10-01-one.md", "docs/alpha/2026-10-01-uno.md")
    files["two1"].unlink()
    rc, out = _fill(capsys, "--commit")
    assert rc == 1, out  # the fill's line in uno.md stays uncommitted: said, and not 0
    assert "left docs/alpha/2026-10-01-uno.md: the fill's line in a file HEAD does not " \
           "have" in out, out
    for gone in ("docs/alpha/2026-10-01-one.md", "docs/.versions/alpha/2026-10-02-two/v0001.md"):
        assert f"left {gone}: not the fill's change" in out, out
    assert _in_head(kb) == {"docs/alpha/2026-10-02-two.md",
                            "docs/.versions/alpha/2026-10-02-two/v0002.md"}


def test_a_tracked_private_projects_stamps_are_never_committed(tmp_path, monkeypatch, capsys):
    from server import gitops

    kb, _files = _box(tmp_path, monkeypatch)
    head = _git(kb, "rev-parse", "HEAD").stdout
    gitops.mark_private("alpha", root=kb)  # marked private, not yet reconciled
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 1 and "in a private project's footprint" in out, out
    assert _git(kb, "rev-parse", "HEAD").stdout == head
    assert _git(kb, "diff", "--cached", "--name-only").stdout == ""
    assert _ahead(kb) == 0


def test_a_commit_git_refuses_leaves_nothing_of_the_fills_staged(tmp_path, monkeypatch,
                                                                  capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    _fill(capsys)  # the stamps on disk, nothing staged
    hook = kb / ".git" / "hooks" / "pre-commit"
    hook.write_text("#!/bin/sh\nexit 1\n")
    hook.chmod(0o755)
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 1 and "git failed" in out, out
    assert _git(kb, "diff", "--cached", "--name-only").stdout == ""  # cannot ride along later
    assert _dirty(kb) == _PUBLIC and _ahead(kb) == 0


_CRLF_DOC = "docs/alpha/2026-10-07-crlf.md"
_CRLF_RAW = b'---\r\ntitle: "C"\r\ndate: 2026-10-07\r\ntags: []\r\n---\r\n\r\nBody.\r\n'


def _converting(kb, how):
    """A CRLF document committed under one of git's line-ending conversions."""
    if how == "autocrlf-input":
        _git(kb, "config", "core.autocrlf", "input")
    elif how == "autocrlf-true":
        _git(kb, "config", "core.autocrlf", "true")
    elif how == "text-eol-crlf":
        (kb / ".gitattributes").write_text("*.md text eol=crlf\n")
        _git(kb, "add", ".gitattributes")
    (kb / _CRLF_DOC).write_bytes(_CRLF_RAW)
    _git(kb, "add", _CRLF_DOC)
    _git(kb, "commit", "-q", "-m", "a crlf doc")
    if how == "safer-autocrlf":  # the blob keeps its CRs; git leaves such a file alone
        _git(kb, "config", "core.autocrlf", "input")
    if how == "text-renormalize":  # a text rule over a CRLF blob: a commit converts it all
        (kb / ".gitattributes").write_text("*.md text\n")
        _git(kb, "add", ".gitattributes")
        _git(kb, "commit", "-q", "-m", "text rule")
    _git(kb, "push", "-q", "origin", "main")
    clean = _git(kb, "status", "--porcelain", "--untracked-files=no").stdout == ""
    assert clean == (how != "text-renormalize")  # git sees that one as changed already


@pytest.mark.parametrize("how", ["autocrlf-input", "autocrlf-true", "text-eol-crlf",
                                 "safer-autocrlf"])
def test_the_fills_own_line_is_recognised_through_gits_conversions(tmp_path, monkeypatch,
                                                                    capsys, how):
    kb, _files = _box(tmp_path, monkeypatch)
    _converting(kb, how)
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 0 and "pushed" in out and "left " not in out, out  # C11
    assert _dirty(kb) == set() and _ahead(kb) == 0
    old = _git_raw(kb, "cat-file", "blob", f"HEAD~1:{_CRLF_DOC}")
    new = _git_raw(kb, "cat-file", "blob", f"HEAD:{_CRLF_DOC}")
    # the stored file took the one line and nothing else
    assert new == published_fill.stamp_bytes(old, "2026-10-07", is_html=False)
    assert (kb / _CRLF_DOC).read_bytes() == published_fill.stamp_bytes(
        _CRLF_RAW, "2026-10-07", is_html=False)


def test_a_stamp_git_would_store_with_other_bytes_changed_is_left(tmp_path, monkeypatch,
                                                                   capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    _converting(kb, "text-renormalize")
    blob = _git_raw(kb, "rev-parse", f"HEAD:{_CRLF_DOC}")
    rc, out = _fill(capsys, "--commit")
    assert rc == 1, out
    assert f"left {_CRLF_DOC}: the fill's line, but git's line-ending conversion" in out, out
    assert _git_raw(kb, "rev-parse", f"HEAD:{_CRLF_DOC}") == blob  # never committed
    assert _in_head(kb) == _PUBLIC


@pytest.mark.parametrize("old, new", [
    (b"a\nb\n", b"a\nx\nb\n"),  # one line in
    (b"a\r\nb\r\n", b"a\r\nx\r\nb\r\n"),
    (b"a\rb\r", b"a\rx\rb\r"),  # no \n at all: git sees one line, changed
    (b"a\nb", b"a\nb\nc"),  # no newline at the end, before and after
    (b"a\nb\nc\nd\n", b"A\nb\nc\nd\ne\n"),  # two hunks, one of them a change
])
def test_the_stored_bytes_are_read_off_gits_own_patch(tmp_path, old, new):
    _git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "f.md").write_bytes(old)
    _git(tmp_path, "add", "f.md")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q",
         "-m", "f")
    (tmp_path / "f.md").write_bytes(new)
    patch = _git_raw(tmp_path, "diff", "HEAD", "--unified=0", "--binary", "--", "f.md")
    assert published_fill._stored_after(old, patch) == new
    context = _git_raw(tmp_path, "diff", "HEAD", "--unified=1", "--", "f.md")
    if context != patch:  # a line this does not read: not taken as the fill's
        assert published_fill._stored_after(old, context) is None


def test_a_stamped_file_staged_with_another_change_is_left(tmp_path, monkeypatch, capsys):
    kb, files = _box(tmp_path, monkeypatch)
    _fill(capsys)
    one = files["one"]
    stamped = one.read_bytes()
    one.write_bytes(stamped.replace(b"Body one.", b"Body staged."))
    _git(kb, "add", "docs/alpha/2026-10-01-one.md")  # an operator's other change, staged
    one.write_bytes(stamped)  # ... and the work tree back to the fill's line alone
    _git(kb, "update-index", "--chmod=+x", "docs/alpha/2026-10-02-two.md")  # a staged mode
    rc, out = _fill(capsys, "--commit")
    assert rc == 1, out
    for rel in ("docs/alpha/2026-10-01-one.md", "docs/alpha/2026-10-02-two.md"):
        assert f"left {rel}: the fill's line, staged differently" in out, out
    assert _in_head(kb) == _PUBLIC - {"docs/alpha/2026-10-01-one.md",
                                      "docs/alpha/2026-10-02-two.md"}
    assert b"Body staged." in _git_raw(kb, "show", ":docs/alpha/2026-10-01-one.md")


def test_a_push_counts_only_what_origin_lacks_now(tmp_path, monkeypatch, capsys):
    kb, _files = _box(tmp_path, monkeypatch)
    rc, out = _fill(capsys, "--commit")
    assert rc == 0 and _ahead(kb) == 1, out
    # someone else already brought the commit to origin; this checkout has not fetched
    subprocess.run(["git", "clone", "-q", str(tmp_path / "origin.git"), str(tmp_path / "o")],
                   check=True)
    _git(tmp_path / "o", "pull", "-q", "--ff-only", str(kb), "main")
    _git(tmp_path / "o", "push", "-q", "origin", "main")
    rc, out = _fill(capsys, "--commit", "--push")
    assert rc == 0 and "nothing to push" in out and "pushed:" not in out, out
    assert _ahead(kb) == 0


def test_a_second_fill_run_at_the_same_time_is_refused(tmp_path, monkeypatch, capsys):
    import fcntl

    kb, _files = _box(tmp_path, monkeypatch)
    gitdir = Path(_git(kb, "rev-parse", "--absolute-git-dir").stdout.strip())
    with open(gitdir / published_fill.FILL_LOCK, "a") as held:
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)  # a first run, still going
        before = _everything(kb, tmp_path)
        for args in ([], ["--commit", "--push"]):
            rc, out = _fill(capsys, *args)
            assert rc == 4 and "another fill run" in out, out
            assert _everything(kb, tmp_path) == before
    rc, out = _fill(capsys, "--commit", "--push")  # once it is done, a run finishes
    assert rc == 0 and _ahead(kb) == 0 and _in_head(kb) == _PUBLIC, out


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
