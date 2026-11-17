import { LISTEN } from "@/content/listen";
import { READER_DOCUMENT } from "@/content/reader-document";

import {
  chapterN,
  chapterTitle,
  nextChapter,
  ownChapters,
  prevChapter,
} from "./book";
import { aboutLeft, clockAt, clockPos, lengthWords } from "./format";
import { noteKey, type ListenKey, type NoteKey } from "./machine";
import type { Listen } from "./types";

// P41-sr.W1 — what the dock and the note say for a Listen, transcribed from the signed
// `Dock` and `ListenNote` boards' tables (`11-listen` F7, F9, F10, F23). Pure: the
// components only render these, so one state reads one way everywhere.

export type Lead = "play" | "pause" | "again" | "retry" | "off";

/**
 * P64-3y.S3 — the lead of job 07's dock (frame.md F208, F234; `ListenDockStates.dc.html`'s `LEAD`): Pause,
 * Play, a disabled Play, Start over, Try again and Sign in (the last two in words). `lead` above stays the
 * old dock's (`components/listen/dock.tsx`, the book page's until S5).
 */
export type DockLead =
  "pause" | "play" | "play-off" | "startover" | "retry" | "signin";

export interface DockView {
  lead: Lead;
  /** Job 07's lead (F208). */
  act: DockLead;
  /** The word's shape (job 07 `LR.dock`'s trio). */
  shape: NoteShape;
  /** The line of where the audio is, 0 to 100: always drawn, 0 while nothing is made (F208). */
  pct: number;
  word: string;
  rest: string;
  busy: boolean;
  revoked: boolean;
  /** The chevron (Open the player); a signed-out dock carries Sign in instead. */
  open: boolean;
  signIn: boolean;
  /** The polite live region's words: state and chapter changes, never the position. */
  say: string;
}

/** `12:30 of 42:10`, `2:10 of 9:40 so far` (F2, F23); a book's `Chapter 2 · 12:30` (F2). */
function where(l: Listen): string {
  if (l.kind === "book") {
    return LISTEN.dock.whereBook(chapterN(l, l.ch) ?? 1, clockPos(l.chPos));
  }
  return LISTEN.dock.where(clockPos(l.pos), clockPos(l.len ?? 0), l.soFar);
}

/**
 * A book's chapter count, and the chapters it names (P41-sr.W2). `total` is the book's
 * (a chapter's place, "Chapter 2 of 5"); `own` is this Listen's own listenable chapters,
 * in its language, for every "n chapters" count (P41-sr.F3: "all 2 chapters").
 */
function bookNums(l: Listen): {
  total: number;
  own: number;
  n: number;
  next: number;
  making: number;
} {
  const total = l.book?.chapters.length ?? 1;
  const own = ownChapters(l.entries).length || total;
  const n = chapterN(l, l.ch) ?? 1;
  const next = nextChapter(l, l.ch)?.n ?? n + 1;
  const making = chapterN(l, l.making) ?? n;
  return { total, own, n, next, making };
}

/** The next chapter's own time left preparing, else the Listen's (F10 next-waiting). */
function nextLeft(l: Listen): number | null {
  const nx = nextChapter(l, l.ch);
  const e = nx ? l.entries.find((x) => x.chapter === nx.key) : undefined;
  return e?.left ?? l.left;
}

function seenAt(l: Listen): string | null {
  return clockAt(l.seen);
}

/** The states with nothing made to play: the dock's line stays at 0% (`ListenDockStates.dc.html`'s `NOLEN`). */
const NOTHING_MADE: readonly ListenKey[] = [
  "waiting",
  "making",
  "fail-voice",
  "fail-limit",
  "fail-unreadable",
];

/** Where the audio is, 0 to 100: the chapter's place on a book, the document's on a document (F208). */
function dockPct(l: Listen): number {
  if (NOTHING_MADE.includes(l.state)) return 0;
  const book = l.kind === "book";
  const len = book ? l.chLen : l.len;
  const pos = book ? l.chPos : l.pos;
  if (len === null || !(len > 0) || !Number.isFinite(pos)) return 0;
  return Math.round(Math.min(100, Math.max(0, (100 * pos) / len)));
}

