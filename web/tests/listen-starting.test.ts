import { describe, expect, it } from "vitest";

import {
  headOf,
  startingOf,
  textOf,
  trackOf,
  trackStartingOf,
} from "@/hi2vi/listen";
import type { ListenKey } from "@/lib/listen/machine";
import type { Listen, ListenSeed } from "@/lib/listen/types";

// P64-3y.F1 — while the head reads Starting…, the track holds nothing (job 07 frame.md F206: "This text's Listen
// starting: the control, busy, `Starting…`"; `Listen.dc.html`'s preset "Starting…" draws the head busy and no
// dock: its `begin` sets the Listen only once start answers, and the pill needs the head's control). The head and
// the track read one answer, `startingOf`; the press is the text's own (`textOf`): the head's control or its pill.

const KEY = {
  org: "p64-fid",
  project: "handbook",
  book: "guide",
  from_chapter: "write-lock",
};
const CHAPTERS = [
  ["reading-aids", "Reading aids: formulas, terms and the glossary"],
  ["write-lock", "The write lock, and why a draft waits its turn"],
  ["every-block", "Every block the reader knows, once each"],
].map(([key, title], i) => ({
  key,
  n: i + 1,
  title,
  lang: "en",
  href: `/@p64-fid/handbook/books/guide/${key}`,
}));

function seedAt(chapter: string): ListenSeed {
  return {
    key: { ...KEY, from_chapter: chapter },
    title: CHAPTERS.find((c) => c.key === chapter)?.title ?? "",
    lang: "en",
    state: null,
    href: `/@p64-fid/handbook/books/guide/${chapter}`,
    book: {
      title: "The reading guide",
      href: "/@p64-fid/handbook/books/guide",
      chapters: CHAPTERS,
    },
    chapter,
  };
}

function listen(state: ListenKey, ch = "write-lock"): Listen {
  return {
    unit: "p64-fid/handbook/books/guide",
    key: { ...KEY, from_chapter: ch },
    kind: "book",
    title: CHAPTERS.find((c) => c.key === ch)?.title ?? "",
    titleLang: "en",
    lang: "en",
    href: `/@p64-fid/handbook/books/guide/${ch}`,
    book: {
      title: "The reading guide",
      href: "/@p64-fid/handbook/books/guide",
      chapters: CHAPTERS,
    },
    from: ch,
    ch,
    chPos: 0,
    chLen: null,
    chSoFar: false,
    making: null,
    entries: [{ chapter: ch, state: "made", len: 245, part: null, left: null }],
    spans: [],
    state,
    back: null,
    old: false,
    updating: false,
    soFar: false,
    len: 245,
    pos: 0,
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

const seed = seedAt("write-lock");
const pressed = textOf(seed);
const track = {
  shown: true,
  pill: true,
  chapter: true,
  hidden: false,
};

describe("Starting…: the head busy, the track empty, until the Listen answers", () => {
  it("the press out, the Listen still loading: the head reads Starting… and the track holds no dock (S11: Loading… beside Starting…)", () => {
    const l = listen("loading");
    const starting = startingOf({ pressed, seed, listen: l });
    expect(starting).toBe(true);
    expect(headOf({ listen: l, seed, kept: null, starting }).show).toBe("busy");
    expect(trackOf({ ...track, listen: l, starting }).show).toBe(null);
  });

  it("before the player has made the Listen (no Listen yet): busy, and no pill either", () => {
    const starting = startingOf({ pressed, seed, listen: null });
    expect(starting).toBe(true);
    expect(trackOf({ ...track, listen: null, starting }).show).toBe(null);
  });

  it("answered (playing, or a making the listener cannot hear yet): the note and the dock", () => {
    for (const s of ["playing", "making", "waiting", "fail-voice"] as const) {
      const l = listen(s);
      const starting = startingOf({ pressed, seed, listen: l });
      expect(starting, s).toBe(false);
      expect(headOf({ listen: l, seed, kept: null, starting }).show, s).toBe(
        "note",
      );
      expect(trackOf({ ...track, listen: l, starting }).show, s).toBe("dock");
    }
  });

  it("a Listen loading by any other press (the dock's Play, Try again): the dock's Loading…, the head's note", () => {
    const l = listen("loading");
    const starting = startingOf({ pressed: null, seed, listen: l });
    expect(starting).toBe(false);
    expect(headOf({ listen: l, seed, kept: null, starting }).show).toBe("note");
    expect(trackOf({ ...track, listen: l, starting }).show).toBe("dock");
  });

  it("the press is one text's: another chapter's page keeps its dock", () => {
    const other = seedAt("every-block");
    const l = listen("loading");
    expect(startingOf({ pressed, seed: other, listen: l })).toBe(false);
    expect(textOf(other)).not.toBe(pressed);
  });
});

describe("the book page's own press: its head's flag reaches the track", () => {
  // The book page's head is busy from its press (`BookBody`'s `starting`, given to `bookHeadOf`) until the Listen
  // answers; the track there has no text seed, so the page passes the same flag (S11/F1: `Loading… · Chapter 1`
  // beside `Starting…` until the chapter opened).
  const book = { ...track, chapter: false };

  it("the head busy, the Listen loading: no dock", () => {
    const l = listen("loading", "reading-aids");
    const starting = trackStartingOf({
      starting: true,
      seed: null,
      pressed: null,
      listen: l,
    });
    expect(starting).toBe(true);
    expect(trackOf({ ...book, listen: l, starting }).show).toBe(null);
  });

  it("the head answered or no press: the dock", () => {
    const l = listen("playing", "reading-aids");
    const starting = trackStartingOf({
      starting: false,
      seed: null,
      pressed: null,
      listen: l,
    });
    expect(trackOf({ ...book, listen: l, starting }).show).toBe("dock");
  });

  it("a text page still reads its own press", () => {
    const l = listen("loading");
    expect(trackStartingOf({ starting: false, seed, pressed, listen: l })).toBe(
      true,
    );
    expect(
      trackStartingOf({ starting: false, seed, pressed: null, listen: l }),
    ).toBe(false);
  });
});
