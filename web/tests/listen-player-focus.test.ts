import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LISTEN } from "@/content/listen";
import { PlayerBody } from "@/sikstack/listen";
import {
  focusAfterPress,
  focusable,
  type PlayerControl,
} from "@/sikstack/listen/press-focus";
import type { PlayerEvent } from "@/sikstack/listen/press";
import type { ListenKey } from "@/lib/listen/machine";
import type { Listen, ListenBookKey } from "@/lib/listen/types";
import { playerView, type PlayerView } from "@/lib/listen/view";

// The opened player keeps its focus inside the sheet (P64-3y.F6; frame.md F226: focus opens on Close, returns to
// the dock, every control is reachable by Tab). When a press removes the control pressed (a chapter row becomes
// the current row's plain text; Previous at the book's first chapter; Next at its last), the focus moves to the
// transport's main button (Close when that button is disabled); when the control stays, the focus stays. Each
// case is the press and the view the sheet draws after it, from the one Listen as the engine holds it. The rule's
// picture of what the body draws is held to the body's own render.

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
/** The book's audio from chapter 1: `made` chapters made, the next one making at part 2 of 9. */
const entries = (made: number) =>
  BOOK.chapters.map((c, i) => ({
    chapter: c.key,
    state: (c.n <= made ? "made" : c.n === made + 1 ? "making" : "none") as
      "made" | "making" | "none",
    len: c.n <= made ? LENS[i] : null,
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

/** The handbook's Listen from chapter 1, heard at `ch`, `made` chapters made. */
function book(state: ListenKey, ch: number, made = 6): Listen {
  const before = LENS.slice(0, ch - 1).reduce((a, b) => a + b, 0);
  return doc(state, {
    unit: "june/platform/books/platform-handbook",
    key: bookKey("c1"),
    kind: "book",
    title: TITLES[ch - 1],
    href: BOOK.href,
    book: BOOK,
    from: "c1",
    ch: `c${ch}`,
    chPos: 0,
    chLen: LENS[ch - 1],
    making: made < 14 ? `c${made + 1}` : null,
    entries: entries(made),
    len: LENS.slice(0, made).reduce((a, b) => a + b, 0),
    pos: before,
    parts: 9,
    partsMade: 1,
    left: made < 14 ? 290 : null,
  });
}

const view = (l: Listen) => playerView(l);

describe("a press whose control leaves the sheet moves the focus to the transport's main button", () => {
  it("a chapter row: row 2 pressed while chapter 6 plays becomes the current row's plain text", () => {
    const pick: PlayerEvent = { t: "pick", id: "c2" };
    // Before the move lands (the audio seeks, the chapter changes renders later) row 2 is still a button.
    expect(focusAfterPress(pick, view(book("playing", 6)))).toBeNull();
    const after = view(book("playing", 2));
    expect(after.rows[1]).toMatchObject({ current: true });
    expect(focusAfterPress(pick, after)).toBe("play");
  });

  it("Previous from chapter 2 to chapter 1: Previous is no longer drawn", () => {
    const after = view(book("playing", 1));
    expect(after.hasPrev).toBe(false);
    expect(focusAfterPress({ t: "step", dir: -1 }, after)).toBe("play");
  });

  it("Next onto the book's last chapter: Next is no longer drawn", () => {
    const after = view(book("paused", 14, 14));
    expect(after.hasNext).toBe(false);
    expect(focusAfterPress({ t: "step", dir: 1 }, after)).toBe("play");
  });

  it("falls to Close when the main button is disabled (signed out: Play is off)", () => {
    const after = view(book("fail-session", 2));
    expect(after.lead).toBe("play-off");
    expect(focusAfterPress({ t: "pick", id: "c2" }, after)).toBe("close");
  });

  it("−15 and +15 that the new state disables (offline before starting) move it too", () => {
    const after = view(doc("offline-start"));
    expect(after.seekable).toBe(false);
    const to = focusAfterPress({ t: "skip", by: 15 }, after);
    expect(to).toBe(focusable(after, "play") ? "play" : "close");
  });
});

describe("a press whose control stays keeps the focus where it is", () => {
  it("Next while Next stays drawn (chapter 6 to 7)", () => {
    expect(
      focusAfterPress({ t: "step", dir: 1 }, view(book("playing", 7))),
    ).toBeNull();
  });

  it("Previous while Previous stays drawn (chapter 6 to 5)", () => {
    expect(
      focusAfterPress({ t: "step", dir: -1 }, view(book("playing", 5))),
    ).toBeNull();
  });

  it("Speed, Follow along, Play and Pause, −15 / +15 and the seek bar", () => {
    const after = view(book("playing", 6));
    for (const e of [
      { t: "speed", v: 1.5 },
      { t: "follow", on: false },
      { t: "play", lead: "pause" },
      { t: "skip", by: -15 },
      { t: "skip", by: 15 },
      { t: "seek", at: 120 },
    ] as PlayerEvent[])
      expect(focusAfterPress(e, after)).toBeNull();
  });

  it("Update audio while it updates (the button holds Updating…)", () => {
    const after = view(doc("paused", { old: true, updating: true }));
    expect(after.action).toBe("update");
    expect(focusAfterPress({ t: "action", what: "update" }, after)).toBeNull();
  });

  it("Stop listening and Sign in leave the sheet: the sheet's close and the page place the focus", () => {
    const after = view(book("fail-session", 6));
    expect(focusAfterPress({ t: "stop" }, after)).toBeNull();
    expect(focusAfterPress({ t: "action", what: "signin" }, after)).toBeNull();
  });
});

// The rule's picture of the body (`focusable`) is the body's own render: each control it calls focusable is a
// button (or the seek bar) the body draws enabled, and each it does not is absent or disabled.
const P = LISTEN.player;
const markup = (v: PlayerView) =>
  renderToStaticMarkup(
    createElement(PlayerBody, { view: v, uid: "t", onEvent: () => {} }),
  );
/** The opening tag of the first button (or input) that holds `mark`, or null. */
function tagOf(html: string, mark: string): string | null {
  for (const m of html.matchAll(/<(?:button|input)\b[^>]*>/g))
    if (m[0].includes(mark)) return m[0];
  return null;
}
const drawnEnabled = (html: string, mark: string) => {
  const tag = tagOf(html, mark);
  return tag !== null && !/\sdisabled=""/.test(tag);
};

describe("focusable is what the body draws", () => {
  const views: [string, PlayerView][] = [
    ["chapter 1 playing", view(book("playing", 1))],
    ["chapter 6 paused", view(book("paused", 6))],
    ["the last chapter", view(book("paused", 14, 14))],
    ["signed out", view(book("fail-session", 6))],
    ["a document offline before starting", view(doc("offline-start"))],
    ["a document to update", view(doc("paused", { old: true }))],
  ];
  it.each(views)("%s", (_, v) => {
    const html = markup(v);
    const marks: [PlayerControl, string][] = [
      ["play", "transport-play"],
      ["back", `aria-label="${P.back}"`],
      ["fwd", `aria-label="${P.fwd}"`],
      ["seek", 'class="seek"'],
      ["prev", `aria-label="${P.previous}"`],
      ["next", `aria-label="${P.next}"`],
    ];
    for (const [c, mark] of marks)
      expect([c, focusable(v, c)]).toEqual([c, drawnEnabled(html, mark)]);
    for (const r of v.rows) {
      const asButton = html.includes(
        `class="link-strong chapter-open" lang="${r.titleLang}">${r.title.replace(/'/g, "&#x27;")}</button>`,
      );
      expect([r.id, focusable(v, `row:${r.id}`)]).toEqual([r.id, asButton]);
    }
    expect(focusable(v, "action")).toBe(html.includes("data-busy="));
  });
});
