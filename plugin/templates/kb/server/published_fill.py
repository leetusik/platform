"""One best-effort fill of every version's publish time (P63, D171-qk).

From P63 on, the write path stamps each version's own publish time into its file's
header (``published: "2026-11-17T09:30:12Z"``, ``server/documents.py``). Versions
published before that carry none. This module gives each of them one, once, from the
only times the store ever held, and marks every such time as a fill so it can always
be told from the server's own stamp::

    published: {"at": "2026-11-10T08:01:02Z", "best_effort": true}

The rule (the store's own times, nothing invented):

* **vN, N >= 2:** published when v(N-1) was archived, i.e. v(N-1)'s
  ``document_versions.created_at`` in the store (the write path's time, or the
  archive file's mtime that every reindex re-derives), else that archive file's mtime.
* **v1:** the document's ``date:`` (a day, ``YYYY-MM-DD``): no finer time was ever kept.
* A version whose predecessor's archive is gone gets no time and is reported.

What it touches: the current file and every ``.versions/`` archive file under every
content root (``docs/`` and ``tenants/<uuid>/``). For each file it inserts ONE header
line and changes no other byte (the body included) and keeps the file's modification
time, so the archive times the store re-derives stay what they were. It works on the
file's bytes: the new line ends the way the line it follows ends (``\n``, ``\r\n`` or
``\r``), and a guard compares the result with the file byte for byte, so a file it
cannot stamp that way is skipped as ``refused: <why>`` (shown even without
``--verbose``), never rewritten. A file that already has a ``published:`` line (a
real stamp, or an earlier fill) is skipped, so a second run changes nothing. It never reads or writes the accounts database, and it
opens the document store read-only.

It never runs by itself (not on start, not on reindex): it is an explicit command,
run once on the box after the deploy that ships P63, while writes are paused (it is
another process and cannot hold the server's write lock)::

    python -m server.published_fill --dry-run        # print the plan; write nothing
    python -m server.published_fill --commit --push  # fill, commit docs/, push

Any run can be followed by another that finishes it; every next step it prints is a
command that works:

* ``--commit`` commits **the fill's own stamps, wherever they came from**: every
  tracked version file whose only change from ``HEAD`` is the fill's one line (proved
  on the bytes: the file is exactly what the fill makes of its ``HEAD`` content), the
  ones this run wrote and the ones an earlier run without ``--commit`` (or an
  interrupted one) left. Nothing else, ever: no ``add -A``, never an untracked or
  ignored file (a private project's files are never tracked and stay out), never a
  private project's footprint, never a tracked file with any other change, never
  another staged change (the commit takes only its own paths). Each such change is
  listed as ``left <path>: <why>``; a file carrying the fill's line **and** another
  change is left too, and the run asked to commit exits 1.
* ``--push`` pushes whenever the checkout is ahead of ``origin/main`` at the end of
  the run, whether or not this run made the commit (fetch, rebase, non-force push,
  like the write path's). It needs ``--commit`` (``--push`` alone is refused, exit 2,
  as before). A failed push exits 1 and the local commit stays; a tracked change
  left in the tree is reported and the push is not attempted (git cannot rebase over
  it), exit 1.
* A run without ``--commit`` that leaves the fill's stamps uncommitted says so and
  names the command that finishes it (exit 0: it did what it was asked). A
  ``--dry-run`` writes and commits nothing and says what a ``--commit`` would take.
  A run on a clean, pushed tree prints ``nothing to do`` and exits 0.

Exit codes: 0 done; 1 an error, or a commit or push asked for that did not happen;
2 ``--push`` without ``--commit``; 4 the checkout's ``index.lock`` stayed held (or
``KB_ROOT`` is not a git checkout). Then ``python -m server.reindex`` (or the next
boot reindex) reads the times into the store.
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from server import config, documents, gitops
from server.reindex import RESERVED_DIRS

# The roots' walk, as reindex walks them: reserved top-level dirs never hold a
# current document, and a current document is '<YYYY-MM-DD>-<slug>.{md,html}'.
_FILENAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.(md|html)$")

COMMIT_MESSAGE = "docs: stamp best-effort publish times"
REFUSED = "refused: "
_EOL_RE = re.compile(r"\r\n|\r|\n")
INDEX_LOCK_WAIT_S = 10.0


@dataclass
class Planned:
    """One file the fill would stamp (or skip, with ``skip`` saying why)."""

    path: Path
    rel: str  # relative to its content root
    version: int
    at: Optional[str] = None
    source: str = ""  # where the time came from
    skip: Optional[str] = None


@dataclass
class Report:
    planned: list[Planned] = field(default_factory=list)
    written: list[Path] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    commit_sha: Optional[str] = None
    staged: list[str] = field(default_factory=list)
    untracked_changed: int = 0
    git: bool = False  # KB_ROOT is a git checkout with a HEAD
    pending: list[str] = field(default_factory=list)  # the fill's own stamps, uncommitted
    earlier: int = 0  # of those, stamped by an earlier run
    left: list[tuple[str, str]] = field(default_factory=list)  # (path, why) never staged
    would_commit: int = 0  # (dry run) what a --commit run would commit
    ahead: Optional[int] = None  # commits not on origin/main (None: no origin/main)

    def count(self, skip: Optional[str]) -> int:
        return sum(1 for p in self.planned if p.skip == skip)


def _header(text: str, is_html: bool) -> Optional[dict]:
    try:
        meta, _body = (
            documents.parse_html_frontmatter(text)
            if is_html
            else documents.parse_frontmatter(text)
        )
    except documents.FrontmatterError:
        return None
    return meta


def _day_of(meta: Optional[dict], fallback: Optional[str]) -> Optional[str]:
    value = (meta or {}).get("date")
    if isinstance(value, datetime.date):
        value = value.isoformat()
    if isinstance(value, str):
        try:
            return documents.validate_date(value.strip())
        except documents.ConventionError:
            pass
    return fallback


def _version_of(meta: Optional[dict]) -> int:
    try:
        value = int((meta or {}).get("version"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 1
    return value if value >= 1 else 1


def _stamp_of_store_time(value: str) -> Optional[str]:
    try:
        moment = datetime.datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if moment.tzinfo is None:
        moment = moment.astimezone()  # the store's naive times are the box's local time
    return documents.utc_stamp(moment)


def _mtime_stamp(path: Path) -> Optional[str]:
    try:
        moment = datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc)
    except OSError:
        return None
    return documents.utc_stamp(moment)


def _store_times(store: Optional[sqlite3.Connection], tenant_ids: Optional[set[str]],
                 exclude: set[str]) -> dict[str, str]:
    """``{archive_path: created_at}`` for one root's tenants (``None`` = every tenant
    not in ``exclude``: the public root's ``''`` sentinel or tenant #1)."""
    if store is None:
        return {}
    try:
        rows = store.execute(
            "SELECT tenant_id, archive_path, created_at FROM document_versions"
        ).fetchall()
    except sqlite3.Error:
        return {}
    out: dict[str, str] = {}
    for tid, arch, created in rows:
        tid = tid or ""
        if tenant_ids is not None and tid not in tenant_ids:
            continue
        if tenant_ids is None and tid in exclude:
            continue
        out.setdefault(arch, created)
    return out


