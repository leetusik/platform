"""The search snippet holds the Library's excerpt (P63, OQ3).

The Library's documents table shows a text match as an excerpt of 48 characters
before the match and 72 after (`LibraryDocs`, round 02), cut by the web from the
search's ``snippet``. FTS5's ``snippet()`` counts tokens, not characters, and centres
the fragment on the hit, so the server asks for its most (64) and these pins hold the
widths on prose: an early match keeps all the text before it, a middle one 48 and 72
at least, a late one all the text after it.

FTS5 also weights a fragment that follows "." or ":", so on real sentences its
snippet starts at the match's sentence (``…At the end the <mark>lantern</mark>``);
the word lists below have no full stops and never showed it. The search therefore
cuts a text match's snippet itself, around highlight()'s first mark, and the
sentence fixtures at the end pin that.
"""
from __future__ import annotations

import re

import pytest

from server import db, search

BEFORE, AFTER = 48, 72
_MARK = re.compile(r"<mark>(.*?)</mark>")


def _prose(n: int) -> list[str]:
    words = ["reading", "the", "library", "keeps", "a", "place", "for", "every", "text"]
    return [f"{words[i % len(words)]}{i}" for i in range(n)]


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "kb.sqlite3")
    yield c
    c.close()


def _widths(conn, body: str, q: str) -> tuple[int, int, str]:
    db.upsert_document(
        conn, project="p", slug="s", date="2026-11-01", title="Long", tags=[],
        source_repo=None, rel_path="p/2026-11-01-s.md", markdown=body,
    )
    (hit,) = search.search(conn, q)["results"]
    snippet = hit["snippet"].strip("…")
    m = _MARK.search(snippet)
    assert m, snippet
    return m.start(), len(snippet) - m.end(), snippet


@pytest.mark.parametrize("at", [3, 150, 297])
def test_an_excerpt_holds_the_signed_widths_on_english_prose(conn, at):
    words = _prose(300)
    body = " ".join(words)
    before, after, _ = _widths(conn, body, words[at])
    start = body.index(words[at])
    end = start + len(words[at])
    assert before >= min(BEFORE, start)
    assert after >= min(AFTER, len(body) - end)


def test_an_excerpt_holds_the_signed_widths_on_korean_prose(conn):
    words = [f"도서관은{i}" if i % 2 else f"읽기를{i}" for i in range(300)]
    body = " ".join(words)
    before, after, _ = _widths(conn, body, words[150])
    assert before >= BEFORE and after >= AFTER


def test_the_marks_and_ellipses_are_as_before(conn):
    words = _prose(300)
    _, _, snippet = _widths(conn, " ".join(words), words[150])
    hit = search.search(conn, words[150])["results"][0]["snippet"]
    assert hit.startswith("…") and hit.endswith("…")
    assert snippet.count("<mark>") == 1 and snippet.count("</mark>") == 1


_KEEPER = (
    "The keeper climbed the stairs every evening before dark. He trimmed the wick "
    "and wiped the glass. Ships passed far out on the water and nobody thanked him. "
    "The winter was long and the oil ran low. "
)


def _sentences() -> str:
    return (
        "## The keeper\n\n" + "Early the bell rang. " + _KEEPER * 4
        + "Midway the gull cried once. " + _KEEPER * 4
        + "At the end the lantern went out."
    )


@pytest.mark.parametrize("q", ["bell", "gull", "lantern"])
def test_an_excerpt_holds_the_signed_widths_on_sentences(conn, q):
    body = _sentences()
    before, after, snippet = _widths(conn, body, q)
    start = body.index(q)
    end = start + len(q)
    assert before >= min(BEFORE, start), snippet
    assert after >= min(AFTER, len(body) - end), snippet


def test_an_excerpt_holds_the_signed_widths_on_korean_sentences(conn):
    filler = "도서관은 모든 글을 위한 자리를 남겨 둔다. 읽는 사람은 천천히 문장을 따라간다. " * 6
    body = filler + "마지막에 등불이 꺼졌다. " + filler
    before, after, snippet = _widths(conn, body, "등불")
    assert before >= BEFORE and after >= AFTER, snippet


def test_a_stemmed_match_marks_the_text_word_with_both_ellipses(conn):
    body = _sentences() + " " + _KEEPER * 2
    db.upsert_document(
        conn, project="p", slug="s", date="2026-11-01", title="Long", tags=[],
        source_repo=None, rel_path="p/2026-11-01-s.md", markdown=body,
    )
    snippet = search.search(conn, "lanterns")["results"][0]["snippet"]
    assert snippet.startswith("…") and snippet.endswith("…")
    assert _MARK.findall(snippet) == ["lantern"]


