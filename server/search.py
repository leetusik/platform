"""FTS5 query layer: quoted-token MATCH builder + weighted, recency-aware BM25 search.

Each whitespace token is individually double-quoted before MATCH, so raw FTS5
operator syntax (``NEAR/AND(``, ``*``, unbalanced parens, ...) collapses to
harmless quoted phrases and can never 500 the endpoint. ``raw=True`` opts into
verbatim FTS5 syntax deliberately, and maps a syntax error to HTTP 400.

CJK/Hangul tokens are emitted as prefix queries (``"검색"*``) so a stem matches its
inflected forms — Korean particles are suffixes, so a prefix match neutralizes them
(검색 -> 검색을 / 검색이란) without a tokenizer/schema change. Pure-ASCII tokens keep the
exact porter-stemmed behavior. Accepted limitations: mid-word substrings (라클) do not
match, and a pure-ASCII query will not match inside a mixed token (changple5 vs
changple5의).

HYBRID FUSION (P4.S6): when embeddings are enabled and ``raw=False``, a third signal
— Gemini query/document cosine similarity — joins the keyword ordering via Reciprocal
Rank Fusion (``score = Σ_lists 1/(RRF_K + rank)``). The candidate set is the union of the
keyword matches and the top vector neighbors, so a semantically-relevant doc with no
keyword overlap still surfaces (with a leading-text snippet, ``signals.bm25`` absent).
No key, an embed failure, or ``raw=True`` degrades to the exact BM25 + recency path.
"""
from __future__ import annotations

import datetime
import json
import math
import re
import sqlite3
from typing import Any, Optional

from server import config, db, embeddings

# Reciprocal Rank Fusion constant: the standard dampener (Cormack et al. 2009). A
# larger K flattens the contribution of top ranks; 60 is the widely-used default.
RRF_K = 60

# Vector-only hits have no FTS snippet; fall back to a leading-text excerpt.
_EXCERPT_CHARS = 240
_WS_RE = re.compile(r"\s+")


class SearchQueryError(ValueError):
    """A raw=True MATCH expression was rejected by FTS5 (main.py maps to HTTP 400)."""


# bm25 column weights: title 8x, tags 4x, body 1x. The FTS columns are ordered
# (title, tags_text, markdown), so these weights map to those fields respectively.
_RANK = "bm25(documents_fts, 8.0, 4.0, 1.0)"
# snippet over column 2 (markdown), hits wrapped in <mark>, ellipsis, up to 64 tokens.
# 64 is FTS5's ceiling for snippet()'s token count (https://www.sqlite.org/fts5.html,
# "The snippet() Function"); it takes no width in characters. FTS5 centres the
# fragment on the hits, so 64 tokens leave about 32 words each side: room for the
# Library's excerpt (48 characters before the match and 72 after, cut by the web)
# on prose, which 12 tokens was not (P63, OQ3).
_SNIPPET_TOKENS = 64
_SNIPPET = f"snippet(documents_fts, 2, '<mark>', '</mark>', '…', {_SNIPPET_TOKENS})"

# The snippet is only the fallback for a match in the text: FTS5 weights a fragment
# that starts a column or follows "." or ":" (https://www.sqlite.org/fts5.html, 5.1.3,
# read 2026-11-17), so on real prose it starts at the match's sentence and leaves a
# few characters before it. A hit on the page that matches in the text has its
# snippet rebuilt from highlight() (5.1.2: the whole column, every phrase match
# marked, so the same tokens FTS5 matched, stems and CJK prefixes included), cut
# around the first match: at least _WANT_BEFORE plain characters before it and
# _WANT_AFTER after it where the text has them (the Library cuts 48 and 72, P63-S25),
# never more than _CUT_CAP raw characters either side.
_HL_OPEN, _HL_CLOSE = "", ""  # private-use: never in a document's text
_HIGHLIGHT = "highlight(documents_fts, 2, char(57344), char(57345))"
_WANT_BEFORE = 64
_WANT_AFTER = 96
_CUT_CAP = 480
_CUT_STEP = 8
_SNAP = 16  # how far a cut may move to land on white space
_HEADING_RE = re.compile(r"(^|[\s>…])#{1,6}[ \t]+")
_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_EMPH_RE = re.compile(r"\*\*|__|`+|~~")
_SENTINEL_RE = re.compile("[]")