def _archives(root: Path, stem: str) -> dict[int, Path]:
    """``{version: path}`` of one document's archive files."""
    out: dict[int, Path] = {}
    folder = root / documents.ARCHIVE_DIR / stem
    if not folder.is_dir():
        return out
    for path in folder.iterdir():
        parsed = documents.parse_archive_rel_path(path.relative_to(root).as_posix())
        if parsed is not None and path.is_file():
            out.setdefault(parsed.version, path)
    return out


def _stems(root: Path) -> dict[str, Optional[Path]]:
    """Every document stem under ``root``: ``{stem: current file or None}`` (an
    archive whose current document is gone still gets its own times)."""
    out: dict[str, Optional[Path]] = {}
    if not root.is_dir():
        return out
    for sub in sorted(root.iterdir()):
        if not sub.is_dir() or sub.name in RESERVED_DIRS:
            continue
        for path in sorted([*sub.rglob("*.md"), *sub.rglob("*.html")]):
            if path.is_file() and _FILENAME_RE.match(path.name):
                rel = path.relative_to(root).as_posix()
                out[rel.rsplit(".", 1)[0]] = path
    archive_root = root / documents.ARCHIVE_DIR
    if archive_root.is_dir():
        for project in sorted(archive_root.iterdir()):
            if not project.is_dir():
                continue
            for doc in sorted(project.iterdir()):
                if doc.is_dir():
                    out.setdefault(f"{project.name}/{doc.name}", None)
    return out


