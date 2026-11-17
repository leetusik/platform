import { afterEach, describe, expect, it, vi } from "vitest";

// The opened player's chapters and Previous / Next, wherever the Listen began (job 07, round 01: frame.md F211 § 5
// and § 6; `Listen.dc.html`'s `player`: `playable: r.made`, `hasPrev: !!LB.neighbour(c.id, -1)`), and the book
// page's rows (F209), as one rule (P64-3y.F2). A book Listen's own state starts at its first chapter, so the
// chapters before it are drawn from what the pages already read (`@/lib/listen/earlier`); a chapter no read covers
// says nothing. A press on a chapter before the Listen's first one starts the book's Listen from it through the one
// start press, with the key that chapter's own page sends. The server actions are a recorder here; the engine is
// the real one, on a stand-in element.

const starts: unknown[] = [];
const saves: unknown[] = [];
vi.mock("@/lib/listen/actions", () => ({
  listenSave: (input: unknown) => {
    saves.push(input);
    return Promise.resolve({ ok: true, status: 200 });
  },
  listenRead: () => new Promise(() => {}),
  listenStart: (key: unknown) => {
    starts.push(key);
    return new Promise(() => {});
  },
  listenUpdate: () => new Promise(() => {}),
}));

const { createEngine } = await import("@/lib/listen/engine");
const { bookRowsOf, bookStartOf, pressPlayer } = await import("@/hi2vi/listen");
const { chapterStartOf } = await import("@/hi2vi/listen/press");
const { earlierOf, forgetReads, rememberRead } =
  await import("@/lib/listen/earlier");
const { getKept, getListen, setEngine, setKept, setListen } =
  await import("@/lib/listen/store");
const { playerView } = await import("@/lib/listen/view");

import type { KbListenEntry, KbListenState } from "@/lib/knowledge/listen";
import type { ListenEngine } from "@/lib/listen/store";
import type {
  Listen,
  ListenBookKey,
  ListenEntry,
  ListenKept,
  ListenSeed,
} from "@/lib/listen/types";

// The record's book: the platform handbook, 14 chapters (F212), a Korean title among them.
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
// F212's lengths: 7:10, 8:40, 12:05, 6:50, 8:35, 15:30, …
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
const KEY = { org: "june", project: "platform", book: "platform-handbook" };

const made = (n: number): ListenEntry => ({
  chapter: `c${n}`,
  state: "made",
  len: LENS[n - 1],
  part: null,
  left: null,
});
const as = (n: number, state: ListenEntry["state"]): ListenEntry => ({
  chapter: `c${n}`,
  state,
  len: null,
  part: state === "making" ? { n: 2, of: 9 } : null,
  left: null,
});

/**
 * The handbook's Listen from chapter `from`, heard at `ch`: its own entries from `from` on (chapters up to `upTo`
 * made, the next one being made at part 2 of 9, the rest waiting), and `earlier` for the chapters before `from`.
 */
