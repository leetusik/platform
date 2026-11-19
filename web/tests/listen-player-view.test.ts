import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { goToText, PlayerBody, pressPlayer } from "@/hi2vi/listen";
import type { ListenKey } from "@/lib/listen/machine";
import {
  getKept,
  setEngine,
  setKept,
  setListen,
  takeScroll,
  type ListenEngine,
} from "@/lib/listen/store";
import type { Listen, ListenBookKey } from "@/lib/listen/types";
import { playerView, type PlayerView } from "@/lib/listen/view";

// The opened player (job 07, round 01: frame.md F211, F234 FG8; `ListenPlayer.dc.html` and
// `ListenPlayerStates.dc.html`'s `LX.player` and its eight ITEMS). The figures are the record's: the platform
// handbook, 14 chapters (chapter 6 "Capture: from a widget to a message", 15:30; chapters 1 to 6 made, 7
// preparing at part 2 of 9, 8 to 14 not prepared yet), a document at 3:10 of 10:20, an hour-long document at
// 41:20, and the first-time document whose first part (3:35 of 14:20) is made.

const TITLES = [
  "What the platform is for",
  "A request, end to end",
  "Projects, orgs and who can read what",
  "How a document is stored",
  "The search index",
  "Capture: from a widget to a message",
  "Sessions and sign-in",
  "API keys and what they reach",
  "How search ranks a passage",
  "Books, chapters and versions",
  "Listening and review",
  "프로젝트와 조직: 누가 무엇을 읽는가",
  "When something fails",
  "Where to change what",
];
const LENS = [
  430, 520, 725, 410, 515, 930, 415, 425, 820, 530, 420, 405, 440, 215,
];
const BOOK = {
  title: "The platform handbook",
  href: "/@june/platform/books/platform-handbook",
  chapters: TITLES.map((title, i) => ({
    key: `c${i + 1}`,
    n: i + 1,
    title,
    lang: i === 11 ? "ko" : "en",
    href: `/@june/platform/books/platform-handbook/c${i + 1}`,
  })),
};
const bookKey = (from: string): ListenBookKey => ({
  org: "june",
  project: "platform",
  book: "platform-handbook",
  from_chapter: from,
});
/** The book's audio: `made` chapters made, the next one making at part 2 of 9, from `from` on. */
const entries = (made: number, from = 1) =>
  BOOK.chapters
    .filter((c) => c.n >= from)
    .map((c, i) => ({
      chapter: c.key,
      state: (c.n <= made ? "made" : c.n === made + 1 ? "making" : "none") as
        "made" | "making" | "none",
      len: c.n <= made ? LENS[i + from - 1] : null,
      part: c.n === made + 1 ? { n: 2, of: 9 } : null,
      left: c.n === made + 1 ? 290 : null,
    }));

function doc(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return {
    unit: "june/platform/2026-10-30-sign-in-across-the-apps",
    key: {
      org: "june",
      project: "platform",
      doc: "2026-10-30-sign-in-across-the-apps",
    },
    kind: "doc",
    title: "One sign-in across the library, the inbox and the console",
    titleLang: "en",
    lang: "en",
    href: "/@june/platform/2026-10-30-sign-in-across-the-apps",
    book: null,
    from: null,
    ch: null,
    chPos: 190,
    chLen: 620,
    chSoFar: false,
    making: null,
    entries: [],
    spans: [],
    state,
    back: null,
    old: false,
    updating: false,
    soFar: false,
    len: 620,
    pos: 190,
    part: null,
    parts: 4,
    partsMade: 4,
    left: null,
    seen: null,
    loaded: 0,
    stoppedAt: null,
    speed: 1,
    follow: true,
    play: null,
    segs: [],
    seg: -1,
    ...more,
  };
}

/** The handbook's Listen from `from`, heard at `ch` and `chPos` seconds into it. */
function book(
  state: ListenKey,
  ch: number,
  chPos: number,
  more: Partial<Listen> = {},
  from = 1,
  made = 6,
): Listen {
  const before = LENS.slice(from - 1, ch - 1).reduce((a, b) => a + b, 0);
  return doc(state, {
    unit: "june/platform/books/platform-handbook",
    key: bookKey(`c${from}`),
    kind: "book",
    title: TITLES[ch - 1],
    href: BOOK.href,
    book: BOOK,
    from: `c${from}`,
    ch: `c${ch}`,
    chPos,
    chLen: LENS[ch - 1],
    making: made < 14 ? `c${made + 1}` : null,
    entries: entries(made, from),
    len: LENS.slice(from - 1, made).reduce((a, b) => a + b, 0),
    pos: before + chPos,
    parts: 9,
    partsMade: 1,
    left: 290,
    ...more,
  });
}

