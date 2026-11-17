import { afterEach, describe, expect, it, vi } from "vitest";

import type { BookListenSeedView } from "@/hi2vi/listen";
import type { KbListenPosition, KbListenState } from "@/lib/knowledge/listen";
import type { ListenKey } from "@/lib/listen/machine";
import type { Listen, ListenSeed } from "@/lib/listen/types";

// P64-3y.F1 — leaving the Listen pages ends the Listen; its place is kept (job 07 frame.md F231, `Main.dc.html`'s
// `leave` and `PLACED`). The rule is pure (which addresses are Listen pages, which states keep a place); the
// write is the existing `PUT /app/listen/position` payload, unchanged (the engine's `where` plus `kept: true`, as
// Stop listening sends it, P41-sr.W2 F17). The server actions are replaced by a recorder; the engine and the
// store are the real ones, on a stand-in element (as `listen-player-view-stop.test.ts`).

const sent: unknown[] = [];
vi.mock("@/lib/listen/actions", () => ({
  listenSave: (input: unknown) => {
    sent.push(input);
    return Promise.resolve({ ok: true, status: 200 });
  },
  listenRead: () => new Promise(() => {}),
  listenStart: () => new Promise(() => {}),
  listenUpdate: () => new Promise(() => {}),
}));

const { createEngine } = await import("@/lib/listen/engine");
const { bookControlOf, controlOf } = await import("@/hi2vi/listen");
const { keepsPlace, leavesListen, PLACED } = await import("@/lib/listen/leave");
const { getKept, getListen, listenActions, setEngine, setKept, setListen } =
  await import("@/lib/listen/store");

/** An `<audio>` that never sounds: the events, an empty source, Chromium's "maybe" for HLS. */
function element(): HTMLAudioElement {
  const el = new EventTarget() as EventTarget & Record<string, unknown>;
  Object.assign(el, {
    currentTime: 0,
    paused: true,
    ended: false,
    canPlayType: () => "maybe",
    getAttribute: () => null,
    removeAttribute: () => {},
    pause: () => {},
    load: () => {},
  });
  return el as unknown as HTMLAudioElement;
}

const g = globalThis as Record<string, unknown>;
const hadWindow = "window" in g;
const hadDocument = "document" in g;

function withEngine() {
  if (!hadWindow) g.window = new EventTarget();
  if (!hadDocument)
    g.document = Object.assign(new EventTarget(), {
      visibilityState: "visible",
    });
  const engine = createEngine(element());
  setEngine(engine);
  return engine;
}

afterEach(() => {
  setEngine(null);
  setListen(null);
  setKept(null);
  sent.length = 0;
  if (!hadWindow) delete g.window;
  if (!hadDocument) delete g.document;
});

/** The reading guide's Listen from write-lock, at write-lock 0:50 of 4:05 (S11's walk). */
function guide(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return {
    unit: "p64-fid/handbook/books/guide",
    key: {
      org: "p64-fid",
      project: "handbook",
      book: "guide",
      from_chapter: "write-lock",
    },
    kind: "book",
    title: "The write lock, and why a draft waits its turn",
    titleLang: "en",
    lang: "en",
    href: "/@p64-fid/handbook/books/guide/write-lock",
    book: {
      title: "The reading guide",
      href: "/@p64-fid/handbook/books/guide",
      chapters: [
        {
          key: "reading-aids",
          n: 1,
          title: "Reading aids: formulas, terms and the glossary",
          lang: "en",
          href: "/@p64-fid/handbook/books/guide/reading-aids",
        },
        {
          key: "write-lock",
          n: 2,
          title: "The write lock, and why a draft waits its turn",
          lang: "en",
          href: "/@p64-fid/handbook/books/guide/write-lock",
        },
        {
          key: "every-block",
          n: 3,
          title: "Every block the reader knows, once each",
          lang: "en",
          href: "/@p64-fid/handbook/books/guide/every-block",
        },
      ],
    },
    from: "write-lock",
    ch: "write-lock",
    chPos: 50,
    chLen: 245,
    chSoFar: false,
    making: "every-block",
    entries: [
      {
        chapter: "write-lock",
        state: "made",
        len: 245,
        part: null,
        left: null,
      },
      {
        chapter: "every-block",
        state: "making",
        len: null,
        part: { n: 1, of: 9 },
        left: 290,
      },
    ],
    spans: [
      {
        chapter: "write-lock",
        start: 0,
        len: 245,
        complete: true,
        title: "The write lock, and why a draft waits its turn",
        lang: "en",
      },
    ],
    state,
    back: null,
    old: false,
    updating: false,
    soFar: true,
    len: 245,
    pos: 50,
    part: { n: 1, of: 9 },
    parts: 18,
    partsMade: 9,
    left: 290,
    seen: null,
    loaded: 0,
    stoppedAt: null,
    speed: 1.25,
    follow: false,
    play: null,
    segs: [],
    seg: -1,
    ...more,
  };
}