function listenFrom(
  from: number,
  ch: number,
  more: Partial<Listen> = {},
  upTo = 6,
): Listen {
  const own = BOOK.chapters
    .filter((c) => c.n >= from)
    .map((c) =>
      c.n <= upTo
        ? made(c.n)
        : c.n === upTo + 1
          ? as(c.n, "making")
          : as(c.n, "none"),
    );
  const key: ListenBookKey = { ...KEY, from_chapter: `c${from}` };
  return {
    unit: UNIT,
    key,
    kind: "book",
    title: TITLES[ch - 1],
    titleLang: "en",
    lang: "en",
    href: BASE,
    book: BOOK,
    from: `c${from}`,
    ch: `c${ch}`,
    chPos: 120,
    chLen: LENS[ch - 1],
    chSoFar: false,
    making: upTo < 14 ? `c${upTo + 1}` : null,
    entries: own,
    spans: [],
    state: "playing",
    back: null,
    old: false,
    updating: false,
    soFar: true,
    len: 2000,
    pos: 120,
    part: { n: 2, of: 9 },
    parts: 9,
    partsMade: 1,
    left: 290,
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

const table = (l: Listen) =>
  playerView(l).rows.map((r) => [r.n, r.line, r.playable, r.current, r.word]);

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

const KEPT: ListenKept = {
  unit: UNIT,
  ch: "c3",
  n: 3,
  pos: 200,
  len: 725,
  lang: "en",
};

afterEach(() => {
  setEngine(null);
  setListen(null);
  setKept(null);
  forgetReads();
  starts.length = 0;
  saves.length = 0;
  vi.unstubAllGlobals();
});

describe("the player's rows: one rule, wherever the Listen began (F211)", () => {
  it("reads each chapter's audio: before the first chapter from the pages' reads, on the stream from its own state", () => {
    // From chapter 6, heard at 6. Read before it: 1 and 3 made, 2 can't be read aloud, 4 being made by another
    // Listen; 5 read by no page.
    const l = listenFrom(6, 6, {
      earlier: [made(1), as(2, "unavailable"), made(3), as(4, "making")],
    });
    expect(table(l)).toEqual([
      [1, "7 min", true, false, ""],
      [2, "", false, false, ""],
      [3, "12 min", true, false, ""],
      [4, "Not prepared yet", false, false, ""],
      [5, "", false, false, ""],
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
  });

  it("is the same row for a made chapter before the first one as on the stream", () => {
    const before = playerView(listenFrom(6, 6, { earlier: [made(3)] })).rows[2];
    const on = playerView(listenFrom(1, 6)).rows[2];
    expect(before).toEqual(on);
  });

  it("says nothing of a chapter before the first one that no page read", () => {
    const v = playerView(listenFrom(6, 6));
    expect(v.rows.slice(0, 5).map((r) => [r.line, r.playable])).toEqual([
      ["", false],
      ["", false],
      ["", false],
      ["", false],
      ["", false],
    ]);
  });

  it("draws the current chapter as Playing or Paused, never as a button", () => {
    const v = playerView(listenFrom(6, 6, { state: "paused" }));
    expect(v.rows[5]).toMatchObject({
      current: true,
      word: "Paused",
      playable: true,
    });
  });
});

describe("Previous and Next (F211: a chapter that does not exist leaves its place empty)", () => {
  it("draws Previous at the Listen's first chapter when the book has one before it, read or not", () => {
    for (const earlier of [[made(5)], [as(5, "none")], []]) {
      const v = playerView(listenFrom(6, 6, { earlier }));
      expect([v.hasPrev, v.prev, v.hasNext, v.next]).toEqual([
        true,
        "c5",
        true,
        "c7",
      ]);
    }
  });

  it("leaves Previous empty on chapter 1 and Next empty on chapter 14", () => {
    const first = playerView(listenFrom(1, 1));
    expect([first.hasPrev, first.prev]).toEqual([false, null]);
    const last = playerView(listenFrom(14, 14, {}, 14));
    expect([last.hasNext, last.next, last.hasPrev]).toEqual([
      false,
      null,
      true,
    ]);
  });
});

describe("a press before the Listen's first chapter (the book's Listen from that chapter)", () => {
  it("starts it with the key that chapter's own page sends, at 0:00, and moves on the stream as before", () => {
    const calls = recorder();
    const l = listenFrom(6, 6, { earlier: [made(1), made(5)] });
    pressPlayer(l, { t: "step", dir: -1 }, () => {});
    pressPlayer(l, { t: "pick", id: "c1" }, () => {});
    pressPlayer(l, { t: "step", dir: 1 }, () => {});
    pressPlayer(listenFrom(1, 6), { t: "step", dir: -1 }, () => {});
    pressPlayer(listenFrom(1, 6), { t: "pick", id: "c3" }, () => {});
    expect(calls.map((c) => c[0])).toEqual([
      "start",
      "start",
      "seekChapter",
      "seekChapter",
      "seekChapter",
    ]);
    expect(calls.slice(2)).toEqual([
      ["seekChapter", "c7"],
      ["seekChapter", "c5"],
      ["seekChapter", "c3"],
    ]);
    const [, prev, at] = calls[0] as [string, ListenSeed, number];
    // The chapter page's key (`[chapter]/page.tsx` `listenKey`): the book from that chapter, no language unless
    // the Listen's own key names one. Nothing else.
    expect(prev.key).toStrictEqual({ ...KEY, from_chapter: "c5" });
    expect(at).toBe(0);
    expect(prev).toMatchObject({
      title: "The search index",
      lang: "en",
      state: null,
      href: `${BASE}/c5`,
      chapter: "c5",
      book: BOOK,
    });
    const [, row] = calls[1] as [string, ListenSeed];
    expect(row.key).toStrictEqual({ ...KEY, from_chapter: "c1" });
  });

  it("keeps the Listen's own language in the key, only where its key names one", () => {
    const calls = recorder();
    const ko = listenFrom(6, 6, {
      key: { ...KEY, from_chapter: "c6", lang: "ko" },
      lang: "ko",
    });
    pressPlayer(ko, { t: "step", dir: -1 }, () => {});
    const [, seed] = calls[0] as [string, ListenSeed];
    expect(seed.key).toStrictEqual({ ...KEY, from_chapter: "c5", lang: "ko" });
    expect(chapterStartOf(listenFrom(6, 6), "c99")).toBeNull();
  });

  it("ends the Listen under way as any new Listen does: the kept place is cleared", () => {
    recorder();
    setKept(KEPT);
    pressPlayer(listenFrom(6, 6), { t: "step", dir: -1 }, () => {});
    expect(getKept()).toBeNull();
  });
});

describe("what the pages read, by book and language (`@/lib/listen/earlier`)", () => {
  const stateFrom = (
    from: number,
    entries: KbListenEntry[],
    lang = "en",
  ): KbListenState =>
    ({
      listen: {
        kind: "book",
        org: "june",
        project: "platform",
        doc: null,
        book: "platform-handbook",
        from_chapter: `c${from}`,
        lang,
      },
      state: "making",
      old: false,
      updating: false,
      so_far: true,
      len: null,
      made: { parts: 0, of: 0, chapters: [], through: null },
      part: null,
      left_seconds: null,
      waiting: false,
      runner_last_seen: null,
      failure: null,
      entries,
      position: null,
      resume: null,
      speed: 1,
      follow: true,
      kept: false,
      play: null,
    }) as KbListenState;
  const entry = (n: number, state: KbListenEntry["state"]): KbListenEntry =>
    ({
      chapter: `c${n}`,
      title: TITLES[n - 1],
      doc: `c${n}`,
      lang: "en",
      current_version: 1,
      state,
      old: false,
      updating: false,
      unit: null,
      update: null,
      ...(state === "made" ? { len: LENS[n - 1] } : {}),
    }) as KbListenEntry;

  it("gives the chapters before a Listen's first one, newest read first, in that language only", () => {
    rememberRead(
      UNIT,
      stateFrom(1, [entry(1, "none"), entry(2, "made")]),
      "en",
    );
    rememberRead(UNIT, stateFrom(1, [entry(1, "made")]), "en");
    rememberRead(UNIT, stateFrom(1, [entry(3, "made")], "ko"), "en");
    expect(earlierOf(UNIT, "en", BOOK, "c3")).toEqual([made(1), made(2)]);
    expect(earlierOf(UNIT, "ko", BOOK, "c4")).toEqual([made(3)]);
    expect(earlierOf(UNIT, "en", BOOK, "c1")).toEqual([]);
    expect(earlierOf("june/platform/books/other", "en", BOOK, "c3")).toEqual(
      [],
    );
  });

  it("carries the book page's read with Continue listening into the player, and sends the same start", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const g = globalThis as Record<string, unknown>;
    const hadWindow = "window" in g;
    const hadDocument = "document" in g;
    if (!hadWindow) g.window = new EventTarget();
    if (!hadDocument)
      g.document = Object.assign(new EventTarget(), {
        visibilityState: "visible",
      });
    try {
      const engine = createEngine(element());
      setEngine(engine);
      const home: ListenSeed = {
        key: KEY,
        title: TITLES[0],
        lang: "en",
        state: stateFrom(
          1,
          BOOK.chapters.map((c) => entry(c.n, c.n <= 6 ? "made" : "none")),
        ),
        href: `${BASE}/c1`,
        book: BOOK,
        chapter: null,
      };
      const go = bookStartOf(
        "resume",
        { start: home, langs: { en: home }, place: null, resume: null },
        KEPT,
      );
      expect(go?.seed.key).toStrictEqual({
        ...KEY,
        from_chapter: "c3",
        lang: "en",
      });
      // The press: the book page's own (`BookBody`'s `begin`).
      engine.start(go!.seed, go!.from);
      expect(starts).toEqual([{ ...KEY, from_chapter: "c3", lang: "en" }]);
      const l = getListen()!;
      expect(l.earlier).toEqual([made(1), made(2)]);
      const v = playerView(l);
      expect(v.rows.slice(0, 2).map((r) => [r.line, r.playable])).toEqual([
        ["7 min", true],
        ["9 min", true],
      ]);
      expect([v.hasPrev, v.prev]).toEqual([true, "c2"]);
      // A row before it: the book's Listen from chapter 1, its key as chapter 1's page would send it.
      pressPlayer(l, { t: "pick", id: "c1" }, () => {});
      expect(starts[1]).toStrictEqual({
        ...KEY,
        from_chapter: "c1",
        lang: "en",
      });
      expect(getListen()?.from).toBe("c1");
      expect(getListen()?.earlier).toEqual([]);
      // Nothing was playing (no audio attached): no place is written, and nothing is kept.
      expect(saves).toEqual([]);
      expect(getKept()).toBeNull();
      engine.destroy();
    } finally {
      if (!hadWindow) delete g.window;
      if (!hadDocument) delete g.document;
    }
  });
});

describe("the book page's rows (F209): the same rule", () => {
  it("reads a chapter before the Listen's first one from the page's own read, and the making as this Listen's", () => {
    const entry = (n: number, state: KbListenEntry["state"]) =>
      ({
        chapter: `c${n}`,
        title: TITLES[n - 1],
        doc: `c${n}`,
        lang: "en",
        current_version: 1,
        state,
        old: false,
        ...(state === "made" ? { len: LENS[n - 1] } : {}),
        ...(state === "making" ? { part: { n: 3, of: 9 } } : {}),
      }) as KbListenEntry;
    // The page read the book from chapter 1: 1 to 3 made, 4 being made (by the Listen from chapter 1), the rest not.
    const start: ListenSeed = {
      key: KEY,
      title: TITLES[0],
      lang: "en",
      state: {
        ...({} as KbListenState),
        listen: { lang: "en" } as KbListenState["listen"],
        state: "making",
        part: { n: 3, of: 9, chapter: "c4" },
        entries: BOOK.chapters.map((c) =>
          entry(c.n, c.n <= 3 ? "made" : c.n === 4 ? "making" : "none"),
        ),
      } as KbListenState,
      href: `${BASE}/c1`,
      book: BOOK,
      chapter: null,
    };
    const seed = { start, langs: { en: start }, place: null, resume: null };
    // A Listen from chapter 6, playing it, making chapter 7.
    const L = listenFrom(6, 6);
    const rows = bookRowsOf(seed, L)!;
    expect(
      ["c1", "c4", "c5", "c6", "c7", "c8"].map((k) => [
        rows[k].line,
        rows[k].play,
      ]),
    ).toEqual([
      ["Audio 7 min", ""],
      ["Audio not prepared yet", ""],
      ["Audio not prepared yet", ""],
      ["Audio 16 min", "Playing"],
      ["Audio preparing… · part 2 of 9", ""],
      ["Audio not prepared yet", ""],
    ]);
  });
});

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
