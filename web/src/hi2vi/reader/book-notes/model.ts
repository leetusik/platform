import { BOOK_NOTES, type NotesFilter } from "@/content/book-notes";
import type { Mark, MarkRowPhase } from "@/hi2vi/library/mark-row-model";
import { rowOf } from "@/hi2vi/reader/marks/model";
import { undoClock, type Timers } from "@/hi2vi/reader/marks/undo";
import {
  cleanLabel,
  labelWire,
  removeBookmarkWire,
  removeWire,
  type Wire,
} from "@/hi2vi/reader/marks/wire";
import type { ListItem } from "@/lib/reader/note-list";
import {
  bookHref,
  LIBRARY_HREF,
  readerHref,
  type ReaderPlace,
} from "@/lib/reader-href";

/**
 * Notes in this book, pure (P63-fk.S14; job 03, Library round 02, `## Build` § Page: book-notes, the board
 * `BookNotes`): a mark's row as `MarkRow` takes it, what the head counts for each choice, which chapters stand,
 * where the way back goes, and the deletes that wait out their undo line (F65, F91). The page
 * (`./notes-page.tsx`) only wires these; a node test reaches every rule. Words: `@/content/book-notes`.
 */
export type { NotesFilter };

export const NOTES_FILTERS: readonly NotesFilter[] = ["all", "bm", "hl"];

/** One of the book's chapters, in book order: its default text's title and language. */
export interface NotesChapter {
  key: string;
  n: number;
  title: string;
  lang: string;
}

/** One mark of the book, as its row shows it and where opening it goes. */
export interface NotesRow {
  id: string;
  /** The chapter's key. */
  chapter: string;
  mark: Mark;
  place: string;
  placeLang: string;
  /** The chapter at the mark (`null`: an unanchored mark has no link). */
  href: string | null;
}

/** The way back in the Bar: its label, its short label (under 40em of the bar) and where it goes. */
export interface NotesBack {
  label: string;
  short: string;
  href: string;
}

export interface NotesView {
  bookTitle: string;
  chapters: NotesChapter[];
  /** The marks in reading order; `null` when they did not load (the book did). */
  rows: NotesRow[] | null;
  back: NotesBack;
}

const isBookmark = (m: Mark) => m.kind === "bookmark" || m.kind === "position";

/** Bookmarks are `bookmark` and `position` marks; highlights and notes are `highlight` and `section` marks. */
export function notesShows(filter: NotesFilter, mark: Mark): boolean {
  return filter === "all" || (filter === "bm") === isBookmark(mark);
}

/**
 * A listed mark as the book's row shows it. The place is named in its own language (D156-gc): the section's
 * name as the mark kept it, in the language the mark was made in (`rowOf`). A mark made on another language's
 * text than the chapter's own is `other` (its row says where it was made), and opening it carries that language,
 * so a mark made in Korean opens the Korean text (`href(lang)`; the chapter's own language needs none).
 */
export function notesRow(
  item: ListItem,
  chapter: { key: string; lang: string },
  href: (place: ReaderPlace) => string,
  at: string | null,
): NotesRow {
  const { mark, place, placeLang } = rowOf(item, item.lang);
  const other = item.lang !== chapter.lang;
  if (other && mark.state === "ok") mark.state = "other";
  return {
    id: item.id,
    chapter: chapter.key,
    mark,
    place,
    placeLang,
    href:
      mark.state === "gone"
        ? null
        : href({ lang: other ? item.lang : null, section: at, note: item.id }),
  };
}

/** The rows in reading order, chapter by chapter; an unanchored mark stays in its chapter, last. */
export function readingOrder(
  rows: readonly NotesRow[],
  chapters: readonly NotesChapter[],
): NotesRow[] {
  return chapters.flatMap((c) => {
    const mine = rows.filter((r) => r.chapter === c.key);
    return [
      ...mine.filter((r) => r.mark.state !== "gone"),
      ...mine.filter((r) => r.mark.state === "gone"),
    ];
  });
}

/** What the page holds of its deletes: waiting on Undo, sent (or sending), failed. */
export interface NotesMarks {
  waiting: ReadonlySet<string>;
  gone: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  labels: Readonly<Record<string, string>>;
}

/** The head for a choice: the count line, `N unanchored`, and each choice's count. A waiting delete is out. */
export function notesHead(
  rows: readonly NotesRow[],
  filter: NotesFilter,
  marks: Pick<NotesMarks, "waiting" | "gone">,
): {
  count: string;
  unanchored: string | null;
  counts: Record<NotesFilter, number>;
} {
  const live = rows.filter(
    (r) => !marks.waiting.has(r.id) && !marks.gone.has(r.id),
  );
  const mine = live.filter((r) => notesShows(filter, r.mark));
  const gone = mine.filter((r) => r.mark.state === "gone").length;
  return {
    count: BOOK_NOTES.count(
      filter,
      mine.length,
      new Set(mine.map((r) => r.chapter)).size,
    ),
    unanchored: gone ? BOOK_NOTES.unanchored(gone) : null,
    counts: {
      all: live.length,
      bm: live.filter((r) => isBookmark(r.mark)).length,
      hl: live.filter((r) => !isBookmark(r.mark)).length,
    },
  };
}