const CHAPTER = "/@p64-fid/handbook/books/guide/write-lock";
const NEXT = "/@p64-fid/handbook/books/guide/every-block";
const BOOK = "/@p64-fid/handbook/books/guide";
const DOC = "/@p64-fid/handbook/2026-11-17-night-shift";
const DOC_ID = "/documents/0b6c2f3e-9b7c-4f51-a1f4-2d1e9c3b7a10";

describe("which moves leave the Listen pages", () => {
  it("between reading pages and the book page: stays (the dock stays, F208)", () => {
    for (const [from, to] of [
      [CHAPTER, NEXT],
      [CHAPTER, BOOK],
      [BOOK, CHAPTER],
      [CHAPTER, DOC],
      [DOC, DOC_ID],
      [DOC_ID, CHAPTER],
    ]) {
      expect(leavesListen(from, to), `${from} → ${to}`).toBe(false);
    }
  });

  it("from a reading page or the book page to any other page: leaves", () => {
    for (const from of [CHAPTER, BOOK, DOC, DOC_ID]) {
      for (const to of [
        "/@p64-fid",
        "/@p64-fid/handbook",
        "/review",
        "/search",
        "/library",
        "/@p64-fid/handbook/notes/guide",
        "/settings",
        "/",
      ]) {
        expect(leavesListen(from, to), `${from} → ${to}`).toBe(true);
      }
    }
  });

  it("from any other page: never (no Listen lives there)", () => {
    expect(leavesListen("/@p64-fid", "/review")).toBe(false);
    expect(leavesListen("/review", CHAPTER)).toBe(false);
    expect(leavesListen(null, "/review")).toBe(false);
  });
});

describe("which Listens keep their place (F231)", () => {
  const ALL: ListenKey[] = [
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
  ];
  const KEEPS = new Set<ListenKey>([
    "playing",
    "paused",
    "buffering",
    "offline-play",
    "offline-stopped",
    "fail-play",
    "fail-session",
  ]);

  it("a place (playing, paused, buffering, offline, playback stopped, signed out) past 0:00 keeps it; every other state keeps nothing", () => {
    for (const s of ALL) {
      expect(keepsPlace(guide(s)), s).toBe(KEEPS.has(s));
    }
  });

  it("the earlier version keeps its place (playing or paused, `old`)", () => {
    expect(keepsPlace(guide("playing", { old: true }))).toBe(true);
    expect(keepsPlace(guide("paused", { old: true }))).toBe(true);
    expect(PLACED).toContain("outdated");
  });

  it("at 0:00 nothing is kept (under a second reads 0:00)", () => {
    for (const s of KEEPS) {
      expect(keepsPlace(guide(s, { chPos: 0 })), s).toBe(false);
      expect(keepsPlace(guide(s, { chPos: 0.6 })), s).toBe(false);
      expect(keepsPlace(guide(s, { chPos: 1 })), s).toBe(true);
    }
  });
});

