import { describe, expect, it } from "vitest";

import { headOf } from "@/sikstack/listen";
import type { KbListenPosition, KbListenState } from "@/lib/knowledge/listen";
import type { Listen, ListenKept, ListenSeed } from "@/lib/listen/types";

// A chapter's head while its book's Listen is elsewhere, and a place kept elsewhere (P64-3y.S12's two rules, proved
// here: P64-3y.F2). `Listen.dc.html`'s `kept`: "Stop listening writes it, a Listen of that unit clears it", and
// `LR.control` offers Continue listening only on the kept chapter (`k.ch === unitId`), so:
//   (a) while a Listen of the book is under way in another chapter, the chapter offers Listen, never the place it
//       read (or kept) before that Listen;
//   (b) a place kept in another chapter, or at this chapter's end (or at 0:00), offers no Continue listening on
//       this chapter, whatever the page read: the book page's rule (`./book` `resumeOf`).

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
const LENS = [
  430, 520, 725, 410, 515, 930, 415, 425, 820, 530, 420, 405, 440, 215,
];
const BASE = "/@june/platform/books/platform-handbook";
const BOOK = {
  title: "The platform handbook",
  href: BASE,
  chapters: TITLES.map((title, i) => ({
    key: `c${i + 1}`,
    n: i + 1,
    title,
    lang: i === 11 ? "ko" : "en",
    href: `${BASE}/c${i + 1}`,
  })),
};
const UNIT = "june/platform/books/platform-handbook";
const KEY = {
  org: "june",
  project: "platform",
  book: "platform-handbook",
  from_chapter: "c6",
};

/** Where the reader left chapter 6 part-way, as the page read it (B1's `resume`): 5:00 of 15:30. */
const READ: KbListenPosition = {
  from_chapter: "c1",
  chapter: "c6",
  seconds: 300,
  lang: "en",
  speed: 1,
  follow: true,
  kept: false,
  updated_at: "2026-11-17T08:52:00Z",
};

/** Chapter 6's page: the book from chapter 6, every chapter made, the page's read place at 5:00. */
function seedOf(resume: KbListenPosition | null = READ): ListenSeed {
  return {
    key: KEY,
    title: TITLES[5],
    lang: "en",
    state: {
      listen: { lang: "en" },
      entries: BOOK.chapters.slice(5).map((c) => ({
        chapter: c.key,
        state: "made",
        len: LENS[c.n - 1],
      })),
      resume,
      position: null,
    } as unknown as KbListenState,
    href: `${BASE}/c6`,
    book: BOOK,
    chapter: "c6",
  };
}

/** The book's Listen from chapter 1, heard at `ch`. */
function listenAt(ch: number): Listen {
  return {
    unit: UNIT,
    key: { org: "june", project: "platform", book: "platform-handbook" },
    kind: "book",
    title: TITLES[ch - 1],
    titleLang: "en",
    lang: "en",
    href: BASE,
    book: BOOK,
    from: "c1",
    ch: `c${ch}`,
    chPos: 40,
    chLen: LENS[ch - 1],
    chSoFar: false,
    making: null,
    entries: [],
    spans: [],
    state: "playing",
    back: null,
    old: false,
    updating: false,
    soFar: false,
    len: 6200,
    pos: 2000,
    part: null,
    parts: 9,
    partsMade: 9,
    left: null,
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

const kept = (ch: number, pos: number): ListenKept => ({
  unit: UNIT,
  ch: `c${ch}`,
  n: ch,
  pos,
  len: LENS[ch - 1],
  lang: "en",
});

const formOf = (listen: Listen | null, k: ListenKept | null) => {
  const c = headOf({
    listen,
    seed: seedOf(),
    kept: k,
    starting: false,
  }).control;
  return [c.form, c.at || c.q];
};

describe("(a) a chapter's head while its book's Listen is under way in another chapter", () => {
  it("offers Listen, not the place the page read before that Listen", () => {
    // With no Listen, the page's read offers Continue listening at 5:00.
    expect(formOf(null, null)).toEqual(["resume", "5:00 of 15:30"]);
    // The book's Listen plays chapter 8: chapter 6 offers Listen.
    expect(formOf(listenAt(8), null)[0]).toBe("listen");
  });

  it("offers Listen, not a place kept on this chapter before that Listen", () => {
    expect(formOf(null, kept(6, 300))).toEqual(["resume", "5:00 of 15:30"]);
    expect(formOf(listenAt(8), kept(6, 300))[0]).toBe("listen");
  });

  it("is this chapter's note once the Listen is here (the rule is for another chapter only)", () => {
    const h = headOf({
      listen: listenAt(6),
      seed: seedOf(),
      kept: null,
      starting: false,
    });
    expect(h.show).toBe("note");
  });
});

describe("(b) a place kept in another chapter, or at this chapter's end, offers no Continue listening", () => {
  it("kept in another chapter: Listen, whatever the page read for this one", () => {
    expect(formOf(null, kept(8, 120))[0]).toBe("listen");
  });

  it("kept at this chapter's end or at 0:00: Listen", () => {
    expect(formOf(null, kept(6, 930))[0]).toBe("listen");
    expect(formOf(null, kept(6, 929.5))[0]).toBe("listen");
    expect(formOf(null, kept(6, 0))[0]).toBe("listen");
    // Part-way it is the place.
    expect(formOf(null, kept(6, 928))).toEqual(["resume", "15:28 of 15:30"]);
  });
});
