import { BOOK } from "@/content/book";
import { LISTEN } from "@/content/listen";
import type { KbListenPosition, KbListenState } from "@/lib/knowledge/listen";
import { ownChapters, unitOfKey } from "@/lib/listen/book";
import { aboutSum, clockPos, lengthWords } from "@/lib/listen/format";
import { noteKey } from "@/lib/listen/machine";
import type { Listen, ListenKept, ListenSeed } from "@/lib/listen/types";
import { noteView } from "@/lib/listen/view";

import {
  holdOf,
  shellOf,
  type HeadControl,
  type HeadNote,
  type HeadView,
} from "./model";

/**
 * Listen on the book page (job 07, round 01: frame.md F206, F207, F209, F234 FG2; `Listen.dc.html`'s book view,
 * `BookHead.dc.html`, `BookChapters.dc.html`; `result.md` § Build › Listen): what the page shows, pure, so it is
 * proved in node. No `"use client"`: a server component may call it.
 *
 *   bookHeadOf     the head's slot: the book's control (Listen, or Continue listening + Start over), busy from the
 *                  press, the note while any Listen of this book is under way, held from the press until Stop
 *   bookStartOf    the three starts: Listen plays chapter 1, Continue listening the kept chapter at its place,
 *                  Start over chapter 1 at 0:00; each opens that chapter's reader (the press carries the address)
 *   bookRowsOf     each row's audio line, with Playing or Paused on the Listen's chapter (F209)
 *   bookTrackOf    `.listen-book`: the held grid and its track for a member, nothing for a visitor (C01, FG2)
 */

/** What the server read for the book page (`readBookSeed` in `@/lib/listen/seed`, a server-only module). */
export interface BookListenSeedView {
  /** The book from chapter 1, in the language the page reads it (the server's default). */
  start: ListenSeed;
  /** The book from chapter 1 in each language it has, by language (`start`'s too). */
  langs: Record<string, ListenSeed>;
  /** The newest place left part-way, in its own language; null when none. */
  place: KbListenPosition | null;
  /** Continue listening: the book from the place's chapter, in its language; null when none. */
  resume: ListenSeed | null;
}

/** The place Continue listening goes on from: the one Stop listening kept, else the newest saved one. */
interface Place {
  ch: string;
  pos: number;
  lang: string;
}

function placeOf(
  seed: BookListenSeedView,
  kept: ListenKept | null,
): Place | null {
  const unit = unitOfKey(seed.start.key);
  if (kept && kept.unit === unit && kept.ch) {
    return { ch: kept.ch, pos: kept.pos, lang: kept.lang };
  }
  const r = seed.place;
  return r && r.chapter
    ? { ch: r.chapter, pos: r.seconds, lang: r.lang }
    : null;
}

/** A chapter's made length, from a state. */
function lenOf(state: KbListenState | null, chapter: string): number | null {
  const e = state?.entries.find((x) => x.chapter === chapter);
  return e && e.state === "made" && e.len ? e.len : null;
}

/** The chapter entries' lengths, once every listenable chapter is made (F207's `about 2 h`). */
function madeSum(state: KbListenState | null): number | null {
  const entries = (state?.entries ?? []).filter(
    (e) => e.state !== "unavailable",
  );
  if (entries.length === 0) return null;
  if (!entries.every((e) => e.state === "made" && e.len)) return null;
  return entries.reduce((a, e) => a + (e.len ?? 0), 0);
}

/**
 * Where Continue listening resumes, when there is somewhere to resume: the place's chapter of the place's own
 * Listen (its language), part-way in (not at 0:00, not at its end). A place in a chapter the book does not have,
 * or at a chapter's end, is none: the control reads Listen.
 */
