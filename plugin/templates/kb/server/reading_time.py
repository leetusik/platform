"""A document's reading time in whole minutes: the Library's ``6 min``.

One formula, computed where the text already is: ``db.upsert_document`` stores it in
``documents.reading_minutes`` from the text it is writing, so a publish and a reindex
derive the same number from the same file, and a list read (the library, a book's
chapters) never loads a body to count it.

The formula:

* **Space-separated scripts** (English and every other script written with spaces
  between words) are counted in words: a run of letters or digits, joined across an
  inner apostrophe, hyphen or full stop (``don't``, ``re-run``, ``e.g``), at
  ``WORDS_PER_MINUTE``.
* **Korean and the other unspaced scripts** (Hangul, Han, Hiragana, Katakana, Thai,
  Lao, Khmer, Myanmar) are counted in characters, at ``CHARS_PER_MINUTE``; the spaces
  Korean writes between its words do not count.
* The two are added, rounded **up** to a whole minute, and never under **1** (an empty
  or one-word document reads ``1 min``).

What counts as text, by the document's format:

* ``md``: the stored body without its frontmatter, less what a reader never reads as
  words: an image (``![alt](src)``), a link's address (its text stays), a reference
  definition, an HTML tag or comment, and a bare URL. Code counts as text.
* ``html``: the plain text extracted from the page (the ``markdown`` column).
* ``native``: the chapter's search projection (the ``markdown`` column): its prose,
  headings, lists, tables, captions and alt text, quiz prompts, options and
  explanations, glossary entries and formula readings; never TeX or answer keys.

The two constants are a product choice (P63), not a measured figure.
"""
from __future__ import annotations

import re

WORDS_PER_MINUTE = 230
CHARS_PER_MINUTE = 500

# Scripts written without spaces between words (and Korean, whose spaced "words" are
# long compounds): counted by character.
_UNSPACED = re.compile(
    "["
    "฀-๿"  # Thai
    "຀-໿"  # Lao
    "က-႟"  # Myanmar
    "ᄀ-ᇿ"  # Hangul Jamo
    "ក-៿"  # Khmer
    "぀-ゟ"  # Hiragana
    "゠-ヿ"  # Katakana
    "㄰-㆏"  # Hangul Compatibility Jamo
    "㐀-䶿"  # CJK Extension A
    "一-鿿"  # CJK Unified Ideographs
    "가-힯"  # Hangul Syllables
    "豈-﫿"  # CJK Compatibility Ideographs
    "ｦ-ￜ"  # half-width Katakana and Hangul
    "\U00020000-\U0003134f"  # CJK Extensions B to G
    "]"
)

_WORD = re.compile(r"[^\W_]+(?:['’.\-][^\W_]+)*")

_MD_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK_TARGET = re.compile(r"\]\([^)]*\)")
_MD_REF_DEF = re.compile(r"^[ \t]*\[[^\]]+\]:[ \t]*\S.*$", re.MULTILINE)
_MD_TAG = re.compile(r"</?[A-Za-z][^>]*>")
_URL = re.compile(r"\b(?:https?|ftp)://\S+")


def _readable_markdown(text: str) -> str:
    text = _MD_COMMENT.sub(" ", text)
    text = _MD_IMAGE.sub(" ", text)
    text = _MD_LINK_TARGET.sub("] ", text)
    text = _MD_REF_DEF.sub(" ", text)
    text = _MD_TAG.sub(" ", text)
    return _URL.sub(" ", text)


def counts(text: str | None, fmt: str | None = "md") -> tuple[int, int]:
    """``(words, characters)``: the words of the spaced scripts and the characters of
    the unspaced ones, in the text a reader reads (``fmt`` picks what that is)."""

    text = text or ""
    if (fmt or "md") == "md":
        text = _readable_markdown(text)
    chars = len(_UNSPACED.findall(text))
    words = len(_WORD.findall(_UNSPACED.sub(" ", text)))
    return words, chars


def minutes(text: str | None, fmt: str | None = "md") -> int:
    """Whole minutes to read ``text``: words and characters added, rounded up, at
    least 1. Integer arithmetic, so a boundary (exactly one minute) never drifts."""

    words, chars = counts(text, fmt)
    scaled = words * CHARS_PER_MINUTE + chars * WORDS_PER_MINUTE
    unit = WORDS_PER_MINUTE * CHARS_PER_MINUTE
    return max(1, -(-scaled // unit))