const rowLines = (v: PlayerView) =>
  v.rows.map((r) => [r.n, r.line, r.playable, r.current, r.word]);

// ListenPlayerStates' ITEMS, each from the one Listen as the engine holds it.
describe("the player's view of each signed state (LX.player)", () => {
  it("Playing: chapter 6 at 12:30 of 15:30", () => {
    const v = playerView(book("playing", 6, 750));
    expect(v).toMatchObject({
      key: "playing",
      meta: "The platform handbook · Chapter 6 of 14",
      title: "Capture: from a widget to a message",
      word: "Playing",
      shape: "live",
      text: "",
      line: null,
      action: "",
      pos: 750,
      len: 930,
      soFar: false,
      lead: "pause",
      seekable: true,
      isBook: true,
      hasPrev: true,
      hasNext: true,
      prev: "c5",
      next: "c7",
      speed: 1,
      follow: true,
      where: "Chapter 6 of 14",
    });
    expect(rowLines(v)).toEqual([
      [1, "7 min", true, false, ""],
      [2, "9 min", true, false, ""],
      [3, "12 min", true, false, ""],
      [4, "7 min", true, false, ""],
      [5, "9 min", true, false, ""],
      [6, "16 min", true, true, "Playing"],
      [7, "Preparing… · part 2 of 9", false, false, ""],
      ...[8, 9, 10, 11, 12, 13, 14].map((n) => [
        n,
        "Not prepared yet",
        false,
        false,
        "",
      ]),
    ]);
    expect(v.rows[0].title).toBe("What the platform is for");
    // A Korean chapter's title is never put in an English Listen's mouth (P41-sr.F3): its place stands in.
    expect(v.rows[11].title).toBe("Chapter 12");
  });

  it("Paused, chapter 1, 1.5×, follow along off", () => {
    const v = playerView(book("paused", 1, 95, { speed: 1.5, follow: false }));
    expect(v).toMatchObject({
      key: "paused",
      meta: "The platform handbook · Chapter 1 of 14",
      word: "Paused",
      shape: "on",
      pos: 95,
      len: 430,
      lead: "play",
      seekable: true,
      hasPrev: false,
      hasNext: true,
      speed: 1.5,
      follow: false,
      where: "Chapter 1 of 14",
    });
    expect(v.rows[0]).toMatchObject({ current: true, word: "Paused" });
  });

  it("Next chapter preparing: chapter 6 at its end", () => {
    const v = playerView(book("next-waiting", 6, 930));
    expect(v).toMatchObject({
      key: "next-waiting",
      word: "Playing",
      shape: "live",
      text: "Chapter 7 is still preparing, under 5 min. It plays by itself when it’s ready.",
      line: 43,
      lineLabel: "Chapters prepared",
      pos: 930,
      len: 930,
      lead: "pause",
      seekable: true,
    });
    // Not Playing or Paused: the current row reads its own line.
    expect(v.rows[5]).toMatchObject({
      current: true,
      word: "",
      line: "16 min",
    });
  });

  it("Daily limit: chapter 7, nothing made: 0:00 alone, no seek, a disabled Play", () => {
    const v = playerView(book("fail-limit", 7, 0));
    expect(v).toMatchObject({
      key: "fail-limit",
      meta: "The platform handbook · Chapter 7 of 14",
      word: "Daily limit",
      shape: "fail",
      pos: 0,
      len: 0,
      lead: "play-off",
      seekable: false,
      action: "",
    });
    expect(v.text).toMatch(
      /^The free voice’s daily limit is reached\. Preparing goes on by itself at 09:00 tomorrow\./,
    );
  });

  it("Finished: chapter 14, the whole book made", () => {
    const v = playerView(book("finished", 14, 215, {}, 1, 14));
    expect(v).toMatchObject({
      key: "finished",
      word: "Finished",
      shape: "done",
      text: "You’ve listened to all 14 chapters.",
      pos: 215,
      len: 215,
      lead: "startover",
      seekable: true,
      hasPrev: true,
      hasNext: false,
      next: null,
    });
    expect(v.rows.every((r) => r.line.endsWith(" min"))).toBe(true);
  });

  it("Document, earlier version of the audio: Update audio in the zone, no chapters", () => {
    const v = playerView(doc("playing", { old: true }));
    expect(v).toMatchObject({
      key: "outdated",
      meta: "Document in platform",
      title: "One sign-in across the library, the inbox and the console",
      word: "Earlier version",
      shape: "on",
      text: "The text changed after this audio was made. Until you update it, you hear the earlier version.",
      action: "update",
      updating: false,
      pos: 190,
      len: 620,
      lead: "pause",
      seekable: true,
      isBook: false,
      hasPrev: false,
      hasNext: false,
      where: "",
      rows: [],
    });
    // The head's own meta line, when the page passes it (S6: the document reader's project name).
    expect(
      playerView(doc("playing", { old: true }), {
        docWhere: "Document in Platform",
      }).meta,
    ).toBe("Document in Platform");
  });

  it("Signed out, an hour-long document: Sign in in the zone, the place shown but not seekable", () => {
    const v = playerView(
      doc("fail-session", { pos: 2480, chPos: 2480, len: 4030, chLen: 4030 }),
    );
    expect(v).toMatchObject({
      key: "fail-session",
      word: "Signed out",
      shape: "fail",
      text: "Your session has expired. Sign in again to keep listening.",
      action: "signin",
      pos: 2480,
      len: 4030,
      lead: "play-off",
      seekable: false,
    });
  });

  it("320 px, first part ready: 0:00 of 3:35 so far", () => {
    const v = playerView(
      doc("ready", {
        title: "How a phase becomes slices",
        pos: 0,
        chPos: 0,
        len: 215,
        chLen: 215,
        soFar: true,
        chSoFar: true,
        parts: 4,
        partsMade: 1,
      }),
    );
    expect(v).toMatchObject({
      key: "ready",
      word: "Ready",
      shape: "on",
      text: "The first 4 min are ready to play; the rest is still preparing.",
      line: 25,
      lineLabel: "Audio prepared",
      pos: 0,
      len: 215,
      soFar: true,
      lead: "play",
      seekable: true,
    });
  });

  it("holds the leads of the transport (F211: Play, Pause, Start over, Try again, a disabled Play)", () => {
    const leads = (
      [
        "loading",
        "buffering",
        "tap",
        "waiting",
        "making",
        "fail-voice",
        "fail-play",
        "fail-unreadable",
        "offline-start",
        "offline-play",
        "offline-stopped",
      ] as ListenKey[]
    ).map((k) => [k, playerView(doc(k)).lead]);
    expect(Object.fromEntries(leads)).toEqual({
      loading: "pause",
      buffering: "pause",
      tap: "play",
      waiting: "play-off",
      making: "play-off",
      "fail-voice": "retry",
      "fail-play": "retry",
      "fail-unreadable": "retry",
      "offline-start": "play-off",
      "offline-play": "pause",
      "offline-stopped": "play",
    });
    // The zone carries a button only for Update audio and Sign in (FG8).
    expect(
      (["fail-voice", "fail-limit", "offline-stopped", "tap"] as ListenKey[])
        .map((k) => playerView(doc(k)).action)
        .join(""),
    ).toBe("");
  });

  // P64-3y.F2 (F211): a chapter before the Listen's first one is a row like any other (made ones play), and
  // Previous sits at that first one; with no page's read of those chapters they say nothing and are still
  // (`listen-player-chapters.test.ts` holds the whole rule).
  it("keeps a chapter before the Listen's first one still while no read says it is made, with Previous at that first one", () => {
    const v = playerView(book("playing", 6, 750, {}, 6));
    expect([v.hasPrev, v.prev]).toEqual([true, "c5"]);
    expect(v.rows.slice(0, 5).map((r) => [r.playable, r.line])).toEqual([
      [false, ""],
      [false, ""],
      [false, ""],
      [false, ""],
      [false, ""],
    ]);
    expect(v.rows[5]).toMatchObject({ playable: true, current: true });
  });
});

