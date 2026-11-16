import type {
  AnnotationPatch,
  AnnotationWrite,
  BookmarkWrite,
} from "@/lib/reader/actions";
import type { Quote } from "@/lib/reader/anchor";
import type { ReaderWrite } from "@/lib/reader/types";

/**
 * The marks' writes as data (P63-fk.S11): what the annotation layer sends for a highlight, a note, a bookmark, a
 * label, Review this and a delete, built in one place for both looks. MOVED unchanged out of
 * `components/reader/annotations.tsx` (P30.S20/S21), where each payload was built inline: the old look and the
 * Library's look send the same payloads, at the same moments, through the same server actions
 * (`lib/reader/actions.ts`). `tests/reader-marks.test.ts` holds each payload as it was.
 *
 * A write is data so the ones a lapsed session stopped can outlive a sign-in (`sessionStorage`, the layer's).
 */
export type Wire =
  | { op: "save"; input: AnnotationWrite }
  | { op: "edit"; input: AnnotationPatch }
  | { op: "remove"; input: { id: string } }
  | { op: "bm-save"; input: BookmarkWrite }
  | { op: "bm-edit"; input: { id: string; label: string | null } }
  | { op: "bm-remove"; input: { id: string } };

/** What a write keeps of the text it was made on (the server's caps, in code points). */
export interface Snapshot {
  text: string;
  block_title: string;
  chapter_title: string;
}

const cut = (text: string, n: number) => Array.from(text).slice(0, n).join("");

export function snapshotOf(
  text: string,
  blockTitle: string,
  chapterTitle: string,
): Snapshot {
  return {
    text: cut(text, 5000),
    block_title: cut(blockTitle, 500),
    chapter_title: cut(chapterTitle, 500),
  };
}

/** A new highlight (with its note, or none): sent when Highlight or Save note is pressed. */
export function highlightWire(a: {
  write: ReaderWrite;
  id: string;
  version: number;
  sec: string;
  quote: Quote;
  note: string;
  snapshot: Snapshot;
}): Wire {
  return {
    op: "save",
    input: {
      ...a.write,
      id: a.id,
      version: a.version,
      block_id: a.sec,
      quote: a.quote,
      note: a.note || null,
      snapshot: a.snapshot,
    },
  };
}

/** A new note on a section (never empty: an empty one is not sent). */
export function sectionNoteWire(a: {
  write: ReaderWrite;
  id: string;
  version: number;
  sec: string;
  note: string;
  snapshot: Snapshot;
}): Wire {
  return {
    op: "save",
    input: {
      ...a.write,
      id: a.id,
      version: a.version,
      block_id: a.sec,
      note: a.note,
      snapshot: a.snapshot,
    },
  };
}

/** A note changed on a highlight or a section ("" removes a highlight's note). */
export function noteWire(id: string, note: string): Wire {
  return { op: "edit", input: { id, note: note || null } };
}

/** Review this, on or off. */
export function reviewWire(id: string, on: boolean): Wire {
  return { op: "edit", input: { id, review: on } };
}

/** A highlight or a note deleted (sent once its undo line has run out). */
export function removeWire(id: string): Wire {
  return { op: "remove", input: { id } };
}

/** A section's bookmark, or a plain document's position. */
export function bookmarkWire(a: {
  write: ReaderWrite;
  id: string;
  version: number;
  anchor: { block_id: string } | { fraction: number };
  snippet: string;
}): Wire {
  return {
    op: "bm-save",
    input: {
      ...a.write,
      id: a.id,
      version: a.version,
      anchor: a.anchor,
      snippet: a.snippet,
    },
  };
}

/** A bookmark's label, as saved: trimmed, at most 120 characters, "" clears it. */
export function cleanLabel(label: string): string {
  return label.trim().slice(0, 120);
}

export function labelWire(id: string, clean: string): Wire {
  return { op: "bm-edit", input: { id, label: clean || null } };
}

export function removeBookmarkWire(id: string): Wire {
  return { op: "bm-remove", input: { id } };
}