def plan_root(root: Path, store_times: dict[str, str]) -> list[Planned]:
    """What the fill would do under one content root (reads only)."""
    planned: list[Planned] = []
    for stem, current in sorted(_stems(root).items()):
        archives = _archives(root, stem)
        files: list[tuple[int, Path]] = sorted(archives.items())
        raws: dict[Path, bytes] = {}
        texts: dict[Path, str] = {}
        metas: dict[Path, Optional[dict]] = {}
        for _v, path in files + ([(0, current)] if current is not None else []):
            try:
                raws[path] = path.read_bytes()
                texts[path] = _as_read(raws[path])
            except (OSError, UnicodeDecodeError) as exc:
                planned.append(Planned(path, path.relative_to(root).as_posix(), 0,
                                       skip=f"unreadable: {exc}"))
                continue
            metas[path] = _header(texts[path], path.suffix == ".html")
        name_day = _FILENAME_RE.match(stem.rsplit("/", 1)[-1] + ".md")
        fallback_day = name_day.group(1) if name_day else None

        def archived_at(v: int) -> tuple[Optional[str], str]:
            path = archives.get(v)
            if path is None:
                return None, ""
            arch_rel = path.relative_to(root).as_posix()
            created = store_times.get(arch_rel)
            if created:
                at = _stamp_of_store_time(created)
                if at:
                    return at, f"v{v} archived (store)"
            at = _mtime_stamp(path)
            return at, f"v{v} archived (file time)" if at else ""

        targets: list[tuple[int, Path]] = list(files)
        if current is not None:
            targets.append((_version_of(metas.get(current)), current))
        for v, path in targets:
            rel = path.relative_to(root).as_posix()
            if path not in texts:
                continue  # reported as unreadable above
            text = texts[path]
            if metas[path] is None:
                planned.append(Planned(path, rel, v, skip="no header"))
                continue
            if documents.has_published_line(text):
                planned.append(Planned(path, rel, v, skip="stamped"))
                continue
            if v == 1:
                at = _day_of(metas[path], fallback_day)
                source = "the document's date"
            else:
                at, source = archived_at(v - 1)
            if not at:
                planned.append(Planned(path, rel, v, skip="no time"))
                continue
            try:
                stamp_bytes(raws[path], at, is_html=path.suffix == ".html")
            except Refused as exc:
                planned.append(Planned(path, rel, v, at=at, source=source,
                                       skip=f"{REFUSED}{exc}"))
                continue
            planned.append(Planned(path, rel, v, at=at, source=source))
    return planned


class Refused(ValueError):
    """The file cannot take the one line without another byte changing."""


def _as_read(raw: bytes) -> str:
    """``raw`` as ``Path.read_text(encoding="utf-8")`` reads it (what reindex parses):
    strict UTF-8, ``\r\n`` and a lone ``\r`` read as ``\n``; a BOM stays in."""
    return raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")


def _parse(text: str, is_html: bool) -> tuple[dict, str]:
    return (documents.parse_html_frontmatter(text) if is_html
            else documents.parse_frontmatter(text))


