import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookChapters } from "@/components/book/book-chapters";
import { BookHead } from "@/components/book/book-head";
import {
  bookControlOf,
  bookHeadOf,
  bookRowsOf,
  bookStartOf,
  bookTrackOf,
  ListenTrack,
  shellOf,
  type BookListenSeedView,
} from "@/hi2vi/listen";
import type { KbListenEntry, KbListenState } from "@/lib/knowledge/listen";
import { contOf, keptSectionId, planContinue } from "@/lib/book/model";
import type { HeadView, RowView } from "@/lib/book/view";
import type { Listen, ListenKept, ListenSeed } from "@/lib/listen/types";

// Listen on the book page (job 07, round 01: frame.md F206, F207, F209, F234 FG2, F242, C01; `result.md` § Build ›
// Listen; `Listen.dc.html`'s book view, `BookHead.dc.html`, `BookChapters.dc.html`). The figures are the boards':
// the platform handbook, 14 chapters, chapters 1 to 6 made, chapter 7 being made (part 2 of 9), the rest not yet;
// kept at chapter 6, 12:30.

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
// Chapter lengths in seconds (chapter 6 is 15:30).
const LENS = [
  960, 840, 1080, 720, 900, 930, 780, 660, 1020, 600, 870, 750, 690, 240,
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
const KEY = {
  org: "june",
  project: "platform",
  book: "platform-handbook",
};

function entry(i: number, state: KbListenEntry["state"]): KbListenEntry {
  return {
    chapter: `c${i + 1}`,
    title: TITLES[i],
    doc: `c${i + 1}`,
    lang: "en",
    current_version: 1,
    state,
    old: false,
    ...(state === "made" ? { len: LENS[i] } : {}),
  } as KbListenEntry;
}

function stateOf(made: number | "all"): KbListenState {
  const entries = TITLES.map((_, i) =>
    made === "all" || i < made
      ? entry(i, "made")
      : i === made
        ? ({ ...entry(i, "making"), part: { n: 2, of: 9 } } as KbListenEntry)
        : entry(i, "none"),
  );
  return {
    listen: {
      kind: "book",
      org: "june",
      project: "platform",
      doc: null,
      book: "platform-handbook",
      from_chapter: null,
      lang: "en",
    },
    state: made === "all" ? "made" : "making",
    old: false,
    updating: false,
    so_far: made !== "all",
    len: null,
    made: { parts: 0, of: 0, chapters: [], through: null },
    part: made === "all" ? null : { n: 2, of: 9, chapter: `c${made + 1}` },
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
  };
}

function seedOf(made: number | "all" = 6): BookListenSeedView {
  const start: ListenSeed = {
    key: KEY,
    title: TITLES[0],
    lang: "en",
    state: stateOf(made),
    href: `${BASE}/c1`,
    book: BOOK,
    chapter: null,
  };
  return { start, langs: { en: start }, place: null, resume: null };
}

const UNIT = "june/platform/books/platform-handbook";
const KEPT: ListenKept = {
  unit: UNIT,
  ch: "c6",
  n: 6,
  pos: 750,
  len: 930,
  lang: "en",
};

function listenOn(ch: string, state: Listen["state"]): Listen {
  return { ...shellOf(seedOf().start), ch, state };
}

describe("the book page's three starts (F206 via `result.md` § Build › Listen)", () => {
  it("Listen plays chapter 1 from 0:00 and opens chapter 1's reader", () => {
    const go = bookStartOf("listen", seedOf(), null);
    expect(go).toMatchObject({ chapter: "c1", from: 0, href: `${BASE}/c1` });
    expect(go?.seed.key).toEqual(KEY);
  });

  it("Continue listening plays the kept chapter at its place and opens that chapter's reader", () => {
    const go = bookStartOf("resume", seedOf(), KEPT);
    expect(go).toMatchObject({ chapter: "c6", from: 750, href: `${BASE}/c6` });
    expect(go?.seed.key).toMatchObject({ from_chapter: "c6", lang: "en" });
    expect(go?.seed.chapter).toBe("c6");
    expect(go?.seed.title).toBe("Capture: from a widget to a message");
  });

  it("Start over plays chapter 1 at 0:00, even with a kept place", () => {
    const go = bookStartOf("startover", seedOf(), KEPT);
    expect(go).toMatchObject({ chapter: "c1", from: 0, href: `${BASE}/c1` });
  });

  it("Continue listening without a place, or at a chapter's end, is no start", () => {
    expect(bookStartOf("resume", seedOf(), null)).toBeNull();
    expect(bookStartOf("resume", seedOf(), { ...KEPT, pos: 930 })).toBeNull();
  });
});

describe("the book's control (F207's book row)", () => {
  it("reads Listen with the chapters, and the sum once every chapter is made", () => {
    expect(bookControlOf(seedOf(6), null, "14 chapters")).toMatchObject({
      form: "listen",
      q: "14 chapters",
    });
    expect(bookControlOf(seedOf("all"), null, "14 chapters")).toMatchObject({
      form: "listen",
      q: "14 chapters · about 3 h",
    });
  });

  it("reads Continue listening at the kept chapter and place", () => {
    expect(bookControlOf(seedOf(), KEPT, "14 chapters")).toMatchObject({
      form: "resume",
      at: "Chapter 6 · 12:30",
      pillQ: "Chapter 6 · 12:30",
      from: 750,
    });
  });

  it("is the note for any Listen of the book, busy from the press, held from the press", () => {
    const seed = seedOf();
    const rest = bookHeadOf({
      listen: null,
      seed,
      kept: null,
      starting: false,
      count: "14 chapters",
    });
    expect(rest.show).toBe("control");
    expect(rest.hold).toEqual([]);
    const busy = bookHeadOf({
      listen: null,
      seed,
      kept: null,
      starting: true,
      count: "14 chapters",
    });
    expect(busy.show).toBe("busy");
    expect(busy.hold.map((n) => n.key)).toEqual([
      "fail-voice",
      "fail-limit",
      "next-waiting",
    ]);
    // A Listen on chapter 9 of this book: the book page shows its note.
    const note = bookHeadOf({
      listen: listenOn("c9", "paused"),
      seed,
      kept: null,
      starting: false,
      count: "14 chapters",
    });
    expect(note.show).toBe("note");
    expect(note.note?.key).toBe("paused");
  });
});

describe("the rows' audio (F209)", () => {
  it("is each chapter's line, with Playing or Paused on the Listen's chapter", () => {
    const rows = bookRowsOf(seedOf(), listenOn("c6", "playing"));
    expect(rows?.c1).toEqual({ line: "Audio 16 min", play: "" });
    expect(rows?.c6).toEqual({ line: "Audio 16 min", play: "Playing" });
    expect(rows?.c8).toEqual({ line: "Audio not prepared yet", play: "" });
    expect(bookRowsOf(seedOf(), listenOn("c6", "paused"))?.c6.play).toBe(
      "Paused",
    );
    expect(bookRowsOf(seedOf(), listenOn("c6", "buffering"))?.c6.play).toBe("");
    // No Listen under way: the chapter being made reads its part.
    expect(bookRowsOf(seedOf(), null)?.c7).toEqual({
      line: "Audio preparing… · part 2 of 9",
      play: "",
    });
  });

  it("draws the line under the title, Playing as status-live and Paused as status", () => {
    const rows: RowView[] = BOOK.chapters.slice(5, 7).map((c) => ({
      key: c.key,
      n: c.n,
      title: c.title,
      lang: c.lang,
      href: c.href,
      updated: false,
      state: null,
      langs: [],
      one: "",
      multiVer: false,
      groups: [],
    })) as unknown as RowView[];
    const html = renderToStaticMarkup(
      createElement(BookChapters, {
        rows,
        audio: {
          c6: { line: "Audio 16 min", play: "Playing" },
          c7: { line: "Audio preparing… · part 2 of 9", play: "" },
        },
      }),
    );
    expect(html).toContain(
      '<span class="row-audio"><span>Audio 16 min</span><span class="status status-live">Playing</span></span>',
    );
    expect(html).toContain(
      '<span class="row-audio"><span>Audio preparing… · part 2 of 9</span></span>',
    );
    const paused = renderToStaticMarkup(
      createElement(BookChapters, {
        rows,
        audio: { c6: { line: "Audio 16 min", play: "Paused" } },
      }),
    );
    expect(paused).toContain('<span class="status">Paused</span>');
  });
});

describe("`.listen-book` (listen:FG2, C01)", () => {
  it("holds the grid and its track for a member, at rest too; a visitor has neither", () => {
    expect(bookTrackOf({ shown: true, listen: null })).toEqual({
      wrap: "listen-book has-track",
      track: true,
    });
    expect(bookTrackOf({ shown: false, listen: null })).toEqual({
      wrap: "listen-book",
      track: false,
    });
  });

  it("draws the member's track empty at rest", () => {
    const html = renderToStaticMarkup(
      createElement(ListenTrack, {
        seed: null,
        shown: true,
        pill: false,
        chapter: false,
        hidden: false,
        signInHref: "/login",
        held: true,
      }),
    );
    expect(html).toBe('<div class="dock-track"></div>');
  });

  it("is the page's wrapper, with the column and the track inside it", () => {
    const src = readFileSync(
      join(__dirname, "../src/components/book/book-body.tsx"),
      "utf8",
    );
    expect(src).toMatch(/<div className=\{track\.wrap\}>/);
    expect(src).toMatch(/track\.track \? \(\s*<ListenTrack/);
    const css = readFileSync(
      join(__dirname, "../src/hi2vi/styles/listen/listen.css"),
      "utf8",
    );
    expect(css).toContain(
      ".listen-book.has-track { display: grid; grid-template-columns: minmax(0, 52em) var(--sheet-w); justify-content: center; column-gap: var(--space-6); }",
    );
    expect(css).toContain(
      ".listen-book.has-track > .dock-track { position: sticky; top: calc(var(--top-h) + var(--space-4));",
    );
  });
});

describe("the book head's slot (F206: its own row under the facts)", () => {
  it("stands after the facts row, a member's only", () => {
    const head = {
      title: "The platform handbook",
      sub: "플랫폼 안내서",
      subLang: "ko",
      description:
        "How the platform is put together, part by part: what a request touches, where a document lives.",
      member: true,
      place: "Codebase book in platform",
      state: { word: "5 of 14 finished", status: "active" },
      pct: 36,
      count: "14 chapters",
    } as unknown as HeadView;
    const slot = createElement("div", { className: "listen-slot" }, "slot");
    const html = renderToStaticMarkup(
      createElement(BookHead, { head, listen: slot }),
    );
    expect(html.indexOf('class="listen-slot"')).toBeGreaterThan(
      html.indexOf('class="book-facts"'),
    );
    expect(html).toMatch(
      /<\/div><div class="listen-slot">slot<\/div><\/header>$/,
    );
    const visitor = renderToStaticMarkup(
      createElement(BookHead, {
        head: { ...head, member: false },
        listen: slot,
      }),
    );
    expect(visitor).not.toContain("listen-slot");
  });
});

describe("the book's Continue reading (F242: at its kept section)", () => {
  const chapters = BOOK.chapters.map((c) => ({
    n: c.n,
    title: c.title,
    lang: c.lang,
    href: `${c.href}?from=library`,
  }));

  it("carries the kept section in its address", () => {
    const plan = planContinue(
      TITLES.map((_, i) => ({
        n: i + 1,
        state: i < 5 ? "finished" : i === 5 ? "started" : "unopened",
        summary: "",
      })) as Parameters<typeof planContinue>[0],
      true,
      { index: 5, section: "", pct: 68 },
    );
    const cont = contOf(plan, chapters, {
      section: "Deduplication",
      sectionId: "deduplication",
      lede: "",
    });
    expect(cont.href).toBe(`${BASE}/c6?from=library#deduplication`);
    const none = contOf(plan, chapters, { section: "", lede: "" });
    expect(none.href).toBe(`${BASE}/c6?from=library`);
  });

  it("names the heading the kept block sits under", () => {
    const blocks = [
      { type: "paragraph", id: "p1" },
      { type: "heading", id: "the-window" },
      { type: "paragraph", id: "p2" },
      { type: "heading", id: "deduplication" },
      { type: "paragraph", id: "p3" },
      { type: "glossary", id: "glossary" },
    ];
    expect(keptSectionId(blocks, "p3")).toBe("deduplication");
    expect(keptSectionId(blocks, "deduplication")).toBe("deduplication");
    expect(keptSectionId(blocks, "p1")).toBe("");
    expect(keptSectionId(blocks, "glossary")).toBe("glossary");
    expect(keptSectionId(blocks, "missing")).toBe("");
  });
});