def _plain_len(text: str) -> int:
    """Length of ``text`` as the web's ``plainText`` reads it (lib/library/excerpt.ts)."""
    t = _HEADING_RE.sub(r"\1", _SENTINEL_RE.sub("", text))
    t = _EMPH_RE.sub("", _LINK_RE.sub(r"\1", t))
    return len(_WS_RE.sub(" ", t).strip())


def _cut_around_match(hl: str) -> Optional[str]:
    """The snippet for a text match, from ``hl`` (the column with sentinel marks).

    The same shape as FTS5's snippet: ``<mark>`` around each match, ``…`` where the text
    goes on before or after. None when ``hl`` marks nothing (the match was elsewhere).
    """
    i = hl.find(_HL_OPEN)
    if i < 0:
        return None
    e = hl.find(_HL_CLOSE, i)
    e = len(hl) if e < 0 else e + 1
    n = len(hl)

    # Before: step back until the plain text holds enough, then snap to white space.
    a = i
    while a > 0 and i - a < _CUT_CAP and _plain_len(hl[a:i]) < _WANT_BEFORE:
        a = max(0, a - _CUT_STEP)
    if a > 0:
        ws = next((k for k in range(a, min(a + _SNAP, i)) if hl[k].isspace()), None)
        if ws is not None:
            a = ws + 1

    # After: step on likewise; never end inside a later mark.
    z = e
    while z < n and z - e < _CUT_CAP and _plain_len(hl[e:z]) < _WANT_AFTER:
        z = min(n, z + _CUT_STEP)
    if z < n:
        ws = next((k for k in range(z, max(z - _SNAP, e), -1) if hl[k].isspace()), None)
        if ws is not None:
            z = ws
    cut = hl[a:z]
    if cut.rfind(_HL_OPEN) > cut.rfind(_HL_CLOSE):
        close = hl.find(_HL_CLOSE, z)
        z = n if close < 0 else close + 1
        cut = hl[a:z]

    out = cut.replace(_HL_OPEN, "<mark>").replace(_HL_CLOSE, "</mark>")
    return ("…" if a > 0 else "") + out + ("…" if z < n else "")


def _widen_snippets(
    conn: sqlite3.Connection, page: list[dict[str, Any]], match: str, kw_ids: set[int]
) -> list[dict[str, Any]]:
    """Rebuild the snippet of each keyword hit on the page that matches in the text.

    One query over the page's keyword hits only; a hit whose text holds no match (a
    title or tag match), or any failure, keeps FTS5's snippet. Matching, ranking and
    every other field are untouched.
    """
    ids = [int(r["id"]) for r in page if int(r["id"]) in kw_ids]
    if not ids:
        return page
    marks = ",".join("?" * len(ids))
    try:
        rows = conn.execute(
            f"SELECT rowid AS id, {_HIGHLIGHT} AS hl FROM documents_fts "
            f"WHERE documents_fts MATCH ? AND rowid IN ({marks})",
            [match, *ids],
        ).fetchall()
    except sqlite3.Error:
        return page
    cuts: dict[int, str] = {}
    for row in rows:
        cut = _cut_around_match(row["hl"] or "")
        if cut is not None:
            cuts[int(row["id"])] = cut
    for r in page:
        if int(r["id"]) in cuts:
            r["snippet"] = cuts[int(r["id"])]
    return page

# Recency signal: a document's freshness contribution decays exponentially with age.
# recency = exp(-age_days * ln2 / HALF_LIFE_DAYS) — 0 days -> 1.0, HALF_LIFE_DAYS -> 0.5.
# The final score adds RECENCY_WEIGHT * recency to the higher-is-better bm25 signal.
# BM25 IDF collapses to 0.0 on tiny corpora, so recency is the effective tiebreak there.
HALF_LIFE_DAYS = 90
RECENCY_WEIGHT = 0.5
_LN2 = math.log(2)