def stamp_bytes(raw: bytes, at: str, *, is_html: bool) -> bytes:
    """``raw`` with the one best-effort ``published:`` line inserted, every other byte
    kept; raises ``Refused`` (saying why) when that cannot be done.

    The line goes where ``documents.set_frontmatter_published`` puts it (after
    ``version:``, else ``date:``, else first in the header) and ends the way the line
    it follows ends: a header written in ``\r\n`` (or ``\r``) stays in it, and a
    mixed file's new line matches its neighbour above, whose ending is the nearest
    evidence of how that header was written. The guards compare bytes (the result
    minus the inserted bytes is ``raw`` exactly) and then read the result back the
    way reindex reads it (the same header plus this time, the same body).
    """
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise Refused(f"not UTF-8: {exc}") from None
    # [(line, its ending)], split on exactly the three endings; the bare lines are
    # what the header helpers see in text read with universal newlines.
    pieces: list[tuple[str, str]] = []
    pos = 0
    for m in _EOL_RE.finditer(text):
        pieces.append((text[pos:m.start()], m.group()))
        pos = m.end()
    pieces.append((text[pos:], ""))
    bare = [line for line, _end in pieces]
    line = documents.published_line(at, True)
    new = documents.set_frontmatter_published("\n".join(bare), at, best_effort=True)
    new_lines = new.split("\n")
    if len(new_lines) != len(bare) + 1:
        raise Refused("the header does not take exactly one new line")
    k = next((i for i, (a, b) in enumerate(zip(bare, new_lines)) if a != b), len(bare))
    if k < 1 or new_lines[k] != line or new_lines[:k] + new_lines[k + 1:] != bare:
        raise Refused("the header does not take exactly one new line")
    ending = pieces[k - 1][1]
    if not ending:
        raise Refused("the line the stamp follows has no line ending")
    offset = len("".join(a + e for a, e in pieces[:k]).encode("utf-8"))
    inserted = (line + ending).encode("utf-8")
    out = raw[:offset] + inserted + raw[offset:]
    if (len(out) != len(raw) + len(inserted) or out[:offset] != raw[:offset]
            or out[offset + len(inserted):] != raw[offset:]):
        raise Refused("another byte would change")
    try:
        old_meta, old_body = _parse(_as_read(raw), is_html)
        new_meta, new_body = _parse(_as_read(out), is_html)
    except documents.FrontmatterError as exc:
        raise Refused(f"the header would not read back: {exc}") from None
    published = new_meta.pop(documents.PUBLISHED_FIELD, None)
    if (new_meta != old_meta or new_body != old_body
            or documents.parse_published(published) != (at, True)):
        raise Refused("the header would not read back as this time alone")
    return out


def _write(item: Planned) -> None:
    """Insert the one line, keep every other byte and the file's times."""
    raw = item.path.read_bytes()
    if documents.has_published_line(_as_read(raw)):
        raise Refused("stamped since the plan")
    new = stamp_bytes(raw, item.at or "", is_html=item.path.suffix == ".html")
    stat = item.path.stat()
    item.path.write_bytes(new)
    os.utime(item.path, ns=(stat.st_atime_ns, stat.st_mtime_ns))


def _roots() -> list[tuple[Path, Optional[set[str]]]]:
    """``(root, tenant ids or None)``: ``docs/`` (None: its tenant is the ``''``
    sentinel or tenant #1), then every ``tenants/<uuid>/``."""
    roots: list[tuple[Path, Optional[set[str]]]] = [(config.docs_root(), None)]
    tenants = config.kb_root() / "tenants"
    if tenants.is_dir():
        for tdir in sorted(tenants.iterdir()):
            if tdir.is_dir():
                roots.append((tdir, {tdir.name}))
    return roots


def _open_store() -> Optional[sqlite3.Connection]:
    path = config.db_path()
    if not path.is_file():
        return None
    try:
        return sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error:
        return None


def fill(*, dry_run: bool, store: Optional[sqlite3.Connection] = None,
         roots: Optional[list[tuple[Path, Optional[set[str]]]]] = None) -> Report:
    """Plan every root, then (unless ``dry_run``) write the planned lines."""
    report = Report()
    roots = roots if roots is not None else _roots()
    tenant_dirs = {next(iter(t)) for _r, t in roots if t}
    for root, tids in roots:
        times = _store_times(store, tids, tenant_dirs)
        report.planned.extend(plan_root(root, times))
    if dry_run:
        return report
    for item in report.planned:
        if item.skip is not None:
            continue
        try:
            _write(item)
        except Refused as exc:
            item.skip = f"{REFUSED}{exc}"
            continue
        except (OSError, ValueError) as exc:
            report.errors.append(f"{item.rel}: {exc}")
            continue
        report.written.append(item.path)
    return report


# --- the checkout: which uncommitted changes are the fill's own ----------------

FINISH = "python -m server.published_fill --commit --push"
FINISH_LOCAL = "python -m server.published_fill --commit"  # a checkout with no origin/main
LEFT_OTHER = "not the fill's change; never staged"
LEFT_BOTH = "the fill's line and another change; never staged"
LEFT_PRIVATE = "the fill's line in a private project's footprint; never staged"
LEFT_STAGED = "the fill's line, staged differently from the work tree; never staged"


def _git_bytes(args: list[str], *, root: Path) -> Optional[bytes]:
    """A git command's stdout as bytes, or ``None`` when it exits non-zero."""
    cmd = ["git", "-C", str(root), *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=config.git_timeout_s())
    except subprocess.TimeoutExpired as exc:
        raise gitops.GitError(cmd, "timed out") from exc
    return proc.stdout if proc.returncode == 0 else None