describe("leaving ends the Listen", () => {
  it("a paused Listen at 0:50: Stop listening's write, unchanged, and Continue listening's place", () => {
    const engine = withEngine();
    setListen(guide("paused"));
    listenActions.leave();
    expect(sent).toEqual([
      {
        org: "p64-fid",
        project: "handbook",
        book: "guide",
        from_chapter: "write-lock",
        chapter: "write-lock",
        seconds: 50,
        speed: 1.25,
        follow: false,
        kept: true,
      },
    ]);
    expect(getListen()).toBeNull();
    expect(getKept()).toEqual({
      unit: "p64-fid/handbook/books/guide",
      ch: "write-lock",
      n: 2,
      pos: 50,
      len: 245,
      lang: "en",
    });
    engine.destroy();
  });

  it("a Listen still preparing ends keeping nothing, and writes nothing (nothing plays)", () => {
    const engine = withEngine();
    setListen(guide("making", { ch: "every-block", chPos: 0, chLen: null }));
    listenActions.leave();
    expect(sent).toEqual([]);
    expect(getListen()).toBeNull();
    expect(getKept()).toMatchObject({
      unit: "p64-fid/handbook/books/guide",
      none: true,
    });
    engine.destroy();
  });

  it("a finished Listen ends keeping nothing", () => {
    const engine = withEngine();
    setListen(guide("finished", { chPos: 245 }));
    listenActions.leave();
    expect(getListen()).toBeNull();
    expect(getKept()).toMatchObject({ none: true });
    expect(sent.some((s) => (s as { kept?: boolean }).kept)).toBe(false);
    engine.destroy();
  });

  it("back on the page, a Listen that kept nothing offers no place, whatever the page read before it started (Back reuses that read)", () => {
    const engine = withEngine();
    // The chapter's read from before the Listen: Continue listening at 0:31 (S11's primer, then played to its end).
    const before: KbListenPosition = {
      from_chapter: "write-lock",
      chapter: "write-lock",
      seconds: 31,
      lang: "en",
      speed: 1,
      follow: true,
      kept: true,
      updated_at: "2026-11-17T09:12:00+00:00",
    };
    const state = {
      listen: { lang: "en" },
      state: "made",
      len: 245,
      entries: [
        {
          chapter: "write-lock",
          state: "made",
          len: 245,
          lang: "en",
        },
      ],
      position: before,
      resume: before,
    } as unknown as KbListenState;
    const seed: ListenSeed = {
      key: {
        org: "p64-fid",
        project: "handbook",
        book: "guide",
        from_chapter: "write-lock",
      },
      title: "The write lock, and why a draft waits its turn",
      lang: "en",
      state,
      href: "/@p64-fid/handbook/books/guide/write-lock",
      book: guide("paused").book,
      chapter: "write-lock",
    };
    expect(controlOf(seed, null).form).toBe("resume");
    setListen(guide("finished", { chPos: 245 }));
    listenActions.leave();
    expect(controlOf(seed, getKept())).toMatchObject({
      form: "listen",
      q: "Chapter 2 · 4 min",
    });
    const book: BookListenSeedView = {
      start: { ...seed, key: { ...seed.key, from_chapter: undefined } },
      langs: {},
      place: before,
      resume: seed,
    };
    expect(bookControlOf(book, null, "3 chapters").form).toBe("resume");
    expect(bookControlOf(book, getKept(), "3 chapters").form).toBe("listen");
    // A kept place (Stop listening, a leave with a place) still offers it.
    setListen(guide("paused"));
    listenActions.leave();
    expect(controlOf(seed, getKept())).toMatchObject({
      form: "resume",
      at: "0:50 of 4:05",
    });
    engine.destroy();
  });

  it("no Listen: nothing happens", () => {
    const engine = withEngine();
    listenActions.leave();
    expect(sent).toEqual([]);
    expect(getListen()).toBeNull();
    engine.destroy();
  });

  it("the host's own cleanup after the leave finds no Listen (it no longer waits, paused)", () => {
    const engine = withEngine();
    setListen(guide("playing"));
    listenActions.leave();
    engine.destroy();
    expect(getListen()).toBeNull();
    expect(sent).toHaveLength(1);
  });
});