const render = (v: PlayerView) =>
  renderToStaticMarkup(
    createElement(PlayerBody, { view: v, uid: "pl", onEvent: () => {} }),
  );

describe("the player's body (ListenPlayer.dc.html)", () => {
  it("draws the position, the seek bar and the two transport rows", () => {
    const html = render(playerView(book("playing", 6, 750)));
    expect(html).toContain(
      '<p class="meta">The platform handbook · Chapter 6 of 14</p>',
    );
    expect(html).toContain(
      '<p class="position"><span class="position-at">12:30</span><span class="position-of">of 15:30</span></p>',
    );
    expect(html).toMatch(
      /<input class="seek" type="range" min="0" max="930" step="5" aria-label="Position" aria-valuetext="12:30 of 15:30" style="--at:80.6%" value="750"\/>/,
    );
    expect(html).toContain(
      '<button type="button" class="btn transport-play btn-primary"><span aria-hidden="true" class="ico ico-pause"></span>Pause</button>',
    );
    expect(html).toContain('aria-label="Previous chapter"');
    expect(html).toContain(
      '<button type="button" class="btn is-next" aria-label="Next chapter">Next<span aria-hidden="true" class="ico ico-next"></span></button>',
    );
    expect(html).toContain(
      '<ol class="chapters" aria-label="Chapters to listen to">',
    );
    expect(html).toContain(
      '<li class="chapter-row" aria-current="true"><span class="chapter-n">6</span><span class="chapter-name"><span class="chapter-open" lang="en">Capture: from a widget to a message</span></span><span class="status status-live chapter-state">Playing</span></li>',
    );
    expect(html).toContain(
      '<button type="button" class="link-strong chapter-open" lang="en">A request, end to end</button>',
    );
    expect(html).toContain(
      '<span class="dim chapter-state">Not prepared yet</span>',
    );
    expect(html).toContain(
      '<div class="choice speed" role="group" aria-labelledby="pl-speed">',
    );
    expect(html).toContain(
      '<button type="button" class="btn" aria-pressed="true">1×</button>',
    );
    expect(html).toContain(
      '<button type="button" class="btn" role="switch" aria-checked="true" aria-labelledby="pl-follow" data-swap="false"><span class="swap"><span>On</span><span>Off</span></span></button>',
    );
    expect(html).toContain(
      '<button type="button" class="btn">Stop listening</button>',
    );
    // The page under the sheet stays: no move in the sheet is a link.
    expect(html).not.toContain("<a ");
  });

  it("shows 0:00 alone with nothing made, the seek bar and ±15 disabled", () => {
    const html = render(playerView(book("fail-limit", 7, 0)));
    expect(html).toContain(
      '<p class="position"><span class="position-at">0:00</span></p>',
    );
    expect(html).toMatch(/<input class="seek"[^>]* disabled=""/);
    expect(html).toContain(
      '<button type="button" class="btn transport-skip" aria-label="Back 15 seconds" disabled="">−15</button>',
    );
    expect(html).toContain(
      '<button type="button" class="btn transport-skip" aria-label="Forward 15 seconds" disabled="">+15</button>',
    );
    expect(html).toContain(
      '<button type="button" class="btn transport-play" disabled=""><span aria-hidden="true" class="ico ico-play"></span>Play</button>',
    );
  });

  it("draws a document without Previous, Next or Chapters, Update audio holding Updating… in its width", () => {
    const html = render(
      playerView(doc("playing", { old: true, updating: true })),
    );
    expect(html).not.toContain("transport-ch");
    expect(html).not.toContain("chapters");
    expect(html).toContain('<p class="meta">Document in platform</p>');
    expect(html).toContain(
      '<button type="button" class="btn" data-busy="true"><span class="swap"><span>Update audio</span><span>Updating…</span></span></button>',
    );
  });

  it("says the first part so far, and the line with its words", () => {
    const html = render(
      playerView(
        doc("ready", { pos: 0, len: 215, soFar: true, parts: 4, partsMade: 1 }),
      ),
    );
    expect(html).toContain('<span class="position-of">of 3:35 so far</span>');
    expect(html).toContain('aria-valuetext="0:00 of 3:35 so far"');
    expect(html).toContain('role="progressbar" aria-label="Audio prepared"');
  });
});

