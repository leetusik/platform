import { LANGUAGES, MARK_ROW } from "@/content/library-frame";

/**
 * A mark's row's words (`MarkRow.dc.html`, frame.md F54, F65, F95), pure so a node test reaches them.
 * A mark is the record the reader keeps: `kind` highlight | section (a note on a section) | bookmark |
 * position; `state` ok | changed | other (made in the other language) | gone (its section is gone);
 * `review` true (a review card), false (paused) or null (never).
 */
export type MarkKind = "highlight" | "section" | "bookmark" | "position";
export type MarkState = "ok" | "changed" | "other" | "gone";

export interface Mark {
  id: string;
  kind: MarkKind;
  quote?: string;
  note?: string;
  label?: string;
  /** The language the mark was made in. */
  lang: string;
  /** The version it was made on. */
  version: number;
  state: MarkState;
  review: boolean | null;
}

export type MarkRowPhase = "rest" | "editing" | "deleted" | "failed";

const isBookmark = (m: Mark) => m.kind === "bookmark" || m.kind === "position";

/** The word for a mark (frame.md F54). */
export function markWord(m: Mark): string {
  const w = MARK_ROW.word;
  if (m.state === "gone") return w.gone;
  if (m.state === "changed") return w.changed;
  if (m.kind === "highlight") return m.note ? w.highlightNote : w.highlight;
  if (m.kind === "section") return w.section;
  return m.kind === "position" ? w.position : w.bookmark;
}

/** The one line a deleted row says, for ten seconds, with Undo. */
export function markUndoLine(m: Mark): string {
  const u = MARK_ROW.undoLine;
  if (isBookmark(m)) return u.bookmark;
  if (m.kind === "section") return u.note;
  if (m.note && m.review !== null) return u.highlightNoteReview;
  if (m.note) return u.highlightNote;
  if (m.review !== null) return u.highlightReview;
  return u.highlight;
}

/** The line under a row whose delete failed. */
export function markFailedLine(m: Mark): string {
  if (isBookmark(m)) return MARK_ROW.failed.bookmark;
  return m.kind === "section"
    ? MARK_ROW.failed.note
    : MARK_ROW.failed.highlight;
}

/**
 * The row's first line, its way to the mark: the passage in quotes for a highlight, the label or the
 * place for a bookmark, the place for a note on a section; an unanchored mark has no link.
 */
export function markLead(
  m: Mark,
  place: string,
): { canOpen: boolean; quote: string | null; name: string | null } {
  const named = isBookmark(m) || m.kind === "section";
  const name = isBookmark(m)
    ? m.label || place
    : m.kind === "section" && m.state !== "gone"
      ? place
      : "";
  return {
    canOpen: m.state !== "gone",
    quote: !named && m.quote ? m.quote : null,
    name: named ? name : null,
  };
}

/** The row's facts after the word: the place (unless the first line already reads it), where it was made, In review. */
export function markFacts(
  m: Mark,
  place: string,
): { place: string | null; made: string | null; review: boolean } {
  const lead = markLead(m, place);
  return {
    place: place && !(lead.name !== null && lead.name === place) ? place : null,
    made:
      m.state === "changed" || m.state === "other"
        ? MARK_ROW.made(LANGUAGES[m.lang]?.name ?? m.lang, m.version)
        : null,
    review: m.review === true,
  };
}

/** The row's actions: a label for a bookmark, and Delete or Remove with its full name. */
export function markActions(
  m: Mark,
  place: string,
): { label: string | null; remove: string; removeAria: string } {
  const bookmark = isBookmark(m);
  const what = (m.quote || m.note || markLead(m, place).name || "").slice(
    0,
    60,
  );
  return {
    label: bookmark ? (m.label ? MARK_ROW.editLabel : MARK_ROW.addLabel) : null,
    remove: bookmark ? MARK_ROW.remove : MARK_ROW.delete,
    removeAria: bookmark
      ? MARK_ROW.deleteAria.bookmark(what)
      : m.kind === "section"
        ? MARK_ROW.deleteAria.section(what)
        : MARK_ROW.deleteAria.highlight(what),
  };
}

/** How long a deleted mark's row offers Undo before it is gone (frame.md F65). */
export const UNDO_MS = 10_000;