def _has_head(root: Path) -> bool:
    return _git_bytes(["rev-parse", "--verify", "--quiet", "HEAD"], root=root) is not None


def _names(args: list[str], *, root: Path) -> set[str]:
    out = gitops._run([*args, "--name-only", "--no-renames", "--relative", "-z"],
                      root=root).stdout
    return {p for p in out.split("\0") if p}


def _ahead(root: Path) -> Optional[int]:
    """Commits on ``HEAD`` that ``origin/main`` lacks (``None``: no ``origin/main``)."""
    try:
        out = gitops._run(["rev-list", "--count", "origin/main..HEAD"], root=root).stdout
    except gitops.GitError:
        return None
    return int(out.strip()) if out.strip().isdigit() else None


def _is_version_file(rel: str) -> bool:
    """Whether ``rel`` (relative to its content root) is a file the fill stamps."""
    if documents.parse_archive_rel_path(rel) is not None:
        return True
    parts = rel.split("/")
    return len(parts) >= 2 and parts[0] not in RESERVED_DIRS and bool(
        _FILENAME_RE.match(parts[-1]))


def _fill_time(raw: bytes, is_html: bool) -> Optional[str]:
    """The time of the fill's (best-effort) line in ``raw``'s header, else ``None``."""
    try:
        meta = _header(_as_read(raw), is_html)
    except UnicodeDecodeError:
        return None
    parsed = documents.parse_published((meta or {}).get(documents.PUBLISHED_FIELD))
    return parsed[0] if parsed and parsed[1] else None


def _why_left(rel: str, *, kb_root: Path, prefixes: list[str], staged: bool,
              private: set[str]) -> Optional[str]:
    """``None`` when the change to ``rel`` (relative to ``kb_root``) is the fill's one
    line and nothing else, else why the fill leaves it.

    The proof is on the bytes: the work-tree file is exactly what ``stamp_bytes``
    makes of its ``HEAD`` content (as git would check it out) with the time the file
    now carries, and a staged copy, if any, is the ``HEAD`` one or that one.
    """
    in_root = next((rel[len(p):] for p in prefixes if rel.startswith(p)), None)
    if in_root is None or not _is_version_file(in_root):
        return LEFT_OTHER
    path = kb_root / rel
    is_html = rel.endswith(".html")
    try:
        work = path.read_bytes() if path.is_file() else None
    except OSError:
        work = None
    head = _git_bytes(["cat-file", "--filters", f"HEAD:./{rel}"], root=kb_root)
    at = _fill_time(work, is_html) if work is not None else None
    if work is None or head is None or at is None:
        return LEFT_OTHER
    try:
        if documents.has_published_line(_as_read(head)):
            return LEFT_OTHER  # HEAD already had a time: the fill never adds a second
    except UnicodeDecodeError:
        return LEFT_OTHER
    try:
        if stamp_bytes(head, at, is_html=is_html) != work:
            return LEFT_BOTH
    except Refused:
        return LEFT_BOTH
    if staged:
        index = _git_bytes(["cat-file", "--filters", f":./{rel}"], root=kb_root)
        if index not in (head, work):
            return LEFT_STAGED
    if private and gitops._in_private_footprint(rel, private):
        return LEFT_PRIVATE
    return None


def scan_checkout(report: Report, *, kb_root: Path,
                  roots: list[tuple[Path, Optional[set[str]]]]) -> None:
    """Sort every uncommitted tracked change into ``report.pending`` (the fill's own
    stamps) and ``report.left`` (anything else, with why), and read how far the
    checkout is ahead of ``origin/main``. Reads only."""
    report.pending, report.left = [], []
    report.git = _has_head(kb_root)
    if not report.git:
        return
    prefixes = []
    for root, _tids in roots:
        try:
            rel = root.resolve().relative_to(kb_root.resolve()).as_posix()
        except ValueError:
            continue  # outside the checkout (a tenants/ root elsewhere): never in git
        prefixes.append("" if rel == "." else rel + "/")
    staged = _names(["diff", "--cached"], root=kb_root)
    changed = _names(["diff", "HEAD"], root=kb_root) | staged
    private = set(gitops.private_projects(kb_root)) if changed else set()
    for rel in sorted(changed):
        why = _why_left(rel, kb_root=kb_root, prefixes=prefixes, staged=rel in staged,
                        private=private)
        if why is None:
            report.pending.append(rel)
        else:
            report.left.append((rel, why))
    written = set(_repo_rels(report.written, kb_root))
    report.earlier = sum(1 for rel in report.pending if rel not in written)
    report.ahead = _ahead(kb_root)


