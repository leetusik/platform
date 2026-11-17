import { LISTEN } from "@/content/listen";
import { placeIn, unitOfKey } from "@/lib/listen/book";
import { aboutSum, clockPos, lengthWords } from "@/lib/listen/format";
import { noteKey, type NoteKey } from "@/lib/listen/machine";
import type { Listen, ListenKept, ListenSeed } from "@/lib/listen/types";
import { noteView, type NoteShape, type NoteView } from "@/lib/listen/view";
import type { StatusState } from "@/hi2vi/ui";

/**
 * Listen in a head (job 07, round 01: frame.md F206, F207, F210; `AudioHead.dc.html`, `Listen.dc.html`'s
 * `slot`, `holds` and `FOLLOWS`): what the head's slot shows for a page, pure, so it is proved in node.
 * No `"use client"`: a server component may call it.
 *
 *   control  no Listen of this text: Listen (with its scope or length) or Continue listening + Start over
 *   busy     from the press until the Listen answers: Listen's control reading Starting…, no length
 *   note     this text's Listen (a chapter: the Listen's chapter; a document: its unit): LR.note's word,
 *            shape, sentence, line, reference and, for Update audio and the daily limit's Play, its button
 *
 * `hold`: from the press until Stop listening (and while the Listen plays another chapter of this book), the
 * three tallest notes this text can show, so the text under the head never moves (F206, listen C07).
 */

/** The control's form (`LR.control`): `q` beside Listen, `at` beside Continue listening, the pill's `pillQ`. */
export interface HeadControl {
  form: "listen" | "resume";
  q: string;
  at: string;
  pillQ: string;
  /** Where Continue listening starts (seconds); 0 for Listen. */
  from: number;
}

export interface HeadNote {
  key: NoteKey;
  view: NoteView;
}

export interface HeadView {
  show: "control" | "busy" | "note";
  control: HeadControl;
  note: HeadNote | null;
  /** The live note's own button shows (F206: Update audio, and Play on the daily limit). */
  act: boolean;
  hold: HeadNote[];
  updating: boolean;
}

/** AudioHead's events (F206 `on-listen(what)`). */
export type ListenWhat =
  "listen" | "resume" | "startover" | "play" | "retry" | "signin" | "update";

/**
 * F206: the slot is `false` for a visitor and for an older version of the text; a member on the newest
 * version has it when the page could seed a Listen (the server read a state for it).
 */
export function listenShown(p: {
  member: boolean;
  version: number;
  newest: number;
  seed: ListenSeed | null | undefined;
}): boolean {
  return !!p.seed && p.member && p.version >= p.newest;
}

/** F204's shapes as the system's status states (`.status-busy` is job 07's `.status-wait`). */
export const SHAPE_STATE: Record<NoteShape, StatusState> = {
  live: "live",
  on: "active",
  wait: "busy",
  done: "done",
  fail: "fail",
};

/** The states the rule of follow along shows in (Listen.dc.html's `FOLLOWS`: the states with a place). */
const FOLLOWS: readonly NoteKey[] = [
  "playing",
  "paused",
  "buffering",
  "offline-play",
  "offline-stopped",
  "outdated",
  "fail-play",
  "fail-session",
];

export function followsIn(key: NoteKey): boolean {
  return FOLLOWS.includes(key);
}

/** This chapter's made length, from the state read for it (its first entry). */
function chapterLen(seed: ListenSeed): number | null {
  const e = seed.state?.entries.find((x) => x.chapter === seed.chapter);
  return e && e.state === "made" && e.len ? e.len : null;
}

/**
 * Left part-way, or kept by Stop listening (F231): where Continue listening goes on from, in the language
 * this page's Listen reads (another language's place is none).
 */
function resumeOf(
  seed: ListenSeed,
  kept: ListenKept | null,
): { pos: number; len: number | null } | null {
  const lang = seed.state?.listen.lang || seed.lang;
  const k = placeIn(kept, lang);
  // P64-3y.F1 (F231): a Listen of this unit that ended keeping nothing leaves no place, read or kept.
  if (k && k.unit === unitOfKey(seed.key) && k.none) return null;
  if (k && k.unit === unitOfKey(seed.key) && k.ch === seed.chapter) {
    return { pos: k.pos, len: k.len ?? chapterLen(seed) };
  }
  const s = seed.state;
  if (!s) return null;
  if (seed.book) {
    const r = placeIn(s.resume, lang);
    const len = chapterLen(seed);
    if (!r || r.chapter !== seed.chapter || len === null) return null;
    if (r.seconds < 1 || r.seconds >= len - 1) return null;
    return { pos: r.seconds, len };
  }
  const p = placeIn(s.position, lang);
  if (!p || s.len === null || s.len <= 0) return null;
  if (p.seconds < 1 || p.seconds >= s.len - 1) return null;
  return { pos: p.seconds, len: s.len };
}