/**
 * The dock's lead, word and rest per state (the `Dock` board's table, F7, F10). P64-3y.S3: the words,
 * shapes and leads are job 07's (`LR.dock`, `ListenDockStates.dc.html`'s `LEAD`; frame.md F208, F232,
 * F233, F234): Loading… names a book's chapter, a finished document and an unreadable text have no rest,
 * the daily limit resumes `09:00 tomorrow`, what is loaded offline is time left, offline stopped plays,
 * signed out leads with Sign in, and the live region names the chapter while a book is paused too.
 */
export function dockView(l: Listen): DockView {
  const D = LISTEN.dock;
  const part = l.part?.n ?? 1;
  const parts = l.part?.of ?? l.parts;
  const seen = seenAt(l);
  const book = l.kind === "book";
  const B = bookNums(l);
  const reset = LISTEN.time.tomorrow("09:00");
  const rows: Record<
    ListenKey,
    [Lead, DockLead, NoteShape, string, string, boolean, boolean]
  > = {
    waiting: [
      "off",
      "play-off",
      "wait",
      D.waiting(LISTEN.runner),
      seen ? D.lastSeen(seen) : "",
      false,
      false,
    ],
    making: [
      "off",
      "play-off",
      "wait",
      D.preparing,
      D.part(part, parts),
      true,
      false,
    ],
    ready: ["play", "play", "on", D.readyToPlay, D.restPreparing, false, false],
    tap: ["play", "play", "on", D.readyToPlay, "", false, false],
    loading: [
      "pause",
      "pause",
      "wait",
      D.loading,
      book ? D.chapter(B.n) : "",
      true,
      false,
    ],
    playing: [
      "pause",
      "pause",
      l.old ? "on" : "live",
      l.old ? D.earlier : D.playing,
      where(l),
      false,
      false,
    ],
    paused: [
      "play",
      "play",
      "on",
      l.old ? D.earlier : D.paused,
      where(l),
      false,
      false,
    ],
    buffering: ["pause", "pause", "wait", D.buffering, where(l), true, false],
    "next-waiting": [
      "pause",
      "pause",
      "wait",
      D.preparing,
      D.chapter(B.next),
      true,
      false,
    ],
    finished: [
      "again",
      "startover",
      "done",
      D.finished,
      book ? D.allChapters(B.own) : "",
      false,
      false,
    ],
    "fail-voice": [
      "retry",
      "retry",
      "fail",
      D.preparingStopped,
      D.tryAgainLower,
      false,
      true,
    ],
    "fail-limit": [
      "off",
      "play-off",
      "fail",
      D.dailyLimit,
      D.resumes(reset),
      false,
      false,
    ],
    "fail-play": [
      "retry",
      "retry",
      "fail",
      D.playbackStopped,
      D.connectionLost,
      false,
      true,
    ],
    "fail-session": ["off", "signin", "fail", D.signedOut, "", false, true],
    "fail-unreadable": [
      "retry",
      "retry",
      "fail",
      D.unreadable,
      "",
      false,
      true,
    ],
    "offline-start": [
      "off",
      "play-off",
      "fail",
      D.offline,
      D.offlineStart,
      false,
      false,
    ],
    "offline-play": [
      "pause",
      "pause",
      "live",
      D.offline,
      D.loaded(aboutLeft(l.loaded)),
      false,
      false,
    ],
    "offline-stopped": [
      "off",
      "play",
      "fail",
      D.offline,
      D.stoppedAt(clockPos(l.stoppedAt ?? l.pos)),
      false,
      false,
    ],
  };
  const [lead, act, shape, word, rest, busy, revoked] = rows[l.state];
  const say =
    l.state === "fail-session"
      ? D.say.signedOut
      : l.state === "fail-limit"
        ? D.say.dailyLimit(reset)
        : l.state === "next-waiting" && book
          ? D.say.nextWaiting(B.next)
          : (l.state === "playing" || l.state === "paused") && book
            ? D.say.playingChapter(
                word,
                B.n,
                // The chapter's own title only (P41-sr.F3); its place is already said.
                l.titleLang !== null ? l.title : null,
              )
            : word;
  return {
    lead,
    act,
    shape,
    pct: dockPct(l),
    word,
    rest,
    busy,
    revoked,
    open: l.state !== "fail-session",
    signIn: l.state === "fail-session",
    say,
  };
}