def _repo_rels(paths: list[Path], kb_root: Path) -> list[str]:
    rels = []
    for path in paths:
        try:
            rels.append(path.resolve().relative_to(kb_root.resolve()).as_posix())
        except ValueError:
            continue  # outside the checkout: never in git
    return rels


def would_commit(report: Report, *, kb_root: Path) -> int:
    """(Dry run) how many files a ``--commit`` run would commit: the fill's stamps
    already on disk plus the planned files git tracks that are unchanged now."""
    planned = [p.path for p in report.planned if p.skip is None]
    rels = _repo_rels(planned, kb_root)
    tracked = set(gitops.tracked_paths(rels, root=kb_root)) if rels else set()
    changed = set(report.pending) | {rel for rel, _why in report.left}
    private = set(gitops.private_projects(kb_root)) if tracked else set()
    fresh = [rel for rel in rels if rel in tracked and rel not in changed
             and not (private and gitops._in_private_footprint(rel, private))]
    return len(report.pending) + len(fresh)


def commit_stamps(report: Report, *, kb_root: Path) -> None:
    """Commit ``report.pending`` (the fill's own stamps) and nothing else: one local
    commit of exactly those paths (``git commit -- <paths>`` leaves any other staged
    change staged and out of it)."""
    rels = _repo_rels(report.written, kb_root)
    tracked = gitops.tracked_paths(rels, root=kb_root) if rels else []
    report.untracked_changed = len(report.written) - len(tracked)
    if not report.pending:
        return
    gitops.add(report.pending, root=kb_root)  # its private-projects guard, too
    gitops._run(["--literal-pathspecs", "commit", "-q", "-m", COMMIT_MESSAGE, "--",
                 *report.pending], root=kb_root)
    report.commit_sha = gitops._run(["rev-parse", "HEAD"], root=kb_root).stdout.strip()
    report.staged, report.pending = list(report.pending), []


def format_report(report: Report, *, dry_run: bool, verbose: bool) -> str:
    lines = []
    verb = "would stamp" if dry_run else "stamped"
    for p in report.planned:
        if p.skip is None:
            lines.append(f"{verb} {p.rel} v{p.version} at {p.at} ({p.source})")
        elif verbose or p.skip.startswith(REFUSED):
            lines.append(f"skip {p.rel} v{p.version}: {p.skip}")
    todo = report.count(None)
    lines.append(
        f"{verb}: {todo if dry_run else len(report.written)}; "
        f"already stamped: {report.count('stamped')}; "
        f"no time: {report.count('no time')}; "
        f"no header: {report.count('no header')}"
    )
    for err in report.errors:
        lines.append(f"error: {err}")
    for rel, why in report.left:
        lines.append(f"left {rel}: {why}")
    earlier = f", {report.earlier} of them stamped by an earlier run" if report.earlier else ""
    if report.commit_sha:
        lines.append(f"committed {len(report.staged)} file(s){earlier}: {report.commit_sha}")
    if dry_run and report.git:
        n = report.would_commit
        lines.append(f"--commit would commit {n} file(s){earlier}" if n
                     else "--commit would commit nothing")
        if report.ahead:
            lines.append(f"--push would push {report.ahead} commit(s) not on origin/main")
    return "\n".join(lines)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m server.published_fill",
        description=(
            "Give every version without a publish time one best-effort time, once, "
            "from the store's archive times (v1: the document's date). Inserts one "
            "header line per file, in the file's own line ending, changes no other "
            "byte (a file it cannot stamp so is skipped as refused), keeps file "
            "times, skips a file that already has a time. A later run finishes what "
            "an earlier one left: it commits the fill's uncommitted stamps and pushes "
            "an unpushed commit. Run it ONLY while KB writes are paused."
        ),
        epilog=(
            "exit: 0 done; 1 an error, or a commit or push asked for that did not "
            "happen; 2 --push without --commit; 4 index.lock held or no git checkout"
        ),
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="print what would be stamped, committed and pushed; "
                             "write nothing")
    parser.add_argument("--commit", action="store_true",
                        help="commit the fill's own stamps (this run's and any an "
                             "earlier run left) that git tracks, and nothing else")
    parser.add_argument("--push", action="store_true",
                        help="push when the checkout is ahead of origin/main, after "
                             "the commit (fetch, rebase, non-force push; needs --commit)")
    parser.add_argument("--verbose", action="store_true",
                        help="also list every file skipped, and why")
    return parser


