import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dock, ListenPill, trackOf, type HeadControl } from "@/hi2vi/listen";
import type { ListenKey } from "@/lib/listen/machine";
import type { Listen, ListenBookKey } from "@/lib/listen/types";
import { dockView } from "@/lib/listen/view";

// The dock (job 07, round 01: frame.md F203, F204, F208, F232, F233, F234; `ListenDock.dc.html`,
// `ListenDockStates.dc.html`'s `LX.dock` and `LEAD`, `pages/frame/fixture.js` `LR.dock`). The words are the
// board's, word for word; the figures are Listen.dc.html's (the platform handbook: 14 chapters, chapter 6
// "Capture: from a widget to a message" at 12:30 of 15:30, chapter 7 preparing; a document at 6:05 of 10:20).

const TITLES = [
  "Why the platform is one product",
  "Projects, orgs and who can read what",
  "How a document is stored",
  "Search: from a query to a passage",
  "Sessions and sign-in",
  "Capture: from a widget to a message",
  "Deduplication and the owner’s alert",
  "Publishing a public project",
  "The reader and its memory",
  "Listen: how a text becomes audio",
  "Review: the cards and their schedule",
  "프로젝트와 조직: 누가 무엇을 읽는가",
  "The plugin and the self-host scaffold",
  "What the code cannot say",
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
const BOOK_KEY: ListenBookKey = {
  org: "june",
  project: "platform",
  book: "platform-handbook",
  from_chapter: "c6",
};
const LENS = [
  430, 520, 725, 410, 515, 930, 415, 425, 820, 530, 420, 405, 440, 215,
];
const entries = (made: number) =>
  BOOK.chapters.map((c, i) => ({
    chapter: c.key,
    state: (i < made ? "made" : i === made ? "making" : "none") as
      "made" | "making" | "none",
    len: i < made ? LENS[i] : null,
    part: i === made ? { n: 2, of: 9 } : null,
    left: i === made ? 290 : null,
  }));

const at0852 = () => {
  const d = new Date();
  d.setHours(8, 52, 0, 0);
  return d.toISOString();
};

/** A document Listen: "The capture queue, end to end", 6:05 of 10:20. */
export function doc(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return {
    unit: "june/platform/2026-10-30-the-capture-queue-end-to-end",
    key: {
      org: "june",
      project: "platform",
      doc: "2026-10-30-the-capture-queue-end-to-end",
    },
    kind: "doc",
    title: "The capture queue, end to end",
    titleLang: "en",
    lang: "en",
    href: "/@june/platform/2026-10-30-the-capture-queue-end-to-end",
    book: null,
    from: null,
    ch: null,
    chPos: 0,
    chLen: null,
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
    pos: 365,
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

/** The handbook's Listen from chapter 6, at 12:30 of chapter 6's 15:30; chapters 1 to 6 made, 7 preparing. */
export function book(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return doc(state, {
    unit: "june/platform/books/platform-handbook",
    key: BOOK_KEY,
    kind: "book",
    title: TITLES[5],
    book: BOOK,
    from: "c6",
    ch: "c6",
    chPos: 750,
    chLen: 930,
    making: "c7",
    entries: entries(6),
    len: 3520,
    pos: 3000,
    parts: 9,
    partsMade: 1,
    left: 290,
    ...more,
  });
}

type Act = "pause" | "play" | "play-off" | "startover" | "retry" | "signin";
type Shape = "live" | "on" | "wait" | "done" | "fail";

// Every dock state (ListenDockStates' groups): the lead (F208, F234's leads F208 leaves open), the word and its
// rest (LR.dock, F232, F233) and the word's shape (LR.dock's trio).
const CASES: [string, Listen, Act, string, string, Shape][] = [
  ["playing", book("playing"), "pause", "Playing", "Chapter 6 · 12:30", "live"],
  ["paused", book("paused"), "play", "Paused", "Chapter 6 · 12:30", "on"],
  [
    "loading",
    book("loading", { chPos: 0 }),
    "pause",
    "Loading…",
    "Chapter 6",
    "wait",
  ],
  [
    "buffering",
    book("buffering"),
    "pause",
    "Buffering…",
    "Chapter 6 · 12:30",
    "wait",
  ],
  [
    "next-waiting",
    book("next-waiting", { chPos: 930 }),
    "pause",
    "Preparing…",
    "Chapter 7",
    "wait",
  ],
  [
    "waiting",
    doc("waiting", { seen: at0852(), len: null, pos: 0, partsMade: 0 }),
    "play-off",
    "Waiting for the Mac",
    "last seen 08:52",
    "wait",
  ],
  [
    "making (the first part)",
    doc("making", {
      part: { n: 1, of: 4 },
      len: null,
      pos: 0,
      partsMade: 0,
    }),
    "play-off",
    "Preparing…",
    "part 1 of 4",
    "wait",
  ],
  [
    "making (a chapter)",
    book("making", { ch: "c7", chPos: 0, chLen: null, part: { n: 2, of: 9 } }),
    "play-off",
    "Preparing…",
    "part 2 of 9",
    "wait",
  ],
  [
    "ready",
    doc("ready", { len: 215, pos: 0, soFar: true, partsMade: 1 }),
    "play",
    "Ready to play",
    "the rest is preparing",
    "on",
  ],
  ["tap", doc("tap", { pos: 0 }), "play", "Ready to play", "", "on"],
  [
    "finished (a book)",
    book("finished", { ch: "c14", chPos: 215, chLen: 215 }),
    "startover",
    "Finished",
    "all 14 chapters",
    "done",
  ],
  [
    "finished (a document)",
    doc("finished", { pos: 620 }),
    "startover",
    "Finished",
    "",
    "done",
  ],
  [
    "the earlier version",
    doc("playing", { old: true }),
    "pause",
    "Earlier version",
    "6:05 of 10:20",
    "on",
  ],
  [
    "fail-voice",
    book("fail-voice", { ch: "c7", chPos: 0, part: { n: 3, of: 9 } }),
    "retry",
    "Preparing stopped",
    "try again",
    "fail",
  ],
  [
    "fail-limit",
    book("fail-limit", { ch: "c7", chPos: 0, chLen: null }),
    "play-off",
    "Daily limit",
    "resumes 09:00 tomorrow",
    "fail",
  ],
  [
    "fail-play",
    book("fail-play", { stoppedAt: 750 }),
    "retry",
    "Playback stopped",
    "connection lost",
    "fail",
  ],
  ["fail-session", book("fail-session"), "signin", "Signed out", "", "fail"],
  [
    "fail-unreadable",
    doc("fail-unreadable", { len: null, pos: 0 }),
    "retry",
    "Can’t be read aloud",
    "",
    "fail",
  ],
  [
    "offline-start",
    doc("offline-start", { pos: 0 }),
    "play-off",
    "Offline",
    "starts when you’re back online",
    "fail",
  ],
  [
    "offline-play",
    doc("offline-play", { loaded: 255 }),
    "pause",
    "Offline",
    "under 5 min loaded",
    "live",
  ],
  [
    "offline-stopped",
    doc("offline-stopped", { stoppedAt: 365 }),
    "play",
    "Offline",
    "stopped at 6:05",
    "fail",
  ],
];

describe("the dock's lead, word, rest and shape by state (F208, F232, F233, F234)", () => {
  it.each(CASES)("%s", (_name, l, act, word, rest, shape) => {
    const v = dockView(l);
    expect({ act: v.act, word: v.word, rest: v.rest, shape: v.shape }).toEqual({
      act,
      word,
      rest,
      shape,
    });
  });

  it("names every lead in the board's table, and only those", () => {
    const acts = new Set(CASES.map((c) => dockView(c[1]).act));
    expect([...acts].sort()).toEqual(
      ["pause", "play", "play-off", "retry", "signin", "startover"].sort(),
    );
  });
});

describe("the live region's sentences (F208: the state and the chapter, never the position)", () => {
  it("says the chapter and its title while a book plays or is paused", () => {
    expect(dockView(book("playing")).say).toBe(
      "Playing: chapter 6, Capture: from a widget to a message",
    );
    expect(dockView(book("paused")).say).toBe(
      "Paused: chapter 6, Capture: from a widget to a message",
    );
  });

  it("says the chapter waited for, the daily limit and a sign-out in sentences", () => {
    expect(dockView(book("next-waiting", { chPos: 930 })).say).toBe(
      "Chapter 7 is still preparing; it plays when it’s ready.",
    );
    expect(dockView(book("fail-limit", { ch: "c7", chPos: 0 })).say).toBe(
      "Daily limit reached; preparing resumes at 09:00 tomorrow.",
    );
    expect(dockView(book("fail-session")).say).toBe(
      "Signed out. Sign in to keep listening.",
    );
  });

  it("says the word alone otherwise, and never the position", () => {
    expect(dockView(doc("playing")).say).toBe("Playing");
    expect(dockView(book("buffering")).say).toBe("Buffering…");
    expect(dockView(doc("fail-unreadable", { len: null })).say).toBe(
      "Can’t be read aloud",
    );
    const a = dockView(book("playing", { chPos: 10 })).say;
    const b = dockView(book("playing", { chPos: 700 })).say;
    expect(a).toBe(b);
  });
});

describe("the line of where the audio is (F208: always drawn, 0% with nothing made)", () => {
  it("draws the chapter's place on a book and the document's on a document", () => {
    expect(dockView(book("playing")).pct).toBe(81);
    expect(dockView(doc("paused")).pct).toBe(59);
  });

  it("draws 0% while nothing is made, whatever the position says", () => {
    for (const l of [
      doc("waiting", { len: null, pos: 0 }),
      doc("making", { len: 215, pos: 90, part: { n: 2, of: 4 } }),
      book("fail-voice", { chPos: 400 }),
      book("fail-limit", { chPos: 400 }),
      doc("fail-unreadable", { len: null, pos: 0 }),
    ]) {
      expect(dockView(l).pct).toBe(0);
    }
  });

  it("draws 0% before a length is known, never NaN", () => {
    expect(dockView(doc("loading", { len: null, pos: 0 })).pct).toBe(0);
    expect(dockView(book("loading", { chLen: null, chPos: 0 })).pct).toBe(0);
  });
});

// ── the rendered dock and pill (ListenDock.dc.html, Listen.dc.html), proved through server renders ──────────

const dock = (l: Listen) =>
  renderToStaticMarkup(createElement(Dock, { listen: l }));
const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");
/** The rendered lead button: its opening tag and what it holds. */
const leadOf = (html: string) => {
  const m =
    /<button type="button" class="btn dock-lead[^"]*"[^>]*>[\s\S]*?<\/button>/.exec(
      html,
    );
  return m ? m[0] : "";
};

describe("the rendered lead (F208, C03): one width in every state, its mark or word centred", () => {
  const LEADS: [string, Listen, RegExp][] = [
    [
      "Pause",
      book("playing"),
      /class="btn dock-lead btn-primary" aria-label="Pause">.*ico-pause/,
    ],
    [
      "Play",
      book("paused"),
      /class="btn dock-lead btn-primary" aria-label="Play">.*ico-play/,
    ],
    [
      "Start over",
      doc("finished"),
      /class="btn dock-lead" aria-label="Start over">.*ico-again/,
    ],
    [
      "a disabled Play",
      book("fail-limit"),
      /class="btn dock-lead" aria-label="Play" disabled="">.*ico-play/,
    ],
    [
      "Try again",
      book("fail-play"),
      /class="btn dock-lead">.*<span>Try again<\/span><\/span><\/button>$/,
    ],
    [
      "Sign in",
      book("fail-session"),
      /class="btn dock-lead">.*<span>Sign in<\/span><\/span><\/button>$/,
    ],
  ];
  it.each(LEADS)("%s", (_n, l, re) => {
    const lead = leadOf(dock(l));
    expect(lead).toMatch(re);
    // C03: both widest words, hidden, in the lead's one cell, whatever it shows.
    expect(lead).toContain(
      '<span class="lead-hold"><span class="lead-size" aria-hidden="true">Try again</span><span class="lead-size" aria-hidden="true">Sign in</span>',
    );
  });

  it("opens the player from the rest of the capsule, with the title and the state line", () => {
    const html = dock(book("playing"));
    expect(html).toContain(
      '<button type="button" class="dock-open" aria-label="Open the player" aria-haspopup="dialog"><span class="dock-text"><span class="dock-title" lang="en">Capture: from a widget to a message</span><span class="say"><span class="status status-live">Playing</span><span class="say-rest">Chapter 6 · 12:30</span></span></span><span aria-hidden="true" class="ico ico-up"></span></button>',
    );
    expect(html).toMatch(
      /^<section class="dock" aria-label="Listen" data-state="playing">/,
    );
  });
});

describe("Preparing… and Chapter n while the next chapter waits (F232)", () => {
  it("says the word in its turning ring and the chapter waited for as its rest", () => {
    expect(dock(book("next-waiting", { chPos: 930 }))).toContain(
      '<span class="say"><span class="status status-busy">Preparing…</span><span class="say-rest">Chapter 7</span></span>',
    );
  });
});

describe("the live region (F208)", () => {
  it("is polite and says the state and the chapter", () => {
    expect(dock(book("playing"))).toContain(
      '<p class="sr-only" role="status" aria-live="polite">Playing: chapter 6, Capture: from a widget to a message</p>',
    );
    expect(dock(book("fail-limit", { ch: "c7", chPos: 0 }))).toContain(
      'aria-live="polite">Daily limit reached; preparing resumes at 09:00 tomorrow.</p>',
    );
  });
});

describe("the line (F208): always drawn, 0% with nothing made", () => {
  it("draws the bare line at 0% while preparing, and at the place while playing", () => {
    const bare = (pct: number) =>
      `<span class="meter" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
    expect(
      dock(doc("making", { part: { n: 1, of: 4 }, len: null, pos: 0 })),
    ).toContain(bare(0));
    expect(dock(doc("fail-unreadable", { len: null, pos: 0 }))).toContain(
      bare(0),
    );
    expect(dock(book("playing"))).toContain(bare(81));
  });
});

describe("no line opens with a middle dot (C04)", () => {
  const css = read("src/hi2vi/styles/listen/listen.css");
  it("writes no dot in the rest or the pill's figure: the dot is their ::before", () => {
    for (const [, l] of CASES) {
      const rest = /<span class="say-rest">([^<]*)<\/span>/.exec(dock(l));
      if (rest) expect(rest[1]).not.toMatch(/^\s*·/);
    }
    const pill = renderToStaticMarkup(
      createElement(ListenPill, {
        control: {
          form: "resume",
          q: "12:30",
          at: "12:30 of 15:30",
          pillQ: "12:30",
          from: 750,
        },
      }),
    );
    expect(pill).toContain('<span class="listen-q">12:30</span>');
    expect(pill).not.toContain("·");
  });

  it("draws the dot outside the line's start, in a clipped edge", () => {
    expect(css).toContain(
      ".dock .say { column-gap: var(--space-4); overflow: hidden; }",
    );
    expect(css).toContain(
      '.dock .say-rest::before { content: "\\00B7"; position: absolute; right: 100%; width: var(--space-4); text-align: center; }',
    );
    expect(css).toContain(
      '.listen-pill .listen-q::before { content: "\\00B7"; position: absolute; right: 100%; width: var(--space-4); text-align: center; }',
    );
  });
});

describe("the pill (F207, listen:FG3)", () => {
  const ctl = (c: Partial<HeadControl>): HeadControl => ({
    form: "listen",
    q: "",
    at: "",
    pillQ: "",
    from: 0,
    ...c,
  });
  it("is the Library's pill as one button: the play mark, the control's label, its figure", () => {
    expect(
      renderToStaticMarkup(
        createElement(ListenPill, {
          control: ctl({ pillQ: "Chapters 6–14 · about 1 h 30 min" }),
        }),
      ),
    ).toBe(
      '<button type="button" class="pill listen-pill"><span aria-hidden="true" class="ico ico-play"></span><span>Listen</span><span class="listen-q">Chapters 6–14 · about 1 h 30 min</span></button>',
    );
    expect(
      renderToStaticMarkup(
        createElement(ListenPill, {
          control: ctl({ form: "resume", pillQ: "6:05" }),
        }),
      ),
    ).toContain(
      '<span>Continue listening</span><span class="listen-q">6:05</span>',
    );
    expect(
      renderToStaticMarkup(createElement(ListenPill, { control: ctl({}) })),
    ).not.toContain("listen-q");
  });
});

describe("the track (F208, listen:FG1)", () => {
  it("holds the dock while a Listen is under way, the pill only with none, else nothing", () => {
    const base = {
      listen: null,
      shown: true,
      pill: true,
      chapter: true,
      hidden: false,
    };
    expect(trackOf({ ...base, listen: book("playing") }).show).toBe("dock");
    expect(
      trackOf({ ...base, listen: book("playing"), shown: false }).show,
    ).toBe("dock");
    expect(trackOf(base).show).toBe("pill");
    expect(trackOf({ ...base, pill: false }).show).toBe(null);
    expect(trackOf({ ...base, shown: false }).show).toBe(null);
  });

  it("stands one foot bar up on a chapter while the bars show, and 16 px from the foot otherwise", () => {
    const base = { listen: book("playing"), shown: true, pill: false };
    expect(trackOf({ ...base, chapter: true, hidden: false }).overFoot).toBe(
      true,
    );
    expect(trackOf({ ...base, chapter: true, hidden: true }).overFoot).toBe(
      false,
    );
    expect(trackOf({ ...base, chapter: false, hidden: false }).overFoot).toBe(
      false,
    );
    const css = read("src/hi2vi/styles/listen/listen.css");
    expect(css).toContain(
      ".dock-track { position: sticky; bottom: var(--space-4);",
    );
    expect(css).toContain(
      ".reader .dock-track.over-foot { bottom: calc(var(--top-h) + 1px + var(--space-2)); }",
    );
  });

  it("is mounted by the chapter reader before ReaderFoot, in place of the old slot and the body's old root", () => {
    const cr = read("src/hi2vi/reader/chapter-reader.tsx");
    expect(cr).not.toMatch(
      /components\/listen\/listen-page|ListenSlot|ListenPageContext/,
    );
    expect(cr.indexOf("<ListenTrack")).toBeGreaterThan(
      cr.indexOf('className="reader-frame"'),
    );
    expect(cr.indexOf("<ListenTrack")).toBeLessThan(cr.indexOf("<ReaderFoot"));
    // the body's old root renders nothing after the body (its old Listen slot left with the old Listen)
    const root = read("src/hi2vi/reader/old-root.tsx");
    expect(root).not.toMatch(/value\?\.after|\bslot\b\s*[?=:]/);
  });
});