/** A chapter's scope (F207): `Chapters 6–14`, with the sum once every one is made; the last `Chapter 14 · 4 min`. */
function chapterQ(seed: ListenSeed): string {
  const book = seed.book;
  const n = book?.chapters.find((c) => c.key === seed.chapter)?.n ?? 1;
  const total = book?.chapters.length ?? n;
  const entries = (seed.state?.entries ?? []).filter(
    (e) => e.state !== "unavailable",
  );
  const allMade =
    entries.length > 0 && entries.every((e) => e.state === "made" && e.len);
  const sum = allMade ? entries.reduce((a, e) => a + (e.len ?? 0), 0) : 0;
  const lastKey = entries[entries.length - 1]?.chapter;
  const to = book?.chapters.find((c) => c.key === lastKey)?.n ?? total;
  if (n >= to) {
    return LISTEN.control.lastChapter(n, allMade ? lengthWords(sum) : null);
  }
  return LISTEN.control.chapters(n, to, allMade ? aboutSum(sum) : null);
}

/** The control for a text with no Listen of its own under way (F207, `LR.control`). */
export function controlOf(
  seed: ListenSeed,
  kept: ListenKept | null,
): HeadControl {
  const r = resumeOf(seed, kept);
  if (r) {
    const pos = clockPos(r.pos);
    return {
      form: "resume",
      q: pos,
      at: r.len !== null ? LISTEN.control.resumeQ(pos, clockPos(r.len)) : pos,
      pillQ: pos,
      from: r.pos,
    };
  }
  if (seed.book) {
    const q = chapterQ(seed);
    return { form: "listen", q, at: "", pillQ: q, from: 0 };
  }
  // A document's length only once made: a text with nothing made shows Listen with no length (F206).
  const made =
    seed.state?.state === "made" && seed.state.len
      ? lengthWords(seed.state.len)
      : "";
  return { form: "listen", q: made, at: "", pillQ: made, from: 0 };
}

/** A Listen standing in for a page's text before its Listen exists (the held notes' figures at the press). */
export function shellOf(seed: ListenSeed): Listen {
  const s = seed.state;
  return {
    unit: unitOfKey(seed.key),
    key: seed.key,
    kind: seed.book ? "book" : "doc",
    title: seed.title,
    titleLang: null,
    lang: s?.listen.lang || seed.lang,
    href: seed.href,
    book: seed.book,
    from: seed.chapter,
    ch: seed.chapter,
    chPos: 0,
    chLen: null,
    chSoFar: false,
    making: null,
    entries: (s?.entries ?? []).map((e) => ({
      chapter: e.chapter,
      state: e.state,
      len: e.len ?? null,
      part: null,
      left: null,
    })),
    spans: [],
    state: "loading",
    back: null,
    old: false,
    updating: false,
    soFar: false,
    len: s?.len ?? null,
    pos: 0,
    part: null,
    parts: s?.made?.of ?? 0,
    partsMade: s?.made?.parts ?? 0,
    left: s?.left_seconds ?? null,
    seen: null,
    loaded: 0,
    stoppedAt: null,
    speed: 1,
    follow: true,
    play: null,
    segs: [],
    seg: -1,
  };
}

/**
 * The three tallest notes a text can show (F206): preparing stopped, the daily limit (held without the ready
 * part's sentence, as Listen.dc.html's `holds`), then the next chapter preparing (a chapter or the book) or
 * offline stopped (a document).
 */
export function holdOf(l: Listen, chapter: boolean): HeadNote[] {
  const third: NoteKey = chapter ? "next-waiting" : "offline-stopped";
  return [
    { key: "fail-voice", view: noteView(l, "fail-voice") },
    { key: "fail-limit", view: noteView(l, "fail-limit", { ready: null }) },
    { key: third, view: noteView(l, third) },
  ];
}