export type Trio = "active" | "idle" | "revoked";
/**
 * P64-3y.S2 — F204's shapes (job 07, `LR.note`'s `trio`): live (accent, filled), on (ink, filled), wait (the
 * ring, turning), done (the check), fail (the error mark). Never colour alone: a shape and a word.
 */
export type NoteShape = "live" | "on" | "wait" | "done" | "fail";
export type NoteAction = "play" | "retry" | "again" | "signin" | "update" | "";

export interface NoteView {
  trio: Trio;
  /** F204's shape of the word (job 07). */
  shape: NoteShape;
  word: string;
  text: string;
  busy: boolean;
  /** The progress line's percent (F9), or null where it does not apply. */
  line: number | null;
  lineLabel: string;
  /** The reference line in mono for the two failures on our side. */
  ref: string;
  action: NoteAction;
}

/** F204's shape per note key (job 07 `LR.note`). */
const SHAPES: Record<NoteKey, NoteShape> = {
  waiting: "wait",
  making: "wait",
  ready: "on",
  tap: "on",
  loading: "wait",
  buffering: "wait",
  playing: "live",
  paused: "on",
  "next-waiting": "live",
  finished: "done",
  "fail-voice": "fail",
  "fail-limit": "fail",
  "fail-play": "fail",
  "fail-session": "fail",
  "fail-unreadable": "fail",
  "offline-start": "fail",
  "offline-play": "live",
  "offline-stopped": "fail",
  outdated: "on",
};

/** Overrides for the head's held copies (a state that is not the Listen's own). */
export interface NoteOptions {
  /** The daily limit's ready part ("14 min"); null for none. */
  ready?: string | null;
  /** The daily limit's reset ("09:00 tomorrow"). */
  reset?: string;
}

/**
 * The note's word, sentence, line and action per state (the `ListenNote` board's table, F9, F10). P64-3y.S2:
 * the words, shapes and lines are job 07's `LR.note` (frame.md F204, F227: the record's word where the two
 * differed): the live states carry no sentence (the dock says the place), the next chapter waiting reads
 * Playing with how much of the book is prepared, what is loaded offline is time left (F233), and a line
 * shows its own figure (0% before the first part).
 */