/**
 * The chapters that stand for a choice, each with its rows: a row whose delete is waiting stays (it is its
 * undo line); a sent one has left, and its chapter with its last row. A label saved here reads at once.
 */
export function notesChapters(
  chapters: readonly NotesChapter[],
  rows: readonly NotesRow[],
  filter: NotesFilter,
  marks: Pick<NotesMarks, "gone" | "labels">,
): (NotesChapter & { rows: NotesRow[] })[] {
  return chapters
    .map((c) => ({
      ...c,
      rows: rows
        .filter(
          (r) =>
            r.chapter === c.key &&
            !marks.gone.has(r.id) &&
            notesShows(filter, r.mark),
        )
        .map((r) =>
          r.id in marks.labels
            ? { ...r, mark: { ...r.mark, label: marks.labels[r.id] } }
            : r,
        ),
    }))
    .filter((c) => c.rows.length > 0);
}

/** The row's state forced by the page: a delete that failed after it left its row (a choice change, leaving). */
export function notesPhase(
  id: string,
  marks: Pick<NotesMarks, "failed">,
): MarkRowPhase | undefined {
  return marks.failed.has(id) ? "failed" : undefined;
}

/** The delete a row sends: the existing actions' payloads (`marks/wire.ts`), unchanged. */
export function deleteWire(mark: Mark): Wire {
  return isBookmark(mark) ? removeBookmarkWire(mark.id) : removeWire(mark.id);
}

/** The Bar's way back on the loaded page: the chapter it was opened from, else the book. */
export function notesBack(a: {
  bookTitle: string;
  bookHref: string;
  chapter: { title: string; href: string } | null;
}): NotesBack {
  return a.chapter
    ? {
        label: a.chapter.title,
        short: BOOK_NOTES.back.chapter,
        href: a.chapter.href,
      }
    : { label: a.bookTitle, short: BOOK_NOTES.back.book, href: a.bookHref };
}

/** The Bar's way back when the book is missing: the Library. */
export const MISSING_BACK: NotesBack = {
  label: BOOK_NOTES.back.library,
  short: BOOK_NOTES.back.library,
  href: LIBRARY_HREF,
};

/** What the address says the list was opened from (`bookNotesHref`'s query): the book, or a chapter. */
export interface NotesOpening {
  from: "chapter" | "book";
  chapter: string | null;
  lang: string | null;
  version: number | null;
  section: string | null;
}

const one = (v: string | string[] | null | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === null || s === "" ? null : s;
};

/** The opening, laundered: only a chapter key, a language code, a version number and a section id pass. */
export function notesOpening(
  get: (key: string) => string | string[] | null | undefined,
): NotesOpening {
  const ch = one(get("ch"));
  const lang = one(get("lang"));
  const v = one(get("v"));
  const at = one(get("at"));
  return {
    from: one(get("from")) === "book" ? "book" : "chapter",
    chapter: ch !== null && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(ch) ? ch : null,
    lang: lang !== null && /^[a-z]{2,3}$/.test(lang) ? lang : null,
    version: v !== null && /^\d{1,6}$/.test(v) ? Number(v) : null,
    section: at !== null && /^[a-z0-9][a-z0-9-]{0,63}$/.test(at) ? at : null,
  };
}

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * The way back while the page loads or did not load, from the address alone (no book read to name it by): the
 * label is `Book` or `Chapter`, and it goes to the book, or to the chapter the list was opened from.
 */
export function notesPlace(path: string): NotesBack {
  let url: URL | null = null;
  try {
    url = new URL(path.startsWith("/") ? path : "/", "https://notes.invalid");
  } catch {
    url = null;
  }
  const m = url
    ? /^\/@([^/]+)\/([^/]+)\/notes\/([^/]+)/.exec(url.pathname)
    : null;
  if (!url || !m) return MISSING_BACK;
  const target = {
    org: decode(m[1]),
    project: decode(m[2]),
    book: decode(m[3]),
  };
  const params = url.searchParams;
  const o = notesOpening((k) => params.get(k));
  if (o.from === "chapter" && o.chapter)
    return {
      label: BOOK_NOTES.back.chapter,
      short: BOOK_NOTES.back.chapter,
      href: readerHref(
        { kind: "chapter", ...target, chapter: o.chapter },
        { lang: o.lang, version: o.version, section: o.section },
      ),
    };
  return {
    label: BOOK_NOTES.back.book,
    short: BOOK_NOTES.back.book,
    href: bookHref(target),
  };
}