// ---- the presses ---------------------------------------------------------------------------------------

function recorder() {
  const calls: unknown[][] = [];
  const rec =
    (name: string) =>
    (...a: unknown[]) => {
      calls.push([name, ...a]);
    };
  const engine: ListenEngine = {
    start: rec("start"),
    play: rec("play"),
    pause: rec("pause"),
    retry: rec("retry"),
    startOver: rec("startOver"),
    update: rec("update"),
    seek: rec("seek"),
    seekChapter: rec("seekChapter"),
    setSpeed: rec("setSpeed"),
    setFollow: rec("setFollow"),
    stop: rec("stop"),
    end: rec("end"),
  };
  setEngine(engine);
  return calls;
}

afterEach(() => {
  setEngine(null);
  setListen(null);
  setKept(null);
});

describe("the player's presses", () => {
  it("moves the Listen to the previous chapter, the next one and a picked row, at 0:00, and nothing else", () => {
    const calls = recorder();
    const l = book("playing", 6, 750);
    let away = 0;
    const signIn = () => {
      away += 1;
    };
    pressPlayer(l, { t: "step", dir: -1 }, signIn);
    pressPlayer(l, { t: "step", dir: 1 }, signIn);
    pressPlayer(l, { t: "pick", id: "c3" }, signIn);
    expect(calls).toEqual([
      ["seekChapter", "c5"],
      ["seekChapter", "c7"],
      ["seekChapter", "c3"],
    ]);
    expect(away).toBe(0);
  });

  it("answers the transport, the seek bar, speed and follow along on the Listen's own axis", () => {
    const calls = recorder();
    const l = book("playing", 6, 750);
    const start6 = LENS.slice(0, 5).reduce((a, b) => a + b, 0);
    const p = (e: Parameters<typeof pressPlayer>[1]) =>
      pressPlayer(l, e, () => {});
    p({ t: "play", lead: "pause" });
    p({ t: "play", lead: "play" });
    p({ t: "play", lead: "startover" });
    p({ t: "play", lead: "retry" });
    p({ t: "play", lead: "play-off" });
    p({ t: "skip", by: -15 });
    p({ t: "skip", by: 15 });
    p({ t: "seek", at: 900 });
    p({ t: "speed", v: 1.25 });
    p({ t: "follow", on: false });
    p({ t: "action", what: "update" });
    expect(calls).toEqual([
      ["pause"],
      ["play"],
      ["startOver"],
      ["retry"],
      ["seek", start6 + 735],
      ["seek", start6 + 765],
      ["seek", start6 + 900],
      ["setSpeed", 1.25],
      ["setFollow", false],
      ["update"],
    ]);
    // +15 near a chapter's end stops at its end (the board's skip clamps to the length).
    calls.length = 0;
    pressPlayer(book("playing", 6, 925), { t: "skip", by: 15 }, () => {});
    expect(calls).toEqual([["seek", start6 + 930]]);
  });

  it("sends Sign in to the sign-in page", () => {
    recorder();
    let away = 0;
    pressPlayer(doc("fail-session"), { t: "action", what: "signin" }, () => {
      away += 1;
    });
    expect(away).toBe(1);
  });

  it("Stop listening ends the Listen and keeps its place", () => {
    const calls = recorder();
    const l = book("paused", 6, 750);
    setListen(l);
    pressPlayer(l, { t: "stop" }, () => {});
    expect(calls).toEqual([["stop"]]);
    expect(getKept()).toEqual({
      unit: "june/platform/books/platform-handbook",
      ch: "c6",
      n: 6,
      pos: 750,
      len: 930,
      lang: "en",
    });
  });
});

describe("Go to the text", () => {
  it("opens the Listen's chapter, where the reader scrolls once to the followed block", () => {
    const pushed: string[] = [];
    let here = 0;
    const l = book("playing", 6, 750);
    goToText(l, "/@june/platform/books/platform-handbook/c2", {
      push: (h) => pushed.push(h),
      here: () => (here += 1),
    });
    expect(pushed).toEqual(["/@june/platform/books/platform-handbook/c6"]);
    expect(here).toBe(0);
    expect(takeScroll(l.unit, "c3")).toBe(false);
    expect(takeScroll(l.unit, "c6")).toBe(true);
    // Once.
    expect(takeScroll(l.unit, "c6")).toBe(false);
  });

  it("on the Listen's own page, asks the page itself and moves nowhere", () => {
    const pushed: string[] = [];
    let here = 0;
    const l = doc("playing");
    goToText(l, "/@june/platform/2026-10-30-sign-in-across-the-apps", {
      push: (h) => pushed.push(h),
      here: () => (here += 1),
    });
    expect(pushed).toEqual([]);
    expect(here).toBe(1);
    expect(takeScroll(l.unit, null)).toBe(true);
    expect(takeScroll(l.unit, null)).toBe(false);
  });
});