def _wait_for_index_lock(root: Path, timeout: float = INDEX_LOCK_WAIT_S) -> bool:
    lock = gitops.index_lock_path(root)
    deadline = time.monotonic() + timeout
    while lock.exists():
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.25)
    return True


def main(argv: Optional[list[str]] = None) -> int:
    args = _parser().parse_args(argv)
    if args.push and not args.commit:
        print(f"refused: --push needs --commit (run: {FINISH})", file=sys.stderr)
        return 2
    kb_root = config.kb_root()
    if args.commit and not args.dry_run:
        try:
            if not _wait_for_index_lock(kb_root, INDEX_LOCK_WAIT_S):
                print("refused: index.lock is still held; is a write or another git "
                      "running?", file=sys.stderr)
                return 4
        except gitops.GitError:
            print("refused: KB_ROOT is not a git checkout", file=sys.stderr)
            return 4
    roots = _roots()
    store = _open_store()
    try:
        report = fill(dry_run=args.dry_run, store=store, roots=roots)
    finally:
        if store is not None:
            store.close()
    try:
        scan_checkout(report, kb_root=kb_root, roots=roots)
        if args.dry_run and report.git:
            report.would_commit = would_commit(report, kb_root=kb_root)
        if args.commit and not args.dry_run:
            if not report.git:
                report.errors.append("KB_ROOT's checkout has no commit yet; nothing committed")
            else:
                commit_stamps(report, kb_root=kb_root)
                report.ahead = _ahead(kb_root)
    except gitops.GitError as exc:
        report.errors.append(f"git failed: {exc.stderr or exc}")
    print(format_report(report, dry_run=args.dry_run, verbose=args.verbose))

    finish = FINISH if report.ahead is not None else FINISH_LOCAL
    rc = 1 if report.errors else 0
    if args.dry_run:
        return rc
    if report.pending:
        print(f"not committed: {len(report.pending)} file(s) carry the fill's line, "
              f"uncommitted (the deploy refuses a dirty tracked tree); finish with: {finish}")
        if args.commit:
            rc = 1
    both = [rel for rel, why in report.left if why != LEFT_OTHER]
    if both:
        print(f"not committed: {len(both)} file(s) carry the fill's line but are left "
              "(each 'left' line above says why); the fill never commits those. A "
              "private project's tracked files are the reconcile's (python -m "
              "server.reconcile). For another change: settle it (if it is unwanted, "
              "git restore --staged --worktree -- <path> drops it and the line), "
              f"then re-run: {finish}")
        if args.commit:
            rc = 1
    pushed = False
    if args.push and (report.ahead is None or report.ahead > 0):
        if report.errors:
            print(f"not pushed: fix the error(s) above, then re-run: {FINISH}",
                  file=sys.stderr)
        elif report.left or report.pending:
            print("push not attempted: git cannot rebase over the tracked changes "
                  f"listed as left above; settle them, then re-run: {FINISH}",
                  file=sys.stderr)
            rc = 1
        else:
            try:
                sha = gitops.push(root=kb_root)
            except gitops.GitError as exc:
                print(f"push FAILED: {exc.stderr or exc}; the local commit stays; "
                      f"re-run once origin is reachable: {FINISH}", file=sys.stderr)
                rc = 1
            else:
                print(f"pushed: origin/main is now {sha}")
                report.ahead, pushed = 0, True
    elif report.ahead and not report.errors and not args.push:
        print(f"push owed: {report.ahead} commit(s) here are not on origin/main; "
              f"finish with: {finish}")
    if report.written or report.commit_sha or pushed:
        print("next: python -m server.reindex reads the times into the store")
    elif rc == 0 and not report.pending and not both and not report.ahead:
        print("nothing to do: no version needs a time"
              + (", and nothing of the fill's is uncommitted or unpushed" if report.git
                 else ""))
    return rc


if __name__ == "__main__":
    sys.exit(main())