def _has_cjk(text: str) -> bool:
    """True if any char is Hangul / CJK ideograph / Kana (word-splitless scripts)."""
    for ch in text:
        o = ord(ch)
        if (
            0xAC00 <= o <= 0xD7AF  # Hangul syllables
            or 0x1100 <= o <= 0x11FF  # Hangul Jamo
            or 0x3130 <= o <= 0x318F  # Hangul Compatibility Jamo
            or 0x3040 <= o <= 0x30FF  # Hiragana + Katakana
            or 0x4E00 <= o <= 0x9FFF  # CJK Unified Ideographs
        ):
            return True
    return False


def _recency(date_str: Optional[str], today: datetime.date) -> float:
    """Exponential-decay freshness in [0, 1] from a 'YYYY-MM-DD' date (age clamped >= 0)."""
    try:
        doc_date = datetime.date.fromisoformat(str(date_str))
    except (TypeError, ValueError):
        return 0.0
    age_days = max((today - doc_date).days, 0)
    return math.exp(-age_days * _LN2 / HALF_LIFE_DAYS)


def build_match_query(q: str) -> str:
    """Wrap each whitespace token in FTS5 double quotes (internal ``"`` doubled).

    Tokens joined by spaces are ANDed implicitly. Quoting neutralizes every FTS5
    operator, so the produced expression is always a valid MATCH string. A token that
    contains CJK/Hangul/Kana characters is emitted as a prefix query (``"tok"*``) so it
    matches inflected forms; pure-ASCII tokens keep exact porter-stemmed matching.
    """
    parts: list[str] = []
    for tok in q.split():
        quoted = '"' + tok.replace('"', '""') + '"'
        if _has_cjk(tok):
            quoted += "*"
        parts.append(quoted)
    return " ".join(parts)


