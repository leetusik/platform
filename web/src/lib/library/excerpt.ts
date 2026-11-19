/**
 * hi2vi Library (`03-library` round 02, `LibraryDocs`, F322; `LB.match`) — where a search matched a
 * document, as the documents table marks it. Pure, and NOT `server-only` (the table marks in the
 * browser too).
 *
 * - The query is marked wherever a row shows it: in the title and in each tag that holds it
 *   (case-insensitive, the query trimmed).
 * - A match only in the text adds the excerpt under the title: the plain text around the match, 48
 *   characters before it and 72 after, with an ellipsis where the text goes on, and no heading marks
 *   (the table's sheet holds it to 64ch). The text comes from the search's snippet (`GET /app/search`,
 *   its matches between literal `<mark>` delimiters); a snippet shorter than the cut gives a shorter
 *   excerpt, never an invented one.
 * - Three tags are shown, the ones that hold the query first, so none hides behind the `+n`.
 */

/** Characters of text kept before and after the match (`LB.match`). */
export const EXCERPT_BEFORE = 48;
export const EXCERPT_AFTER = 72;
/** Tags a row shows before `+n`. */
export const TAGS_SHOWN = 3;

/** A text cut around its match: `hit` is empty when the text does not hold the query. */
export interface Cut {
  before: string;
  hit: string;
  after: string;
}

/** The searched query as the table compares it. */
export function needle(q: string | null | undefined): string {
  return (q ?? "").trim().toLowerCase();
}

/** `text` with the query's first occurrence marked, or all of it in `before`. */
export function markIn(text: string, q: string | null | undefined): Cut {
  const s = needle(q);
  const i = s ? text.toLowerCase().indexOf(s) : -1;
  if (i < 0) return { before: text, hit: "", after: "" };
  return {
    before: text.slice(0, i),
    hit: text.slice(i, i + s.length),
    after: text.slice(i + s.length),
  };
}

/** Whether `text` holds the query. */
export function holds(text: string, q: string | null | undefined): boolean {
  const s = needle(q);
  return s !== "" && text.toLowerCase().includes(s);
}

/**
 * Markdown as plain text: no heading marks (`## `, frame.md F91), no emphasis or code marks, a link
 * as its words, every run of white space one space.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/(^|[\s>…])#{1,6}[ \t]+/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`+|~~/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MARK_OPEN = "<mark>";
const MARK_CLOSE = "</mark>";

/**
 * The excerpt of a text-only match, from the search's snippet: the snippet's plain text, cut 48
 * characters before the match and 72 after it. The match is the query where the text holds it, else
 * the snippet's first marked word (the search matches word forms the query is not a substring of).
 * Null when the snippet marks nothing (a match by meaning only): nothing in it can be marked.
 */
export function excerptOf(
  snippet: string | null | undefined,
  q: string | null | undefined,
): Cut | null {
  if (!snippet || !snippet.includes(MARK_OPEN)) return null;
  // The snippet's own ellipses say the text goes on before or after it.
  let raw = snippet.trim();
  const lead = raw.startsWith("…");
  const tail = raw.endsWith("…");
  if (lead) raw = raw.slice(1);
  if (tail) raw = raw.slice(0, -1);
  // Plain text with the first marked run's place kept, through a private-use sentinel pair.
  const OPEN = "";
  const CLOSE = "";
  const text = plainText(
    raw.split(MARK_OPEN).join(OPEN).split(MARK_CLOSE).join(CLOSE),
  );
  const firstOpen = text.indexOf(OPEN);
  const clean = text.replace(/[]/g, "");
  if (clean.trim() === "") return null;
  const s = needle(q);
  let at = s ? clean.toLowerCase().indexOf(s) : -1;
  let length = s.length;
  if (at < 0) {
    if (firstOpen < 0) return null;
    // The marked run, measured in the clean text.
    const before = text.slice(0, firstOpen).replace(/[]/g, "");
    const close = text.indexOf(CLOSE, firstOpen);
    const run = text
      .slice(firstOpen + 1, close < 0 ? undefined : close)
      .replace(/[]/g, "");
    at = before.length;
    length = run.length;
  }
  if (length === 0) return null;
  const a = Math.max(0, at - EXCERPT_BEFORE);
  const z = Math.min(clean.length, at + length + EXCERPT_AFTER);
  return {
    before: (a > 0 || lead ? "…" : "") + clean.slice(a, at),
    hit: clean.slice(at, at + length),
    after: clean.slice(at + length, z) + (z < clean.length || tail ? "…" : ""),
  };
}

/** The tags a row shows, those holding the query first, and the rest behind `+n`. */
export function tagsShown(
  tags: readonly string[],
  q: string | null | undefined,
): { shown: Cut[]; rest: string[] } {
  const hit = (t: string) => holds(t, q);
  const order = [...tags.filter(hit), ...tags.filter((t) => !hit(t))];
  return {
    shown: order.slice(0, TAGS_SHOWN).map((t) => markIn(t, q)),
    rest: order.slice(TAGS_SHOWN),
  };
}