function resumeOf(
  seed: BookListenSeedView,
  kept: ListenKept | null,
): {
  place: Place;
  home: ListenSeed;
  n: number;
  href: string;
  title: string;
} | null {
  const place = placeOf(seed, kept);
  if (!place) return null;
  const home = seed.langs[place.lang] ?? seed.start;
  const at = home.book?.chapters.find((c) => c.key === place.ch);
  if (!at) return null;
  const len = lenOf(home.state, at.key);
  const atEnd = len !== null && place.pos >= len - 1;
  if (atEnd || place.pos < 1) return null;
  return { place, home, n: at.n, href: at.href, title: at.title };
}

/** The book's own count of chapters this Listen reads: its listenable entries, else the page's count. */
function bookQ(seed: BookListenSeedView, count: string): string {
  const start = seed.start;
  const n = ownChapters(start.state?.entries ?? []).length;
  const sum = madeSum(start.state);
  return LISTEN.control.book(
    n > 0 ? BOOK.head.chapters(n) : count,
    sum !== null ? aboutSum(sum) : null,
  );
}

/** The book page's control (F207's last row, `LR.control` for a book). */
export function bookControlOf(
  seed: BookListenSeedView,
  kept: ListenKept | null,
  count: string,
): HeadControl {
  const r = resumeOf(seed, kept);
  if (r) {
    const q = LISTEN.control.resumeBook(r.n, clockPos(r.place.pos));
    return { form: "resume", q, at: q, pillQ: q, from: r.place.pos };
  }
  const q = bookQ(seed, count);
  return { form: "listen", q, at: "", pillQ: q, from: 0 };
}

/** One of the book page's three starts: the Listen to start, where in its chapter, and the reader it opens. */
export interface BookStart {
  seed: ListenSeed;
  /** Seconds into the start chapter. */
  from: number;
  /** The chapter's reader: the page opens it with the dock. */
  href: string;
  /** The chapter it plays. */
  chapter: string | null;
}

/**
 * The three starts (`result.md` § Build › Listen: "On the book page, Listen plays chapter 1, Continue listening the
 * kept chapter at its place, Start over chapter 1 at 0:00; each opens that chapter's reader with the dock").
 * Listen: the book from its first chapter in the page's language. Start over: the same, in the kept place's own
 * language (a place plays only in its language). Continue listening: the book from the place's chapter, at its
 * seconds, in its language (the server's resume seed when it is that place's, else one made from the book's).
 */
export function bookStartOf(
  what: "listen" | "resume" | "startover",
  seed: BookListenSeedView,
  kept: ListenKept | null,
): BookStart | null {
  const start = seed.start;
  const first = (s: ListenSeed): BookStart => {
    const key = ownChapters(s.state?.entries ?? [])[0];
    const c =
      s.book?.chapters.find((x) => x.key === key) ?? s.book?.chapters[0];
    return {
      seed: s,
      from: 0,
      href: s.href || c?.href || "",
      chapter: c?.key ?? null,
    };
  };
  if (what === "listen") return first(start);
  if (what === "startover") {
    const place = placeOf(seed, kept);
    return first((place && seed.langs[place.lang]) || start);
  }
  const r = resumeOf(seed, kept);
  if (!r) return null;
  const { place, home } = r;
  const s: ListenSeed =
    seed.resume &&
    seed.resume.chapter === place.ch &&
    seed.resume.lang === place.lang
      ? seed.resume
      : {
          ...home,
          key: {
            ...home.key,
            from_chapter: place.ch,
            ...(place.lang ? { lang: place.lang } : {}),
          } as ListenSeed["key"],
          title: r.title,
          lang: place.lang || home.lang,
          // Read by the press itself: the page has no state for this start chapter.
          state: null,
          href: r.href,
          chapter: place.ch,
        };
  return { seed: s, from: place.pos, href: r.href, chapter: place.ch };
}

/** The note's own button (F206): only Update audio and, on the daily limit, Play. */
function actOf(n: HeadNote): boolean {
  return (n.key === "outdated" || n.key === "fail-limit") && !!n.view.action;
}