/** The note's own button (F206): only Update audio and, on the daily limit, Play. */
function actOf(n: HeadNote): boolean {
  return (n.key === "outdated" || n.key === "fail-limit") && !!n.view.action;
}

/**
 * The head's slot for a text page (a chapter or a document): `starting` is the page's own press, until its
 * Listen answers with a state other than `loading`.
 */
export function headOf(p: {
  listen: Listen | null;
  seed: ListenSeed;
  kept: ListenKept | null;
  starting: boolean;
}): HeadView {
  const { listen, seed, kept, starting } = p;
  const unit = unitOfKey(seed.key);
  const control = controlOf(seed, kept);
  const ofUnit = !!listen && listen.unit === unit;
  const here = ofUnit && (listen.kind !== "book" || listen.ch === seed.chapter);
  const hold =
    starting || ofUnit
      ? holdOf(ofUnit ? listen : shellOf(seed), !!seed.book)
      : [];
  const updating = ofUnit ? listen.updating : false;
  if (starting && (!here || listen.state === "loading")) {
    return { show: "busy", control, note: null, act: false, hold, updating };
  }
  if (here) {
    const key = noteKey(listen.state, listen.old);
    const note = { key, view: noteView(listen, key) };
    return { show: "note", control, note, act: actOf(note), hold, updating };
  }
  return { show: "control", control, note: null, act: false, hold, updating };
}

/** What the dock's track holds (F207, F208, listen:FG1, FG3): the dock, Listen's pill, or nothing. */
export interface TrackView {
  show: "dock" | "pill" | null;
  /** On a chapter while the bars show, the track stands one foot bar up (listen:FG1). */
  overFoot: boolean;
}

/**
 * The track of a reading page: any Listen under way is the dock (it stays between reading pages); else, for a
 * text that has Listen, the pill once the page lets it show (the head's control under the top bar, nothing
 * ahead of it in the slot's order); else nothing. On a chapter it stands over the foot bar while the bars show.
 *
 * P64-3y.F1 — `starting`: the page's head reads Starting… (`startingOf`). `Listen.dc.html`'s "Starting…" draws no
 * dock and no pill until the Listen answers (its `begin` sets the Listen only once start answers; `pillOn` needs
 * the head's control): the track holds nothing meanwhile, so the dock never reads Loading… beside Starting….
 */
export function trackOf(p: {
  listen: Listen | null;
  shown: boolean;
  pill: boolean;
  chapter: boolean;
  hidden: boolean;
  starting?: boolean;
}): TrackView {
  const show = p.starting
    ? null
    : p.listen
      ? "dock"
      : p.shown && p.pill
        ? "pill"
        : null;
  return { show, overFoot: p.chapter && !p.hidden };
}

/**
 * P64-3y.F1 — whether the track holds back for a Starting… head: the page's own flag (the book page's head, busy from
 * its press: `BookBody`'s `starting`), or a text page's press read from `./starting` (`startingOf`).
 */
export function trackStartingOf(p: {
  starting: boolean;
  pressed: string | null;
  seed: Pick<ListenSeed, "key" | "chapter"> | null;
  listen: Listen | null;
}): boolean {
  if (p.starting) return true;
  return (
    !!p.seed &&
    startingOf({ pressed: p.pressed, seed: p.seed, listen: p.listen })
  );
}

/** P64-3y.F1 — a text page's own name for its head's press: the Listen's unit and the chapter on screen. */
export function textOf(seed: Pick<ListenSeed, "key" | "chapter">): string {
  return `${unitOfKey(seed.key)}#${seed.chapter ?? ""}`;
}

/**
 * P64-3y.F1 — whether a text page's head reads Starting… (F206: "This text's Listen starting: the control, busy,
 * Starting…"): this text's own press (the head's control or its pill: `pressed`, `textOf`) is out, and the
 * Listen has not answered it, that is no Listen of this unit yet, or this unit's still `loading`. The head
 * (`headOf`) and the track (`trackOf`) read the one answer.
 */
export function startingOf(p: {
  pressed: string | null;
  seed: Pick<ListenSeed, "key" | "chapter">;
  listen: Listen | null;
}): boolean {
  if (p.pressed === null || p.pressed !== textOf(p.seed)) return false;
  const unit = unitOfKey(p.seed.key);
  const answered =
    !!p.listen && p.listen.unit === unit && p.listen.state !== "loading";
  return !answered;
}
