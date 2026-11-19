/**
 * The book page's pure rules (hi2vi Library, job 03 round 02, `## Build` § Page: book), no I/O: the
 * order and shape of a book, a chapter's shown language and state, the way on's five modes, the head's
 * state, one version region open at a time, and what a clear turns the page into. The loader (`load.ts`)
 * feeds these what the reads returned; `tests/book-page.test.ts` and `tests/book-model.test.ts` pin them.
 */

import { BOOK_PAGE } from "@/content/book-page";
import type { KbBookChapter, KbBookVariant } from "@/lib/knowledge/types";
import { secondTitleLang } from "@/lib/library/lists";

import type { BookView, ContView, HeadView, StateView } from "./view";

/** A member of the book's org, someone signed in from elsewhere, or nobody signed in. */
export type Viewer = "member" | "other" | "anon";
export type RowState = "unopened" | "started" | "finished" | "updated";

/** A chapter's `source` is a small string map (`server/books.py` `validate_source`). */
export function sourceOf(chapter: KbBookChapter): Record<string, string> {
  const s = chapter.source;
  if (!s || typeof s !== "object" || Array.isArray(s)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export type Shape =
  { kind: "plain" } | { kind: "phases" } | { kind: "slices"; phase: string };

/**
 * Which shape the book takes: a chapter with a `source.slice` makes it a per-slice book, of the
 * `source.phase` they share (else the slice id's prefix); every chapter with a `source.phase` and no
 * slice makes it a phases book; anything else is a plain guide. Only the phases book has a shape note
 * on the board.
 */
export function shapeOf(chapters: KbBookChapter[]): Shape {
  const sources = chapters.map(sourceOf);
  const sliced = sources.filter((s) => s.slice);
  if (sliced.length > 0) {
    const phase =
      sliced.find((s) => s.phase)?.phase ?? sliced[0].slice.split(".")[0];
    return { kind: "slices", phase };
  }
  if (sources.length > 0 && sources.every((s) => s.phase))
    return { kind: "phases" };
  return { kind: "plain" };
}

/** Manifest order: `position`, ties broken by `key`; chapters with no live variant are left out. */
export function orderChapters(chapters: KbBookChapter[]): KbBookChapter[] {
  return chapters
    .filter((c) => c.variants.length > 0)
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        a.c.position - b.c.position ||
        (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : a.i - b.i),
    )
    .map((x) => x.c);
}

/** The shown variant: the language this reader last read the chapter in, else the manifest's first. */
export function shownVariant(
  chapter: KbBookChapter,
  lastRead: string | null | undefined,
): KbBookVariant {
  return (
    (lastRead
      ? chapter.variants.find((v) => v.lang === lastRead)
      : undefined) ?? chapter.variants[0]
  );
}

/** "Older translation": this variant was translated from a source version that has since moved on. */
export function isStale(
  chapter: KbBookChapter,
  variant: KbBookVariant,
): boolean {
  const from = variant.translated_from;
  if (!from) return false;
  const source = chapter.variants.find((v) => v.lang === from.lang);
  return !!source && source.version > from.version;
}

export interface ChapterStateIn {
  state: "unopened" | "started" | "finished";
  updated: boolean;
}

/** unopened | started | finished | updated (finished on an older version than the newest). */
export function rowState(s: ChapterStateIn | undefined): RowState {
  if (!s || s.state === "unopened") return "unopened";
  if (s.state === "finished") return s.updated ? "updated" : "finished";
  return "started";
}

/** A row counts as finished once it is finished or Updated. */
export const isDone = (s: RowState): boolean =>
  s === "finished" || s === "updated";

/** A row's state (frame.md F54): `Finished`, `Started, 42%`, `Not started`; none for a visitor. */
export function rowStateView(
  state: RowState,
  pct: number,
  signedIn: boolean,
): StateView | null {
  if (!signedIn) return null;
  const t = BOOK_PAGE.contents;
  if (isDone(state)) return { word: t.finished, status: "done" };
  if (state === "started")
    return {
      word: pct > 0 ? t.startedAt(pct) : t.started,
      status: "active",
    };
  return { word: t.notStarted, status: "idle" };
}

export interface HeadIn {
  title: string;
  sub: string;
  /** The manifest's language of `sub` (P63, D248-j7); null or absent: the guess. */
  subLang?: string | null;
  description: string;
  place: string;
  signedIn: boolean;
  done: number;
  started: number;
  total: number;
}

/** BookHead: `Finished` when every chapter is, `5 of 14 finished` once one is begun, else `Not started`. */
export function headOf(h: HeadIn): HeadView {
  const t = BOOK_PAGE.head;
  const state: StateView =
    h.total > 0 && h.done === h.total
      ? { word: t.allFinished, status: "done" }
      : h.done > 0 || h.started > 0
        ? { word: t.finished(h.done, h.total), status: "active" }
        : { word: t.notStarted, status: "idle" };
  return {
    title: h.title,
    sub: h.sub,
    subLang: secondTitleLang(h.sub, h.subLang),
    description: h.description,
    place: h.place,
    member: h.signedIn,
    state,
    pct: h.total > 0 ? Math.round((100 * h.done) / h.total) : 0,
    count: t.chapters(h.total),
  };
}

/** Where the saved place is (index in book order). */
export interface PointerIn {
  index: number;
  /** The heading the saved place is under (native only), "" when none. */
  section: string;
  /** Rounded percent of the way in. */
  pct: number;
}

export interface ContRow {
  n: number;
  state: RowState;
  /** The chapter's lede (its `summary`), "" when none. */
  summary: string;
}

export type ContKind = "continue" | "next" | "start" | "finished";

export interface ContPlan {
  kind: ContKind;
  /** Index (book order) of the chapter the way on names. */
  index: number;
  /** `next`: the chapter number finished before it. */
  after?: number;
  /** `finished`: chapter numbers (1-based) that are Updated, in book order. */
  updated: number[];
  /** `continue`: where the reader stopped. */
  section: string;
  pct: number;
}

/**
 * The way on's chapter. The pointer is the product's: the most recently updated position among the
 * book's chapters (`GET /app/reader/books/…`).
 *
 *  - signed out, or nothing opened → `start`, chapter 1;
 *  - every chapter finished → `finished` (an Updated one is offered again);
 *  - the pointer's chapter is started → `continue` there;
 *  - the pointer's chapter is finished → `next`: the next chapter not finished after it, else the first.
 */
export function planContinue(
  rows: ContRow[],
  signedIn: boolean,
  pointer: PointerIn | null,
): ContPlan {
  const base = { updated: [] as number[], section: "", pct: 0 };
  if (!signedIn || !pointer || rows.length === 0)
    return { ...base, kind: "start", index: 0 };
  if (rows.every((r) => isDone(r.state))) {
    const updated = rows.filter((r) => r.state === "updated").map((r) => r.n);
    return {
      ...base,
      kind: "finished",
      index: updated.length ? updated[0] - 1 : 0,
      updated,
    };
  }
  const at = rows[pointer.index];
  if (at && !isDone(at.state)) {
    return {
      ...base,
      kind: "continue",
      index: pointer.index,
      section: pointer.section,
      pct: pointer.pct,
    };
  }
  const open = (r: ContRow) => r.state === "unopened" || r.state === "started";
  let j = -1;
  for (let k = pointer.index + 1; k < rows.length; k++)
    if (open(rows[k])) {
      j = k;
      break;
    }
  if (j < 0) j = rows.findIndex(open);
  return { ...base, kind: "next", index: Math.max(j, 0), after: at?.n };
}

/** A chapter as the way on names it. */
export interface ContChapter {
  n: number;
  title: string;
  lang: string;
  href: string;
}

/**
 * BookContinue (the board's table): the title, the facts, the lede in `next` and `start`, the button.
 * `section` is where a `continue` was left (a heading), `lede` the named chapter's lede. Continue reading opens the
 * chapter at its kept place (job 07 F242), which is the saved block inside that section: the address is the
 * chapter's own, with no `#`, so the reader resumes there as it does from the Library's and the review end's
 * Continue reading. A `#<section>` would win over the resume (`landingFor`), land on the heading and save the
 * heading as the new place.
 */
export function contOf(
  plan: ContPlan,
  chapters: ContChapter[],
  found: { section: string; lede: string },
): ContView {
  const t = BOOK_PAGE.cont;
  const total = chapters.length;
  const c = chapters[plan.index] ?? chapters[0];
  const n = c?.n ?? 1;
  const where = total > 1 ? [t.chapterOf(n, total)] : [];
  const href = c?.href ?? "";
  if (plan.kind === "finished") {
    const up = plan.updated.length ? plan.updated[0] : null;
    return {
      mode: "finished",
      name: t.name.finished,
      title: t.allFinished(total),
      lang: null,
      facts: up !== null ? [t.changed(up)] : [],
      lede: "",
      action: t.readAgain(n),
      primary: up !== null,
      href,
    };
  }
  if (plan.kind === "continue") {
    const left = found.section
      ? t.leftOffAt(found.section)
      : plan.pct > 0
        ? t.leftOffPct(plan.pct)
        : t.opened;
    return {
      mode: "continue",
      name: t.name.continue,
      title: c?.title ?? "",
      lang: c?.lang ?? null,
      facts: [...where, left],
      lede: "",
      action: t.continueReading,
      primary: true,
      href,
    };
  }
  if (plan.kind === "next") {
    return {
      mode: "next",
      name: t.name.next,
      title: c?.title ?? "",
      lang: c?.lang ?? null,
      facts: [...where, t.youFinished(plan.after ?? Math.max(n - 1, 1))],
      lede: found.lede,
      action: t.readNext,
      primary: true,
      href,
    };
  }
  return {
    mode: "start",
    name: t.name.start,
    title: c?.title ?? "",
    lang: c?.lang ?? null,
    facts: where,
    lede: found.lede,
    action: t.readChapter(n),
    primary: true,
    href,
  };
}

/** Version history: one chapter's region open at a time on the page; a second press closes it. */
export function toggleOpen(open: string | null, key: string): string | null {
  return open === key ? null : key;
}

/**
 * The page once its reading data is cleared (the board's `cleared`): every row reads Not started, the
 * head reads Not started with an empty line, the way on becomes `start`, the notes row goes.
 */
export function clearedView(view: BookView): BookView {
  const notStarted = rowStateView("unopened", 0, view.signedIn);
  return {
    ...view,
    head: {
      ...view.head,
      state: { word: BOOK_PAGE.head.notStarted, status: "idle" },
      pct: 0,
    },
    cont: view.start,
    notes: null,
    rows: view.rows.map((r) => ({ ...r, updated: false, state: notStarted })),
  };
}