# ---- the Library table's text reads (P63) --------------------------------------
# All documents counts and pages a search over every document whose TEXT matches, and
# shows the excerpt of the rows on its page. ``text_matches`` and ``text_snippets`` serve
# both in two reads whatever the library's size, and never embed the query: with an
# embeddings key set, ``search`` embeds once per call, so a table that paged it to its
# ``total`` paid once per page of 50.


def _doc(conn, i: int, *, title: str = "", body: str = "", tags=(), tenant: str = "t") -> int:
    return db.upsert_document(
        conn, project="p", slug=f"s{i}", date="2026-01-01", title=title or f"T{i}",
        tags=list(tags), source_repo=None, rel_path=f"p/2026-01-01-s{i}.md",
        markdown=body or "alpha beta gamma", tenant_id=tenant,
    )


@pytest.fixture
def embedded(monkeypatch):
    """Embeddings on, the query embedding stubbed (no network) and its calls counted."""
    from server import config, embeddings

    calls = {"n": 0}

    def fake(texts, *, kind, retries=0):
        calls["n"] += 1
        return [[1.0, 0.0, 0.0] for _ in texts]

    monkeypatch.setattr(config, "embeddings_enabled", lambda: True)
    monkeypatch.setattr(embeddings, "embed_texts", fake)
    return calls


def test_the_tables_text_reads_never_embed_the_query(conn, embedded):
    from server import config, embeddings

    model = config.embedding_model()
    needle = 0
    for i in range(600):
        did = _doc(conn, i, body="the needle sits here among words" if i == 437 else "")
        db.upsert_embedding(
            conn, doc_id=did, model=model, content_hash="h", dims=3,
            vector=embeddings.pack_vector([1.0, 0.0, float(i % 7)]),
        )
        if i == 437:
            needle = did
    # The hybrid search would pay: its total is every embedded document.
    assert search.search(conn, "needle", limit=50, tenant_id="t")["total"] == 600
    embedded["n"] = 0
    assert search.text_matches(conn, "needle", tenant_id="t") == [needle]
    cuts = search.text_snippets(conn, "needle", [needle], tenant_id="t")
    assert _MARK.findall(cuts[needle]) == ["needle"]
    assert embedded["n"] == 0


def test_every_text_match_is_counted_past_500(conn):
    ids = [_doc(conn, i, body="a needle here" if i < 620 else "") for i in range(700)]
    assert search.text_matches(conn, "needle", tenant_id="t") == ids[:620]


def test_a_text_match_is_a_keyword_hit_whose_text_snippet_marks_something(conn):
    corpus = {
        "text": dict(body="a lantern in the text"),
        "title": dict(title="lantern", body="nothing here"),
        "tag": dict(tags=["lantern"], body="nothing here"),
        "stem": dict(body="two lanterns burned"),
        "split": dict(title="old lantern", body="a keeper stood"),
        "neither": dict(body="nothing at all"),
        "korean": dict(body="마지막에 등불이 꺼졌다"),
    }
    ids = {k: _doc(conn, i, **v) for i, (k, v) in enumerate(corpus.items())}
    for q in ["lantern", "lantern keeper", "등불", "keeper"]:
        marked = {
            r["id"]
            for r in search.search(conn, q, limit=50, tenant_id="t")["results"]
            if "<mark>" in r["snippet"]
        }
        assert set(search.text_matches(conn, q, tenant_id="t")) == marked, q
    assert search.text_matches(conn, "lantern", tenant_id="t") == sorted(
        [ids["text"], ids["stem"]]
    )
    assert search.text_matches(conn, "lantern keeper", tenant_id="t") == [ids["split"]]


def test_the_text_reads_keep_to_the_tenant_and_to_text_matches(conn):
    mine = _doc(conn, 1, body="a lantern here")
    title_only = _doc(conn, 2, title="lantern", body="nothing")
    theirs = _doc(conn, 3, body="a lantern there", tenant="other")
    assert search.text_matches(conn, "lantern", tenant_id="t") == [mine]
    cuts = search.text_snippets(conn, "lantern", [mine, title_only, theirs], tenant_id="t")
    assert set(cuts) == {mine}
    # The cut is the one the search gives the same match on its page.
    (hit,) = [r for r in search.search(conn, "lantern", tenant_id="t")["results"] if r["id"] == mine]
    assert cuts[mine] == hit["snippet"]


@pytest.mark.parametrize("q", ["", "   ", '"', "*", "-", 'a"b', "NEAR(", "AND"])
def test_the_text_reads_take_any_query(conn, q):
    _doc(conn, 1, body="a lantern here")
    assert isinstance(search.text_matches(conn, q, tenant_id="t"), list)
    assert isinstance(search.text_snippets(conn, q, [1], tenant_id="t"), dict)
