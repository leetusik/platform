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
time, so the archive times the store re-derives stay what they were. A file that
already has a ``published:`` line (a real stamp, or an earlier fill) is skipped, so a
second run changes nothing. It never reads or writes the accounts database, and it
opens the document store read-only.

It never runs by itself (not on start, not on reindex): it is an explicit command,
run once on the box after the deploy that ships P63, while writes are paused (it is
another process and cannot hold the server's write lock)::

    python -m server.published_fill --dry-run        # print the plan; write nothing
    python -m server.published_fill --commit --push  # fill, commit docs/, push

``--commit`` stages the changed files that git already tracks (a public project's
documents and archives; a private project's files are never tracked and stay out)
and makes one local commit, so the box's checkout is clean again (the deploy refuses
a dirty tracked tree). ``--push`` pushes that commit once (fetch, rebase, non-force
push, like the write path's). Then ``python -m server.reindex`` (or the next boot
reindex) reads the times into the store.
"""
from __future__ import annotations

import argparse
import datetime
import os
import re
import sqlite3
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
        texts: dict[Path, str] = {}
        metas: dict[Path, Optional[dict]] = {}
        for _v, path in files + ([(0, current)] if current is not None else []):
            try:
                texts[path] = path.read_text(encoding="utf-8")
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
            planned.append(Planned(path, rel, v, at=at, source=source))
    return planned


def _write(item: Planned) -> None:
    """Insert the one line, keep every other byte and the file's times."""
    text = item.path.read_text(encoding="utf-8")
    new = documents.set_frontmatter_published(text, item.at, best_effort=True)
    line = documents.published_line(item.at, True) + "\n"
    if new == text or new.replace(line, "", 1) != text:
        raise ValueError(f"{item.rel}: the header could not take exactly one line")
    stat = item.path.stat()
    item.path.write_text(new, encoding="utf-8")
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
        except (OSError, ValueError) as exc:
            report.errors.append(f"{item.rel}: {exc}")
            continue
        report.written.append(item.path)
    return report


def commit_written(report: Report, *, kb_root: Path) -> None:
    """Stage the written files git already tracks and make one local commit."""
    rels = []
    for path in report.written:
        try:
            rels.append(path.resolve().relative_to(kb_root.resolve()).as_posix())
        except ValueError:
            continue  # outside the checkout (a tenants/ root elsewhere): never in git
    tracked = gitops.tracked_paths(rels, root=kb_root) if rels else []
    report.untracked_changed = len(report.written) - len(tracked)
    if not tracked:
        return
    gitops.add(tracked, root=kb_root)
    report.staged = gitops.staged_paths(tracked, root=kb_root)
    if gitops.has_staged_changes(root=kb_root):
        report.commit_sha = gitops.commit(COMMIT_MESSAGE, root=kb_root)


def format_report(report: Report, *, dry_run: bool, verbose: bool) -> str:
    lines = []
    verb = "would stamp" if dry_run else "stamped"
    for p in report.planned:
        if p.skip is None:
            lines.append(f"{verb} {p.rel} v{p.version} at {p.at} ({p.source})")
        elif verbose:
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
    if report.commit_sha:
        lines.append(f"committed {len(report.staged)} file(s): {report.commit_sha}")
    return "\n".join(lines)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m server.published_fill",
        description=(
            "Give every version without a publish time one best-effort time, once, "
            "from the store's archive times (v1: the document's date). Inserts one "
            "header line per file, changes no other byte, keeps file times, skips a "
            "file that already has a time. Run it ONLY while KB writes are paused."
        ),
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="print what would be stamped; write nothing")
    parser.add_argument("--commit", action="store_true",
                        help="stage the changed files git tracks and make one local commit")
    parser.add_argument("--push", action="store_true",
                        help="push once after the commit (needs --commit)")
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
        print("refused: --push needs --commit", file=sys.stderr)
        return 2
    kb_root = config.kb_root()
    if args.commit and not args.dry_run:
        try:
            if not _wait_for_index_lock(kb_root):
                print("refused: index.lock is still held; is a write or another git "
                      "running?", file=sys.stderr)
                return 4
        except gitops.GitError:
            print("refused: KB_ROOT is not a git checkout", file=sys.stderr)
            return 4
    store = _open_store()
    try:
        report = fill(dry_run=args.dry_run, store=store)
    finally:
        if store is not None:
            store.close()
    if args.commit and not args.dry_run and report.written:
        try:
            commit_written(report, kb_root=kb_root)
        except gitops.GitError as exc:
            report.errors.append(f"commit failed: {exc.stderr or exc}")
    print(format_report(report, dry_run=args.dry_run, verbose=args.verbose))
    if report.errors:
        return 1
    if args.dry_run:
        return 0
    if args.push and report.commit_sha:
        try:
            sha = gitops.push(root=kb_root)
        except gitops.GitError as exc:
            print(f"push FAILED: {exc.stderr or exc}; the local commit stays", file=sys.stderr)
            return 1
        print(f"pushed: origin/main is now {sha}")
    elif report.commit_sha:
        print("push still owed: nothing was pushed (re-run with --push)")
    elif report.written and not args.commit:
        print("not committed: if git tracks any of these files, re-run with --commit "
              "(the deploy refuses a dirty tracked tree)")
    print("next: python -m server.reindex reads the times into the store")
    return 0


if __name__ == "__main__":
    sys.exit(main())