/**
 * The book head's slot (F206): the note while any Listen of this book is under way; busy from the page's own
 * press until that Listen answers with a state other than `loading`; else the control. Held, from the press until
 * Stop listening, at the book's three tallest notes (preparing stopped, the daily limit, the next chapter
 * preparing).
 */
export function bookHeadOf(p: {
  listen: Listen | null;
  seed: BookListenSeedView;
  kept: ListenKept | null;
  starting: boolean;
  count: string;
}): HeadView {
  const { listen, seed, kept, starting, count } = p;
  const unit = unitOfKey(seed.start.key);
  const control = bookControlOf(seed, kept, count);
  const own = !!listen && listen.unit === unit;
  const hold =
    starting || own ? holdOf(own ? listen : shellOf(seed.start), true) : [];
  const updating = own ? listen.updating : false;
  if (starting && (!own || listen.state === "loading")) {
    return { show: "busy", control, note: null, act: false, hold, updating };
  }
  if (own) {
    const key = noteKey(listen.state, listen.old);
    const note = { key, view: noteView(listen, key) };
    return { show: "note", control, note, act: actOf(note), hold, updating };
  }
  return { show: "control", control, note: null, act: false, hold, updating };
}

/** A row's audio (F209, `LR.bookRows`): its line, and `Playing` / `Paused` on the Listen's chapter. */
export interface RowAudio {
  /** `Audio 16 min`, `Audio preparing… · part 2 of 9`, `Audio not prepared yet`. */
  line: string;
  /** `Playing` or `Paused` on the chapter the Listen is on; "" else. */
  play: "" | "Playing" | "Paused";
}

/**
 * The rows' audio, by chapter key: the page's state, with a live Listen of this book over it (its making moves
 * while the page is open). Taken by default (as today's book page): no audio line before the book has a Listen
 * (nothing made or being made, and none under way), so a book never listened to does not repeat `Audio not
 * prepared yet` on every row.
 */
export function bookRowsOf(
  seed: BookListenSeedView | null,
  listen: Listen | null,
): Record<string, RowAudio> | null {
  if (!seed) return null;
  const start = seed.start;
  const unit = unitOfKey(start.key);
  const L = listen && listen.unit === unit ? listen : null;
  const base = start.state;
  if (!L && (!base || base.state === "none")) return null;
  const B = LISTEN.book;
  // The chapter being made now; the ones queued after it are not prepared yet (F209).
  const making = L ? L.making : (base?.part?.chapter ?? null);
  const out: Record<string, RowAudio> = {};
  for (const c of start.book?.chapters ?? []) {
    const live = L?.entries.find((e) => e.chapter === c.key);
    const e = live ?? base?.entries.find((x) => x.chapter === c.key) ?? null;
    let line = "";
    if (e) {
      if (e.state === "made" && e.len) line = B.audioMade(lengthWords(e.len));
      else if (e.state === "making" && c.key === making) {
        line = B.audioPreparing(
          e.part ? LISTEN.dock.part(e.part.n, e.part.of) : null,
        );
      } else if (e.state === "making" || e.state === "none") {
        line = B.audioNone;
      }
    } else if (L) {
      line = B.audioNone;
    }
    const play: RowAudio["play"] =
      L && L.ch === c.key
        ? L.state === "playing"
          ? "Playing"
          : L.state === "paused"
            ? "Paused"
            : ""
        : "";
    if (line || play) out[c.key] = { line, play };
  }
  return out;
}

/**
 * `.listen-book` (listen:FG2, C01): the grid and its track are held for a member whether or not a Listen is under
 * way (empty at rest, then the pill or the dock), so the column never moves when a Listen starts or stops; a
 * visitor's page has no track and its column is centred alone. A Listen docked from elsewhere also holds it.
 */
export function bookTrackOf(p: { shown: boolean; listen: Listen | null }): {
  wrap: string;
  track: boolean;
} {
  const track = p.shown || !!p.listen;
  return { wrap: track ? "listen-book has-track" : "listen-book", track };
}