def _parse_tags(raw_tags: Any) -> list[str]:
    try:
        val = json.loads(raw_tags or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return val if isinstance(val, list) else []


def _excerpt(markdown: Optional[str]) -> str:
    """Leading-text snippet for a vector-only hit (no FTS <mark> highlighting)."""
    text = _WS_RE.sub(" ", (markdown or "").strip())
    return text[:_EXCERPT_CHARS] + ("…" if len(text) > _EXCERPT_CHARS else "")


def _finalize(rec: dict[str, Any]) -> dict[str, Any]:
    """Project an internal record to the public result shape.

    ``signals`` is ``{bm25?, recency, vector?}``: ``bm25`` only for keyword hits,
    ``vector`` only when a cosine similarity participated.
    """
    signals: dict[str, Any] = {}
    if rec["_bm25"] is not None:
        signals["bm25"] = rec["_bm25"]
    signals["recency"] = rec["_recency"]
    if rec["_vector"] is not None:
        signals["vector"] = rec["_vector"]
    return {
        "id": rec["id"],
        "project": rec["project"],
        "slug": rec["slug"],
        "date": rec["date"],
        "title": rec["title"],
        "tags": rec["tags"],
        "rel_path": rec["rel_path"],
        "source_repo": rec["source_repo"],
        "created_at": rec["created_at"],
        "updated_at": rec["updated_at"],
        "score": rec["_score"],
        "snippet": rec["snippet"],
        "signals": signals,
    }


def _vector_ordering(
    conn: sqlite3.Connection,
    q: str,
    *,
    project: Optional[str],
    tag: Optional[str],
    today: datetime.date,
    tenant_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Embed the query and rank all candidate embeddings by cosine similarity.

    Returns records (with ``_vector`` = rounded cosine) in descending similarity, or
    ``[]`` on any failure / empty candidate set — every caller degrades to BM25-only.
    ``tenant_id`` (when set) scopes the candidate set so semantic hits stay in-tenant.
    """
    if not config.embeddings_enabled():
        return []
    model = config.embedding_model()
    try:
        qvec = embeddings.embed_texts([q], kind="query")[0]
    except embeddings.EmbeddingError:
        return []  # no key / API failure / timeout -> graceful degradation

    cands = db.get_all_embeddings(conn, model, project=project, tag=tag, tenant_id=tenant_id)
    scored: list[dict[str, Any]] = []
    for c in cands:
        sim = embeddings.cosine(qvec, embeddings.unpack_vector(c["_vector"]))
        scored.append(
            {
                "id": c["id"],
                "project": c["project"],
                "slug": c["slug"],
                "date": c["date"],
                "title": c["title"],
                "tags": _parse_tags(c.get("tags")),
                "rel_path": c["rel_path"],
                "source_repo": c["source_repo"],
                "created_at": c["created_at"],
                "updated_at": c["updated_at"],
                "snippet": _excerpt(c.get("markdown")),
                "_bm25": None,
                "_recency": round(_recency(c["date"], today), 4),
                "_vector": round(sim, 6),
            }
        )
    scored.sort(key=lambda r: (r["_vector"], r["date"], r["id"]), reverse=True)
    return scored


def _attach_chapters(
    conn: sqlite3.Connection, page: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Add ``book`` / ``chapter_key`` / ``lang`` to each hit on the page (P30.S2).

    Additive: a document bound as a chapter variant carries its book slug, chapter
    key and variant language; a loose document carries three ``None``s. Only the
    returned page is looked up (one query), never the whole ranked set.
    """
    bindings = db.chapter_bindings_for_docs(conn, [r["id"] for r in page])
    for r in page:
        b = bindings.get(int(r["id"]))
        r["book"] = b["book"] if b else None
        r["chapter_key"] = b["chapter_key"] if b else None
        r["lang"] = b["lang"] if b else None
    return page


def search(
    conn: sqlite3.Connection,
    q: str,
    *,
    project: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    raw: bool = False,
    tenant_id: Optional[str] = None,
) -> dict[str, Any]:
    """Hybrid (BM25 + recency + vector) search over documents, best-and-newest first.

    Returns ``{"results": [...], "total": N, "mode": "bm25"|"hybrid"}``. ``results`` is
    the ``offset``..``offset+limit`` window of the final ranking; ``total`` is the size of
    the ranked set (the MATCH+filter match count in BM25 mode, the fused-union size in
    hybrid mode). ``mode`` is ``"hybrid"`` only when the vector signal participated.

    Blank ``q`` -> empty. ``raw=True`` passes ``q`` verbatim as the MATCH expression
    (SearchQueryError on FTS5 syntax errors) and stays keyword-only. Otherwise tokens are
    quoted (CJK prefix-expanded) and, when embeddings are enabled, the query is embedded
    and its cosine ordering is fused with the keyword ordering via RRF (``RRF_K``).

    Each result carries the document fields (minus ``markdown``) plus ``score``, a
    ``snippet``, ``signals`` ``{bm25?, recency, vector?}``, and (P30.S2) ``book`` /
    ``chapter_key`` / ``lang`` — set for a chapter variant, ``None`` for a loose
    document. In BM25 mode ``score`` is
    ``bm25 + RECENCY_WEIGHT * recency`` (higher-is-better); in hybrid mode ``score`` is the
    RRF fusion of the keyword and vector orderings. A vector-only hit (semantic match, no
    keyword overlap) has no ``bm25`` signal and a leading-text ``snippet``.
    """
    empty = {"results": [], "total": 0, "mode": "bm25"}
    if not q or not q.strip():
        return empty
    match = q if raw else build_match_query(q)
    if not match.strip():
        return empty

    base = """
        FROM documents_fts
        JOIN documents d ON d.id = documents_fts.rowid
        WHERE documents_fts MATCH ?
    """
    filters = ""
    fparams: list[Any] = []
    if tenant_id is not None:
        filters += " AND d.tenant_id = ?"
        fparams.append(tenant_id)
    if project is not None:
        filters += " AND d.project = ?"
        fparams.append(project)
    if tag is not None:
        filters += " AND EXISTS (SELECT 1 FROM json_each(d.tags) WHERE value = ?)"
        fparams.append(tag)

    # total = full match count for MATCH + filters, independent of the paged window.
    count_sql = "SELECT COUNT(*) AS n " + base + filters
    # Fetch every matching row (no SQL LIMIT): re-ranking is a Python-side signal fusion,
    # so the correct page can only be sliced after the full set is re-ordered.
    rows_sql = (
        f"SELECT d.id, d.project, d.slug, d.date, d.title, d.tags, d.rel_path, "
        f"d.source_repo, d.created_at, d.updated_at, {_RANK} AS rank, {_SNIPPET} AS snippet "
        + base
        + filters
    )
    params = [match, *fparams]

    try:
        total = int(conn.execute(count_sql, params).fetchone()["n"])
        rows = conn.execute(rows_sql, params).fetchall()
    except sqlite3.OperationalError as exc:
        # Only reachable with raw=True; quoted tokens never yield operator syntax.
        raise SearchQueryError(str(exc)) from exc

    today = datetime.date.today()
    # Keyword records, keyed by doc id. bm25() is a negative distance (more negative =
    # better); flip to a higher-is-better score so it fuses cleanly with recency/vector.
    kw: dict[int, dict[str, Any]] = {}
    for row in rows:
        d = dict(row)
        bm25 = round(-float(d["rank"]), 4)
        recency = round(_recency(d["date"], today), 4)
        kw[int(d["id"])] = {
            "id": d["id"],
            "project": d["project"],
            "slug": d["slug"],
            "date": d["date"],
            "title": d["title"],
            "tags": _parse_tags(d.get("tags")),
            "rel_path": d["rel_path"],
            "source_repo": d["source_repo"],
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
            "snippet": d["snippet"],
            "_bm25": bm25,
            "_recency": recency,
            "_vector": None,
            "_kwscore": round(bm25 + RECENCY_WEIGHT * recency, 4),
        }

    # Keyword ordering: composed score DESC, date DESC, id DESC (deterministic tiebreak).
    kw_order = sorted(
        kw.values(), key=lambda r: (r["_kwscore"], r["date"], r["id"]), reverse=True
    )

    vector_ranked = [] if raw else _vector_ordering(
        conn, q, project=project, tag=tag, today=today, tenant_id=tenant_id
    )

    # No vector signal -> exact BM25 + recency behavior (graceful degradation).
    if not vector_ranked:
        for rec in kw_order:
            rec["_score"] = rec["_kwscore"]
        results = [_finalize(r) for r in kw_order]
        page = _attach_chapters(conn, results[offset : offset + limit])
        page = _widen_snippets(conn, page, match, set(kw))
        return {"results": page, "total": total, "mode": "bm25"}

    # --- RRF fusion of the keyword ordering and the vector ordering ---
    kw_rank = {r["id"]: i + 1 for i, r in enumerate(kw_order)}
    vec_rank = {r["id"]: i + 1 for i, r in enumerate(vector_ranked)}

    # Materialize a record per union doc: reuse the keyword record when present (it owns
    # bm25 + snippet), else the vector-only record. Attach the cosine to keyword hits.
    records: dict[int, dict[str, Any]] = dict(kw)
    for r in vector_ranked:
        did = r["id"]
        if did in records:
            records[did]["_vector"] = r["_vector"]
        else:
            records[did] = r

    fused: list[dict[str, Any]] = []
    for did, rec in records.items():
        rrf = 0.0
        if did in kw_rank:
            rrf += 1.0 / (RRF_K + kw_rank[did])
        if did in vec_rank:
            rrf += 1.0 / (RRF_K + vec_rank[did])
        rec["_score"] = round(rrf, 6)
        fused.append(rec)

    fused.sort(key=lambda r: (r["_score"], r["date"], r["id"]), reverse=True)
    results = [_finalize(r) for r in fused]
    page = _attach_chapters(conn, results[offset : offset + limit])
    page = _widen_snippets(conn, page, match, set(kw))
    return {"results": page, "total": len(records), "mode": "hybrid"}
