import { barScroll } from "@/hi2vi/library/bar-model";
import type { ChapterRowItem, VersionItem } from "@/hi2vi/library";
import { READER_FRAME } from "@/content/reader-frame";
import { date, type FormatOptions } from "@/lib/format";
import type { ChapterRow, ReaderVersions } from "@/lib/reader/types";

/**
 * The reader's frame as pure rules (job 03, Library round 02: `Chapter.dc.html`, frame.md F59, F64,
 * F94, F100), so a node test reaches them. The client frame (`./chapter-reader.tsx`) owns the DOM and
 * the timers; this file owns what the bars, the pill, the end and the rows become.
 */

/** What the bars keep between two scroll events (frame.md F59): one flag for the top bar and the foot. */
export interface ReaderBars {
  hidden: boolean;
  /** The last scroll position seen. */
  last: number;
  /** How far the page has gone up since it last went down. */
  up: number;
  /** Until then a scroll is the reader's own move (a landing, a jump, From the top), not a gesture. */
  quietUntil: number;
}

export function readerBars(y = 0): ReaderBars {
  return { hidden: false, last: y, up: 0, quietUntil: 0 };
}

/**
 * One scroll event. The rule is the Bar's (`barScroll`, frame.md F59): hide on the way down past
 * 80 px, come back near the top (under 80 px), at the page's end (within 8 px) or after 64 px up. While
 * a move is the reader's own (`quietUntil`), or a sheet is open, the bars stay as they are: arriving at a
 * place does not hide them, the reader's first scroll down does (`Chapter.dc.html`'s hold).
 */
export function scrollBars(
  state: ReaderBars,
  e: { y: number; max: number; now: number; sheetOpen?: boolean },
): ReaderBars {
  const next = barScroll(
    { hidden: state.hidden, last: state.last, up: state.up },
    e.y,
    e.max,
  );
  if (e.now < state.quietUntil || e.sheetOpen)
    return { ...state, last: next.last, up: 0 };
  return { ...state, ...next };
}

/** A tap on the text, or Show reading controls: both bars come back (a tap never hides them). */
export function showBars(state: ReaderBars): ReaderBars {
  return state.hidden ? { ...state, hidden: false, up: 0 } : state;
}

/** The reader's own move starts: for `ms` from `now` a scroll is not a gesture. */
export function quietBars(
  state: ReaderBars,
  now: number,
  ms: number,
): ReaderBars {
  const until = now + ms;
  return until > state.quietUntil ? { ...state, quietUntil: until } : state;
}

/**
 * The resume pill (frame.md F64, F100): shown when a started text is picked up at its place; the
 * reader's first scroll drops it; the page's own move (the landing), or an event that moved nothing (a
 * resize, a late font), keeps it.
 */
export function pillAfterScroll(
  pill: boolean,
  e: { moved: boolean; now: number; quietUntil: number },
): boolean {
  return pill && (!e.moved || e.now < e.quietUntil);
}

/**
 * What the top bar and the foot are given (frame.md F59, F100): one `hidden` for both, and the progress
 * line, which never hides: the bar keeps it while hidden, at the window's top.
 */
export function chromeOf(p: { hidden: boolean; pct: number; pill: boolean }): {
  bar: { hidden: boolean; progress: number };
  foot: { hidden: boolean; pill: boolean; pct: number };
} {
  const pct = Math.max(0, Math.min(100, Math.round(p.pct)));
  return {
    bar: { hidden: p.hidden, progress: pct },
    foot: { hidden: p.hidden, pill: p.pill, pct },
  };
}

/** The end's state (frame.md F64), or null where a member has nowhere to save (no status row). */
export type EndState =
  "not-yet" | "finished" | "updated" | "unread" | "visitor";

export function endState(p: {
  member: boolean;
  /** A member with a place to save to (`useReading`'s `saves`). */
  saves: boolean;
  /** `useReading`'s state. */
  state: "finished" | "updated" | "unread" | "started";
}): EndState | null {
  if (!p.member) return "visitor";
  if (!p.saves) return null;
  return p.state === "started" ? "not-yet" : p.state;
}

/**
 * The end's one button (frame.md F64): Mark as unread on a finished chapter, else Mark as finished,
 * which for a visitor offers Sign in to save in place and writes nothing.
 */
export function endAction(state: EndState): "finish" | "unread" | "sign-in" {
  if (state === "finished" || state === "updated") return "unread";
  return state === "visitor" ? "sign-in" : "finish";
}

/**
 * The book's chapters under the end (frame.md F64, F93): on a finished chapter and on the last one,
 * never for a book of one chapter.
 */
export function endRowsShown(p: {
  total: number;
  finished: boolean;
  last: boolean;
}): boolean {
  return p.total > 1 && (p.finished || p.last);
}

/** A chapter's row as `ReaderChapters` draws it (frame.md F54, F63): a visitor's rows carry no state. */
export function chapterItems(
  rows: readonly ChapterRow[],
  member: boolean,
): ChapterRowItem[] {
  const w = READER_FRAME.state;
  return rows.map((row) => ({
    id: row.key,
    n: row.n,
    title: row.title,
    updated: member && !!row.updated,
    state:
      !member || !row.state
        ? null
        : row.state === "finished"
          ? { word: w.finished, status: "done" as const }
          : row.state === "started"
            ? { word: w.started(row.percent ?? 0), status: "active" as const }
            : { word: w.notStarted, status: "idle" as const },
  }));
}

/** The Version history sheet's rows (frame.md F62): newest first, each date in the one format. */
export function versionItems(
  versions: ReaderVersions | null,
  options: FormatOptions = {},
): VersionItem[] {
  return (versions?.rows ?? []).map((row) => ({
    n: row.n,
    published: date(row.date, options),
    // `Versions` names the source language by its code, or as given: the loader holds its name.
    from: row.from ? { lang: row.from.label, version: row.from.version } : null,
  }));
}

/** The chapter's sections (its h2s), for the head and the Contents sheet. */
export function sectionsOf(
  headings: readonly { id: string; level: number; text: string }[],
): { id: string; title: string }[] {
  return headings
    .filter((h) => h.level === 2)
    .map((h) => ({ id: h.id, title: h.text }));
}

/** The section of the Contents sheet that is on screen: the h2 over the heading being read. */
export function currentSection(
  headings: readonly { id: string; level: number }[],
  at: string | null,
): string | undefined {
  let h2: string | undefined;
  for (const h of headings) {
    if (h.level === 2) h2 = h.id;
    if (h.id === at) return h2;
  }
  return undefined;
}