export function noteView(
  l: Listen,
  key: NoteKey,
  opts: NoteOptions = {},
): NoteView {
  const N = LISTEN.note;
  const part = l.part?.n ?? 1;
  const parts = l.part?.of ?? l.parts;
  const left = l.left !== null ? aboutLeft(l.left) : null;
  const made = l.len !== null && l.len > 0 ? lengthWords(l.len) : null;
  const book = l.kind === "book";
  const B = bookNums(l);
  // F9: a book's step names the chapter being made (fill: chapters done / chapters, F31).
  const done = book
    ? (B.making - 1) / B.total
    : parts > 0
      ? l.partsMade / parts
      : 0;
  const making = book
    ? N.makingBook(B.making, B.total, left ?? LISTEN.time.under5)
    : part <= 1 || left === null
      ? N.makingFirst(parts)
      : N.makingPart(part, parts, left);
  const nl = nextLeft(l);
  // The book's chapters prepared (the next chapter waiting): made entries of the book's chapters.
  const madeShare =
    B.total > 0
      ? l.entries.filter((e) => e.state === "made").length / B.total
      : 0;
  const limitReady = opts.ready === undefined ? made : opts.ready;
  const rows: Record<
    NoteKey,
    [Trio, string, string, NoteAction, number | null, boolean, string]
  > = {
    waiting: [
      "idle",
      N.waiting,
      N.waitingText(LISTEN.runner, seenAt(l)),
      "",
      null,
      false,
      "",
    ],
    making: ["idle", N.preparing, making, "", done, false, ""],
    ready: [
      "active",
      N.ready,
      N.readyText(made ?? lengthWords(0)),
      "play",
      done,
      false,
      "",
    ],
    tap: ["active", N.ready, N.tapText, "play", null, false, ""],
    loading: ["idle", N.loading, "", "", null, true, ""],
    buffering: ["idle", N.buffering, "", "", null, true, ""],
    playing: ["active", N.playing, "", "", null, false, ""],
    paused: ["idle", N.paused, "", "", null, false, ""],
    "next-waiting": [
      "active",
      N.playing,
      N.nextWaitingText(
        B.next,
        nl !== null ? aboutLeft(nl) : LISTEN.time.under5,
      ),
      "",
      madeShare,
      false,
      "",
    ],
    finished: [
      "active",
      N.finished,
      book ? N.finishedBook(B.own) : N.finishedDoc,
      "again",
      null,
      false,
      "",
    ],
    "fail-voice": [
      "revoked",
      N.stopped,
      N.voiceText(part, parts),
      "retry",
      null,
      false,
      N.voiceRef,
    ],
    "fail-limit": [
      "idle",
      N.dailyLimit,
      N.limitText(opts.reset ?? LISTEN.time.tomorrow("09:00"), limitReady),
      limitReady ? "play" : "",
      null,
      false,
      "",
    ],
    "fail-play": [
      "revoked",
      N.stopped,
      N.playText(clockPos(l.stoppedAt ?? l.pos)),
      "retry",
      null,
      false,
      "",
    ],
    "fail-session": [
      "revoked",
      N.signedOut,
      N.sessionText,
      "signin",
      null,
      false,
      "",
    ],
    "fail-unreadable": [
      "revoked",
      N.unreadable,
      N.unreadableText(book ? "chapter" : "document"),
      "retry",
      null,
      false,
      N.unreadableRef,
    ],
    "offline-start": [
      "idle",
      N.offline,
      N.offlineStartText,
      "",
      null,
      false,
      "",
    ],
    "offline-play": [
      "idle",
      N.offline,
      N.offlinePlayText(aboutLeft(l.loaded)),
      "",
      null,
      false,
      "",
    ],
    "offline-stopped": [
      "idle",
      N.offline,
      N.offlineStoppedText(clockPos(l.stoppedAt ?? l.pos)),
      "",
      null,
      false,
      "",
    ],
    outdated: ["idle", N.earlier, N.outdatedText, "update", null, false, ""],
  };
  const [trio, word, text, action, frac, busy, ref] = rows[key];
  return {
    trio,
    shape: SHAPES[key],
    word,
    text,
    busy,
    line: frac === null ? null : Math.round(Math.max(0, frac) * 100),
    lineLabel: book ? N.lineBook : N.lineDoc,
    ref,
    action,
  };
}

/**
 * P64-3y.S4 — the opened player's transport lead (frame.md F211, `ListenPlayerStates.dc.html`'s `LX.player`):
 * the dock's lead, but signed out is a disabled Play (Sign in is the zone's button there).
 */
export type PlayerLead = "pause" | "play" | "play-off" | "startover" | "retry";

/** One row of the player's Chapters (F211: made ones are buttons that play; the current says Playing/Paused). */
export interface PlayerRow {
  id: string;
  n: number;
  title: string;
  titleLang: string;
  /** `16 min` once made, `Preparing… · part 2 of 9` while made, else `Not prepared yet`. */
  line: string;
  /** Made, and on this Listen's stream (a chapter before its first one is not). */
  playable: boolean;
  current: boolean;
  /** `Playing` or `Paused` on the current row, else empty (the row reads its line). */
  word: string;
}

/** The board's `player` prop (`ListenPlayer.dc.html`), from the one Listen. */
export interface PlayerView {
  key: NoteKey;
  meta: string;
  title: string;
  titleLang: string;
  word: string;
  shape: NoteShape;
  text: string;
  line: number | null;
  lineLabel: string;
  ref: string;
  /** The zone's one button (FG8): Update audio or Sign in, else none. */
  action: "update" | "signin" | "";
  updating: boolean;
  /** Seconds into the chapter (a book) or the document; `len` 0: nothing made yet, no length. */
  pos: number;
  len: number;
  soFar: boolean;
  lead: PlayerLead;
  seekable: boolean;
  isBook: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  /** The chapters Previous and Next move to. */
  prev: string | null;
  next: string | null;
  speed: number;
  follow: boolean;
  /** `Chapter 6 of 14` (a book), else empty. */
  where: string;
  rows: PlayerRow[];
}