// --- the deletes that wait (F65, F91) -------------------------------------------------------------

/** What a write did: the server actions answer `{ ok }`. */
export type SendWire = (wire: Wire) => Promise<{ ok: boolean }>;

/**
 * The page's marks while it is open: a delete is out of every count at once and its row is its undo line for ten
 * seconds; Undo puts it back and nothing is sent; after the ten seconds, on a change of the choice and on leaving
 * the page, every delete still waiting is sent (`flush`). A send that fails puts the mark back with MarkRow's
 * failed line. A label is saved at once and put back if it is not saved. Timers are injectable for the test.
 */
export interface NotesStore {
  get(): NotesMarks;
  subscribe(fn: () => void): () => void;
  remove(row: NotesRow): void;
  undo(id: string): void;
  /** MarkRow's own ten seconds ran out: send now if it still waits; the send's promise (rejects on failure). */
  gone(id: string): Promise<void> | undefined;
  flush(): void;
  label(row: NotesRow, text: string): Promise<void>;
}

/** Changing the Show choice: every delete still waiting is sent first, then the choice is the new one. */
export function notesChoose(
  store: Pick<NotesStore, "flush">,
  next: NotesFilter,
): NotesFilter {
  store.flush();
  return next;
}

/**
 * Leaving the page sends every delete still waiting: the document going hidden (the last event a page reliably
 * sees: a tab switch, a navigation, closing), `pagehide` (the page unloaded or put in the back-forward cache), and
 * the page going away on a client navigation (the returned cleanup). A hidden tab's timers are throttled, so the
 * ten seconds alone would not do (MDN, read 2026-11-17: `Document/visibilitychange_event`,
 * `Window/pagehide_event`, `Window/setTimeout` § inactive tabs).
 */
export function sendOnLeaving(
  store: Pick<NotesStore, "flush">,
  doc: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >,
  win: Pick<Window, "addEventListener" | "removeEventListener">,
): () => void {
  const away = () => {
    if (doc.visibilityState === "hidden") store.flush();
  };
  const hide = () => store.flush();
  doc.addEventListener("visibilitychange", away);
  win.addEventListener("pagehide", hide);
  return () => {
    doc.removeEventListener("visibilitychange", away);
    win.removeEventListener("pagehide", hide);
    store.flush();
  };
}

export function notesStore(
  send: SendWire,
  timers?: Timers,
  ms?: number,
): NotesStore {
  const clock = undoClock(ms, timers);
  const sent = new Map<string, Promise<void>>();
  const subs = new Set<() => void>();
  let state: NotesMarks = {
    waiting: new Set(),
    gone: new Set(),
    failed: new Set(),
    labels: {},
  };
  const set = (next: Partial<NotesMarks>) => {
    state = { ...state, ...next };
    for (const fn of subs) fn();
  };
  const without = (s: ReadonlySet<string>, id: string) => {
    const n = new Set(s);
    n.delete(id);
    return n;
  };
  const sendDelete = (row: NotesRow) => {
    set({
      waiting: without(state.waiting, row.id),
      gone: new Set(state.gone).add(row.id),
    });
    const p = (async () => {
      let ok = false;
      try {
        ok = (await send(deleteWire(row.mark))).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        set({
          gone: without(state.gone, row.id),
          failed: new Set(state.failed).add(row.id),
        });
        throw new Error("not deleted");
      }
    })();
    p.catch(() => undefined);
    sent.set(row.id, p);
  };
  return {
    get: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    remove(row) {
      sent.delete(row.id);
      set({
        waiting: new Set(state.waiting).add(row.id),
        failed: without(state.failed, row.id),
      });
      clock.start(row.id, () => sendDelete(row));
    },
    undo(id) {
      clock.undo(id);
      if (state.waiting.has(id)) set({ waiting: without(state.waiting, id) });
    },
    gone(id) {
      clock.fire(id);
      return sent.get(id);
    },
    flush: () => clock.flush(),
    async label(row, text) {
      const before = state.labels[row.id] ?? row.mark.label ?? "";
      // 120 characters at most; empty removes it; unchanged sends nothing
      const clean = cleanLabel(text);
      if (clean === before) return;
      set({ labels: { ...state.labels, [row.id]: clean } });
      let ok = false;
      try {
        ok = (await send(labelWire(row.id, clean))).ok;
      } catch {
        ok = false;
      }
      if (!ok) set({ labels: { ...state.labels, [row.id]: before } });
    },
  };
}
