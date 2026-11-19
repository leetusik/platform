import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AudioHead, followsIn, headOf, listenShown } from "@/hi2vi/listen";
import type { KbListenState } from "@/lib/knowledge/listen";
import { noteKey, type ListenKey, type NoteKey } from "@/lib/listen/machine";
import { chapterSeed } from "@/lib/listen/seed";
import type {
  Listen,
  ListenBookKey,
  ListenKept,
  ListenSeed,
} from "@/lib/listen/types";
import { noteView } from "@/lib/listen/view";
import type { ReaderView } from "@/lib/reader/types";

// Listen in a chapter's head (job 07, round 01: frame.md F204, F206, F207, F210, F233; `AudioHead.dc.html`,
// `pages/frame/fixture.js` `LR.note` and `LR.control`, `Listen.dc.html`'s `noteFigs`, `holds` and `FOLLOWS`).
// The words are the board's, word for word; the figures are Listen.dc.html's (the platform handbook: 14
// chapters, chapter 7 preparing with 4:50 left; a first-time document of 4 parts).

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

/** A document Listen: "How a phase becomes slices", made for the first time, 4 parts of 3:35. */
function doc(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return {
    unit: "june/platform/2026-11-02-how-a-phase-becomes-slices",
    key: {
      org: "june",
      project: "platform",
      doc: "2026-11-02-how-a-phase-becomes-slices",
    },
    kind: "doc",
    title: "How a phase becomes slices",
    titleLang: "en",
    lang: "en",
    href: "/@june/platform/2026-11-02-how-a-phase-becomes-slices",
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

/** The handbook's Listen from chapter 6, chapters 1 to 6 made, chapter 7 preparing. */
function book(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return doc(state, {
    unit: "june/platform/books/platform-handbook",
    key: BOOK_KEY,
    kind: "book",
    title: TITLES[5],
    book: BOOK,
    from: "c6",
    ch: "c6",
    chPos: 750,
    making: "c7",
    entries: entries(6),
    len: 3520,
    pos: 750,
    parts: 9,
    partsMade: 1,
    left: 290,
    ...more,
  });
}

interface Board {
  word: string;
  shape: "live" | "on" | "wait" | "done" | "fail";
  text: string;
  line: number | null;
  lineLabel?: string;
  ref?: string;
}

// F204's 21 keys: the board's word, shape, sentence, line and reference for each (LR.note, word for word).
const CASES: [string, Listen, NoteKey, Board][] = [
  [
    "waiting",
    doc("waiting", { seen: at0852(), len: null, partsMade: 0 }),
    "waiting",
    {
      word: "Waiting",
      shape: "wait",
      text: "Waiting for the Mac, last seen 08:52. Preparing starts by itself when it’s on.",
      line: null,
    },
  ],
  [
    "making-first",
    doc("making", { part: { n: 1, of: 4 }, partsMade: 0, len: null }),
    "making",
    {
      word: "Preparing…",
      shape: "wait",
      text: "Part 1 of 4. You can play once this part is ready.",
      line: 0,
      lineLabel: "Audio prepared",
    },
  ],
  [
    "making-part",
    doc("making", {
      part: { n: 2, of: 9 },
      parts: 9,
      partsMade: 1,
      left: 290,
      len: null,
    }),
    "making",
    {
      word: "Preparing…",
      shape: "wait",
      text: "Part 2 of 9 · under 5 min left.",
      line: 11,
      lineLabel: "Audio prepared",
    },
  ],
  [
    "making-book",
    book("making"),
    "making",
    {
      word: "Preparing…",
      shape: "wait",
      text: "Chapter 7 of 14 · under 5 min left.",
      line: 43,
      lineLabel: "Chapters prepared",
    },
  ],
  [
    "ready",
    doc("ready", { len: 215, partsMade: 1, soFar: true }),
    "ready",
    {
      word: "Ready",
      shape: "on",
      text: "The first 4 min are ready to play; the rest is still preparing.",
      line: 25,
      lineLabel: "Audio prepared",
    },
  ],
  [
    "tap",
    doc("tap"),
    "tap",
    {
      word: "Ready",
      shape: "on",
      text: "It’s ready. Your phone needs one more tap to start playing.",
      line: null,
    },
  ],
  [
    "loading",
    doc("loading"),
    "loading",
    { word: "Loading…", shape: "wait", text: "", line: null },
  ],
  [
    "buffering",
    doc("buffering"),
    "buffering",
    { word: "Buffering…", shape: "wait", text: "", line: null },
  ],
  [
    "playing",
    book("playing"),
    "playing",
    { word: "Playing", shape: "live", text: "", line: null },
  ],
  [
    "paused",
    doc("paused"),
    "paused",
    { word: "Paused", shape: "on", text: "", line: null },
  ],
  [
    "next-waiting",
    book("next-waiting"),
    "next-waiting",
    {
      word: "Playing",
      shape: "live",
      text: "Chapter 7 is still preparing, under 5 min. It plays by itself when it’s ready.",
      line: 43,
      lineLabel: "Chapters prepared",
    },
  ],
  [
    "finished",
    doc("finished"),
    "finished",
    {
      word: "Finished",
      shape: "done",
      text: "You’ve listened to the end.",
      line: null,
    },
  ],
  [
    "fail-voice",
    book("fail-voice", { part: { n: 3, of: 9 } }),
    "fail-voice",
    {
      word: "Stopped",
      shape: "fail",
      text: "Something on our side stopped preparing this audio at part 3 of 9.",
      line: null,
      ref: "Error · 502",
    },
  ],
  [
    "fail-limit",
    doc("fail-limit", { len: null }),
    "fail-limit",
    {
      word: "Daily limit",
      shape: "fail",
      text: "The free voice’s daily limit is reached. Preparing goes on by itself at 09:00 tomorrow.",
      line: null,
    },
  ],
  [
    "fail-play",
    book("fail-play", { stoppedAt: 750 }),
    "fail-play",
    {
      word: "Stopped",
      shape: "fail",
      text: "The connection dropped, so playback stopped at 12:30.",
      line: null,
    },
  ],
  [
    "fail-session",
    doc("fail-session"),
    "fail-session",
    {
      word: "Signed out",
      shape: "fail",
      text: "Your session has expired. Sign in again to keep listening.",
      line: null,
    },
  ],
  [
    "fail-unreadable",
    doc("fail-unreadable", { len: null }),
    "fail-unreadable",
    {
      word: "Can’t be read aloud",
      shape: "fail",
      text: "Something on our side couldn’t read this document aloud.",
      line: null,
      ref: "Error · 422",
    },
  ],
  [
    "offline-start",
    doc("offline-start"),
    "offline-start",
    {
      word: "Offline",
      shape: "fail",
      text: "You’re offline. Listen can start once you’re back online.",
      line: null,
    },
  ],
  [
    "offline-play",
    doc("offline-play", { loaded: 160 }),
    "offline-play",
    {
      word: "Offline",
      shape: "live",
      text: "You’re offline. Playing what’s loaded: under 5 min left.",
      line: null,
    },
  ],
  [
    "offline-stopped",
    doc("offline-stopped", { stoppedAt: 365 }),
    "offline-stopped",
    {
      word: "Offline",
      shape: "fail",
      text: "You’re offline, so playback stopped at 6:05. Play again once you’re back online.",
      line: null,
    },
  ],
  [
    "outdated",
    doc("paused", { old: true }),
    noteKey("paused", true),
    {
      word: "Earlier version",
      shape: "on",
      text: "The text changed after this audio was made. Until you update it, you hear the earlier version.",
      line: null,
    },
  ],
];

describe("the head's note: the board's words and shapes for each of F204's 21 keys", () => {
  it("covers every key once", () => {
    expect(CASES.map((c) => c[0])).toEqual([
      "waiting",
      "making-first",
      "making-part",
      "making-book",
      "ready",
      "tap",
      "loading",
      "buffering",
      "playing",
      "paused",
      "next-waiting",
      "finished",
      "fail-voice",
      "fail-limit",
      "fail-play",
      "fail-session",
      "fail-unreadable",
      "offline-start",
      "offline-play",
      "offline-stopped",
      "outdated",
    ]);
  });

  for (const [name, l, key, b] of CASES) {
    it(name, () => {
      const v = noteView(l, key, key === "fail-limit" ? { ready: null } : {});
      expect({
        word: v.word,
        shape: v.shape,
        text: v.text,
        line: v.line,
        ref: v.ref,
      }).toEqual({
        word: b.word,
        shape: b.shape,
        text: b.text,
        line: b.line,
        ref: b.ref ?? "",
      });
      if (b.lineLabel) expect(v.lineLabel).toBe(b.lineLabel);
    });
  }

  it("a finished book counts its own chapters", () => {
    expect(noteView(book("finished"), "finished").text).toBe(
      "You’ve listened to all 14 chapters.",
    );
  });
});

describe("time left under five minutes (F233)", () => {
  it("reads `under 5 min` below five minutes, `about 5 min` from them", () => {
    expect(
      noteView(doc("offline-play", { loaded: 299 }), "offline-play").text,
    ).toBe("You’re offline. Playing what’s loaded: under 5 min left.");
    expect(
      noteView(doc("offline-play", { loaded: 300 }), "offline-play").text,
    ).toBe("You’re offline. Playing what’s loaded: about 5 min left.");
    const nx = book("next-waiting", {
      entries: entries(6).map((e) =>
        e.chapter === "c7" ? { ...e, left: 300 } : e,
      ),
    });
    expect(noteView(nx, "next-waiting").text).toBe(
      "Chapter 7 is still preparing, about 5 min. It plays by itself when it’s ready.",
    );
  });
});

/** A chapter page's seed (chapter 6 of the handbook), its state as the server reads it. */
function seedOf(over: Partial<ListenSeed> = {}): ListenSeed {
  return {
    key: BOOK_KEY,
    title: TITLES[5],
    lang: "en",
    state: {
      entries: entries(6)
        .slice(5)
        .map((e) => ({
          ...e,
          title: null,
          doc: null,
          lang: "en",
          current_version: 3,
          old: false,
          updating: false,
          unit: null,
          update: null,
        })),
      resume: null,
      position: null,
      listen: { lang: "en" },
    } as unknown as KbListenState,
    href: BOOK.chapters[5].href,
    book: BOOK,
    chapter: "c6",
    ...over,
  };
}

const docSeedOf = (): ListenSeed => ({
  key: {
    org: "june",
    project: "platform",
    doc: "2026-11-02-capture-dedupe",
  },
  title: "How capture deduplicates feedback",
  lang: "en",
  state: {
    state: "made",
    len: 620,
    entries: [],
    position: null,
    resume: null,
    listen: { lang: "en" },
  } as unknown as KbListenState,
  href: "/@june/platform/2026-11-02-capture-dedupe",
  book: null,
  chapter: null,
});

describe("who gets Listen (F206: false for a visitor and an older version)", () => {
  it("shows the slot only to a member on the newest version, with a seed", () => {
    const seed = seedOf();
    expect(listenShown({ member: true, version: 3, newest: 3, seed })).toBe(
      true,
    );
    expect(listenShown({ member: false, version: 3, newest: 3, seed })).toBe(
      false,
    );
    expect(listenShown({ member: true, version: 2, newest: 3, seed })).toBe(
      false,
    );
    expect(
      listenShown({ member: true, version: 3, newest: 3, seed: null }),
    ).toBe(false);
  });

  it("gives a visitor (no state read) and an older version no seed", () => {
    const view = {
      title: TITLES[5],
      lang: "en",
      version: 3,
      newest: 3,
      book: { title: BOOK.title, backHref: BOOK.href, chapters: BOOK.chapters },
    } as unknown as ReaderView;
    const state = seedOf().state;
    expect(chapterSeed(view, state, BOOK_KEY)).not.toBeNull();
    expect(chapterSeed(view, null, BOOK_KEY)).toBeNull();
    expect(chapterSeed({ ...view, version: 2 }, state, BOOK_KEY)).toBeNull();
  });
});

describe("the head's forms (F206, F207)", () => {
  it("offers Listen with the chapters' scope, and no length while one is not made", () => {
    const h = headOf({
      listen: null,
      seed: seedOf(),
      kept: null,
      starting: false,
    });
    expect(h.show).toBe("control");
    expect(h.control).toMatchObject({ form: "listen", q: "Chapters 6–14" });
    expect(h.hold).toEqual([]);
  });

  it("offers a made document's length, and a text with nothing made shows no length", () => {
    expect(
      headOf({ listen: null, seed: docSeedOf(), kept: null, starting: false })
        .control.q,
    ).toBe("10 min");
    const none = docSeedOf();
    none.state = { ...none.state!, state: "none", len: null };
    expect(
      headOf({ listen: null, seed: none, kept: null, starting: false }).control
        .q,
    ).toBe("");
  });

  it("offers Continue listening at the kept place, with Start over", () => {
    const kept: ListenKept = {
      unit: "june/platform/books/platform-handbook",
      ch: "c6",
      n: 6,
      pos: 750,
      len: 930,
      lang: "en",
    };
    const h = headOf({ listen: null, seed: seedOf(), kept, starting: false });
    expect(h.control).toMatchObject({
      form: "resume",
      at: "12:30 of 15:30",
      from: 750,
    });
  });

  it("is busy from the press, with no length, and takes its held height at once", () => {
    const h = headOf({
      listen: null,
      seed: seedOf(),
      kept: null,
      starting: true,
    });
    expect(h.show).toBe("busy");
    expect(h.hold.map((n) => n.key)).toEqual([
      "fail-voice",
      "fail-limit",
      "next-waiting",
    ]);
    const html = renderToStaticMarkup(createElement(AudioHead, { head: h }));
    expect(html).toContain('data-busy="true"');
    expect(html).toContain(
      '<span class="swap"><span>Listen</span><span>Starting…</span></span>',
    );
    expect(html).toContain('<span class="listen-q"></span>');
  });

  it("shows this chapter's Listen as its note, and the control on another chapter, held either way", () => {
    const l = book("playing");
    const here = headOf({
      listen: l,
      seed: seedOf(),
      kept: null,
      starting: false,
    });
    expect(here.show).toBe("note");
    expect(here.note?.view.word).toBe("Playing");
    const there = headOf({
      listen: book("playing", { ch: "c8" }),
      seed: seedOf(),
      kept: null,
      starting: false,
    });
    expect(there.show).toBe("control");
    expect(there.hold).toHaveLength(3);
  });

  it("holds the chapter's three tallest notes, and a document's own three", () => {
    const ch = headOf({
      listen: book("playing"),
      seed: seedOf(),
      kept: null,
      starting: false,
    });
    expect(ch.hold.map((n) => [n.key, n.view.word])).toEqual([
      ["fail-voice", "Stopped"],
      ["fail-limit", "Daily limit"],
      ["next-waiting", "Playing"],
    ]);
    const d = doc("playing", {
      unit: "june/platform/2026-11-02-capture-dedupe",
    });
    const dh = headOf({
      listen: d,
      seed: docSeedOf(),
      kept: null,
      starting: false,
    });
    expect(dh.hold.map((n) => n.key)).toEqual([
      "fail-voice",
      "fail-limit",
      "offline-stopped",
    ]);
    // the daily limit is held without the ready part's sentence and its Play (Listen.dc.html's `holds`)
    expect(dh.hold[1].view.action).toBe("");
  });

  it("renders the note as drawn: the word in its shape, the sentence, the line, the reference", () => {
    const h = headOf({
      listen: book("making"),
      seed: seedOf(),
      kept: null,
      starting: false,
    });
    const html = renderToStaticMarkup(createElement(AudioHead, { head: h }));
    expect(html).toContain(
      '<div class="note" data-state="making"><p class="say"><span class="status status-busy">Preparing…</span></p><p class="note-text">Chapter 7 of 14 · under 5 min left.</p><div class="meter-row" role="progressbar" aria-label="Chapters prepared" aria-valuemin="0" aria-valuemax="100" aria-valuenow="43">',
    );
    // the three held copies: hidden, inert, no live progressbar
    expect(
      html.match(/class="note is-held" aria-hidden="true" inert=""/g),
    ).toHaveLength(3);
  });

  it("shows the note's own button only for Update audio and Play on the daily limit", () => {
    const up = headOf({
      listen: doc("playing", {
        old: true,
        updating: true,
        unit: "june/platform/2026-11-02-capture-dedupe",
      }),
      seed: docSeedOf(),
      kept: null,
      starting: false,
    });
    expect(up.act).toBe(true);
    const html = renderToStaticMarkup(createElement(AudioHead, { head: up }));
    expect(html).toContain(
      '<button type="button" class="btn" data-busy="true"><span class="swap"><span>Update audio</span><span>Updating…</span></span></button>',
    );
    const fail = headOf({
      listen: doc("fail-play", {
        unit: "june/platform/2026-11-02-capture-dedupe",
        stoppedAt: 365,
      }),
      seed: docSeedOf(),
      kept: null,
      starting: false,
    });
    expect(fail.act).toBe(false);
    const live = renderToStaticMarkup(createElement(AudioHead, { head: fail }));
    expect(live).not.toContain("<button");
  });
});

describe("follow along (F210): only in a state with a place", () => {
  it("marks the block in the eight states that have a place, and in no other", () => {
    const keys: NoteKey[] = [
      "waiting",
      "making",
      "ready",
      "tap",
      "loading",
      "playing",
      "paused",
      "buffering",
      "next-waiting",
      "finished",
      "fail-voice",
      "fail-limit",
      "fail-play",
      "fail-session",
      "fail-unreadable",
      "offline-start",
      "offline-play",
      "offline-stopped",
      "outdated",
    ];
    expect(keys.filter(followsIn)).toEqual([
      "playing",
      "paused",
      "buffering",
      "fail-play",
      "fail-session",
      "offline-play",
      "offline-stopped",
      "outdated",
    ]);
  });
});