/** The states with no place to seek (`LX.player`'s `seekable`): signed out and offline before starting. */
const NO_SEEK: readonly ListenKey[] = ["fail-session", "offline-start"];

/**
 * The opened player's view of a Listen (frame.md F211, F234 FG8; `LX.player`): the meta line and title, the
 * zone (the note's word, sentence, line and reference, with a button only for Update audio and Sign in), the
 * position in the chapter (a book) or the document (`0:00` alone while nothing is made), the transport's lead,
 * Previous and Next, speed and follow along, and the book's chapters. Pure. `docWhere` is the document head's
 * own meta line (`Document in <project>`), when the page has its project's name.
 */
export function playerView(
  l: Listen,
  opts: { docWhere?: string } = {},
): PlayerView {
  const key = noteKey(l.state, l.old);
  const note = noteView(l, key);
  const book = l.kind === "book" && l.book ? l.book : null;
  const total = book?.chapters.length ?? 0;
  const n = chapterN(l, l.ch) ?? 1;
  const fromN = chapterN(l, l.from) ?? 1;
  const act = dockView(l).act;
  const lead: PlayerLead = act === "signin" ? "play-off" : act;
  const rawLen = book ? l.chLen : l.len;
  const len =
    NOTHING_MADE.includes(l.state) || rawLen === null || !(rawLen > 0)
      ? 0
      : rawLen;
  const rawPos = book ? l.chPos : l.pos;
  const pos = Math.max(0, Math.min(len, Number.isFinite(rawPos) ? rawPos : 0));
  const prev = prevChapter(l, l.ch);
  const next = nextChapter(l, l.ch);
  const onStream = (cn: number) => cn >= fromN;
  const word =
    l.state === "playing"
      ? LISTEN.player.playing
      : l.state === "paused"
        ? LISTEN.player.paused
        : "";
  const rows: PlayerRow[] = book
    ? book.chapters.map((c) => {
        const e = l.entries.find((x) => x.chapter === c.key);
        const made = onStream(c.n) && e?.state === "made" && !!e.len;
        const preparing =
          onStream(c.n) && e?.state === "making" && c.key === l.making;
        const named = chapterTitle(l, c.key);
        return {
          id: c.key,
          n: c.n,
          title: named?.title ?? LISTEN.dock.chapter(c.n),
          titleLang: named?.lang ?? "en",
          line: made
            ? lengthWords(e?.len ?? 0)
            : preparing
              ? LISTEN.player.preparing(
                  e?.part ? LISTEN.dock.part(e.part.n, e.part.of) : null,
                )
              : LISTEN.player.notPrepared,
          playable: made,
          current: c.key === l.ch,
          word: c.key === l.ch ? word : "",
        };
      })
    : [];
  return {
    key,
    meta: book
      ? LISTEN.player.meta(book.title, n, total)
      : (opts.docWhere ?? READER_DOCUMENT.where(l.key.project)),
    title: l.title,
    titleLang: l.titleLang ?? "en",
    word: note.word,
    shape: note.shape,
    text: note.text,
    line: note.line,
    lineLabel: note.lineLabel,
    ref: note.ref,
    action:
      key === "outdated" ? "update" : key === "fail-session" ? "signin" : "",
    updating: l.updating,
    pos,
    len,
    soFar: book ? l.chSoFar : l.soFar,
    lead,
    seekable: len > 0 && !NO_SEEK.includes(l.state),
    isBook: !!book,
    hasPrev: !!prev && onStream(prev.n),
    hasNext: !!next,
    prev: prev && onStream(prev.n) ? prev.key : null,
    next: next?.key ?? null,
    speed: l.speed,
    follow: l.follow,
    where: book ? LISTEN.player.where(n, total) : "",
    rows,
  };
}
