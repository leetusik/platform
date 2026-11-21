import { READER_DOCUMENT } from "@/content/reader-document";
import type { Mark } from "@/sikstack/library/mark-row-model";
import { decodeFrom, itemWayBack, type ListOrigin } from "@/lib/library/from";
import { positionNear } from "@/lib/reader/note-list";
import type { ReaderBookmark, ReaderNotes } from "@/lib/reader/types";

/**
 * A loose document in the Library's reader, as pure rules (job 03, Library round 02: `## Build` § Page:
 * document; `Document.dc.html`, `DocumentNotes.dc.html`): the sections' fold, the way back, what marks the
 * page takes, and the Notes sheet's body for a Markdown document. Deliberately not a client module: the page
 * chooses the marks on the server, the frame draws them on the client.
 */

// ---- the sections' fold (F68's fold, `LB.FOLD`) ---------------------------------------------------------

/** More than this many sections fold. */
export const FOLD_AT = 6;
/** A folded list shows one fewer than the fold, then **Show all N sections**. */
export const FOLD_SHOWN = FOLD_AT - 1;

/**
 * The sections the head shows, and the fold's control when the list folds: at most six show whole; seven and
 * more show the first five, folded, until **Show all N sections** opens them.
 */
export function foldSections<T>(
  sections: readonly T[],
  open: boolean,
): { shown: readonly T[]; fold: { total: number; open: boolean } | null } {
  if (sections.length <= FOLD_AT) return { shown: sections, fold: null };
  return {
    shown: open ? sections : sections.slice(0, FOLD_SHOWN),
    fold: { total: sections.length, open },
  };
}

// ---- the way back (F324, F328: S2's contract) ----------------------------------------------------------

/**
 * Where the way back goes and what it is called: the list the reader came through (`?from=`) when it is the
 * document's own (a member's Library or project page, the public library of the document's org, its project's
 * page there); else, as with no list, a member's Library, or a visitor's public library of the address's org.
 * A visitor never gets a member's list (those would only bounce to sign in), and another org's or project's
 * list is not trusted (P63-fk.F4): the label always comes from the document's data. Null: nowhere to go back
 * to (a visitor on a document with no org).
 */
export function documentBack(p: {
  member: boolean;
  from: string | null | undefined;
  /** The org's slug, from the document's address. */
  org: string | null;
  /**
   * The names the reads carry: the document's project (its name, which is its segment), and its org's (its
   * read's `org.name`, P63). In the loading and not-found states there is no read: they pass the project
   * segment of the document's own address (`/@{org}/{project}/…`), which is trusted because it is where
   * the reader is, never text `?from=` carries; a project's list is then kept only when it is that same
   * project (or a member's own project page), and labelled by that segment. The org's name is absent
   * there, so the org reads the address's slug. With no project at all, no project's list is trusted.
   */
  names?: { project?: string | null; org?: string | null };
}): { origin: ListOrigin; href: string; label: string } | null {
  const raw = typeof p.from === "string" && p.from !== "" ? p.from : null;
  return itemWayBack(raw === null ? null : decodeFrom(raw), {
    member: p.member,
    orgs: [p.org],
    project: p.names?.project,
    orgName: p.names?.org,
  });
}

// ---- what marks a document takes (OQ14: by format) -----------------------------------------------------

/**
 * - `bookmarks`: a Markdown document (the server refuses highlights and notes there): the signed document,
 *   bookmarks only, in `DocumentNotes`; no annotation layer.
 * - `layer`: a native document keeps what a chapter has, the annotation layer and its own Notes body.
 * - `none`: nothing to mark (a refused text, or a member with nowhere to save).
 */
export type DocumentMarks = "bookmarks" | "layer" | "none";

export function documentMarks(reader: {
  notes: Pick<ReaderNotes, "plain"> | null;
  checked: { refused?: unknown };
  view: { member: boolean; write: unknown };
}): DocumentMarks {
  if (!reader.notes || reader.checked.refused) return "none";
  if (reader.view.member && !reader.view.write) return "none";
  return reader.notes.plain ? "bookmarks" : "layer";
}

// ---- DocumentNotes: a Markdown document's bookmarks ----------------------------------------------------

/** One bookmark as the sheet keeps it: the server's row, or one made here. */
export type DocMark = Pick<
  ReaderBookmark,
  "id" | "block" | "at" | "fraction" | "label" | "pos" | "lang" | "version"
>;

/** What the button makes of the place on screen: a Markdown document's bookmark is always a position. */
export interface Here {
  kind: "bookmark" | "position";
  /** The section (kind `bookmark`). */
  section: string | null;
  /** How far through the text, 0..1 (kind `position`). */
  fraction: number;
}

/** The place a bookmark is, as its row reads it: the section's title, or `About 40% through`. */
export function markPlace(
  m: DocMark,
  titleOf: (id: string) => string | null,
): string {
  if (m.pos || m.at === null) {
    return READER_DOCUMENT.notes.place(Math.round((m.fraction ?? 0) * 100));
  }
  return titleOf(m.at) ?? "";
}

/** The row's mark (`MarkRow`'s shape). */
export function markOf(m: DocMark): Mark {
  return {
    id: m.id,
    kind: m.pos || m.at === null ? "position" : "bookmark",
    label: m.label || undefined,
    lang: m.lang,
    version: m.version,
    state: "ok",
    review: null,
  };
}

/** Reading order: by the section's place in the text, a position by its fraction. */
export function readingOrder(
  marks: readonly DocMark[],
  sectionOrder: readonly string[],
): DocMark[] {
  const n = sectionOrder.length + 1;
  const at = (m: DocMark) =>
    m.pos || m.at === null
      ? (m.fraction ?? 0) * n
      : sectionOrder.indexOf(m.at) + 1;
  return [...marks].sort((a, b) => at(a) - at(b));
}

/** This place already has a bookmark: the same section, or a position within 2% (the layer's own rule). */
export function hereMarked(here: Here, live: readonly DocMark[]): boolean {
  if (here.kind === "bookmark") {
    return live.some((m) => !m.pos && m.at === here.section);
  }
  return (
    positionNear(
      live.filter((m) => m.pos),
      here.fraction,
    ).length > 0
  );
}

/** The button's name, and the empty line's: **Bookmark this section** or **Bookmark this position**. */
export function hereAction(here: Here): string {
  return here.kind === "bookmark"
    ? READER_DOCUMENT.notes.section
    : READER_DOCUMENT.notes.position;
}
