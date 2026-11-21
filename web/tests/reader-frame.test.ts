import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The reader's frame (P63-fk.S8; job 03, Library round 02: `Chapter.dc.html`, frame.md F59, F64, F94,
// F100, F327; operator decision 3 of P63-fk: Ask is not shown until the assistant ships).

vi.mock("@/lib/reader/actions", () => ({
  saveReaderPosition: vi.fn(async () => ({ ok: true })),
}));

import { FIGURE_SPACE, READER_FRAME } from "@/content/reader-frame";
import { Bar } from "@/sikstack/library/bar";
import {
  chromeOf,
  endAction,
  endRowsShown,
  endState,
  pillAfterScroll,
  quietBars,
  readerBars,
  scrollBars,
  showBars,
  type ReaderBars,
} from "@/sikstack/reader/model";
import { ReaderEnd } from "@/sikstack/reader/reader-end";
import { ReaderFoot } from "@/sikstack/reader/reader-foot";
import {
  ChapterReader,
  type ChapterReaderProps,
} from "@/sikstack/reader/chapter-reader";
import {
  ReaderLoading,
  ReaderMissing,
  ReaderSegment,
  type ReaderSegmentValue,
} from "@/sikstack/reader/reader-states";
import type { ReaderView } from "@/lib/reader/types";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Scroll the page through `ys` (one event each) on a page that scrolls `max` px, at time `now`. */
function scrollThrough(
  start: ReaderBars,
  ys: number[],
  max = 10_000,
  now = 10_000,
): ReaderBars {
  return ys.reduce((s, y) => scrollBars(s, { y, max, now }), start);
}

describe("the bars while reading (F59): the thresholds at their boundaries", () => {
  it("stay near the top and hide on the way down from 80 px", () => {
    expect(scrollThrough(readerBars(0), [40, 79]).hidden).toBe(false);
    // 80 px is past "near the top": the Bar's rule is `y < 80` (barScroll)
    expect(scrollThrough(readerBars(0), [40, 80]).hidden).toBe(true);
    expect(scrollThrough(readerBars(0), [40, 81]).hidden).toBe(true);
  });

  it("come back after 64 px up, not before", () => {
    const down = scrollThrough(readerBars(0), [300, 500]);
    expect(down.hidden).toBe(true);
    expect(scrollThrough(down, [470, 437]).hidden).toBe(true); // 63 px up
    expect(scrollThrough(down, [470, 436]).hidden).toBe(false); // 64 px up
  });

  it("come back near the top (under 80 px), however little the page went up", () => {
    const down = scrollThrough(readerBars(0), [50, 100]);
    expect(down.hidden).toBe(true);
    expect(scrollThrough(down, [80]).hidden).toBe(true);
    expect(scrollThrough(down, [79]).hidden).toBe(false);
  });

  it("come back at the page's end (within 8 px)", () => {
    const down = scrollThrough(readerBars(0), [500, 900], 1000);
    expect(down.hidden).toBe(true);
    expect(scrollThrough(down, [991], 1000).hidden).toBe(true);
    expect(scrollThrough(down, [992], 1000).hidden).toBe(false);
  });

  it("come back on a tap on the text, and a tap never hides them", () => {
    const down = scrollThrough(readerBars(0), [300, 500]);
    expect(showBars(down).hidden).toBe(false);
    expect(showBars(readerBars(0)).hidden).toBe(false);
  });

  it("stay as they are while a sheet is open", () => {
    const s = scrollBars(readerBars(300), {
      y: 600,
      max: 10_000,
      now: 10_000,
      sheetOpen: true,
    });
    expect(s.hidden).toBe(false);
    expect(s.last).toBe(600);
  });
});

describe("the progress line stays while the bars hide (F59, F100)", () => {
  it("gives the bar its line whether the bars are shown or hidden", () => {
    expect(chromeOf({ hidden: true, pct: 42, pill: false }).bar).toEqual({
      hidden: true,
      progress: 42,
    });
    expect(chromeOf({ hidden: false, pct: 42, pill: false }).bar).toEqual({
      hidden: false,
      progress: 42,
    });
  });

  it("draws the line in a hidden bar (the bar's last 3 px, at the window's top)", () => {
    const html = renderToStaticMarkup(
      createElement(Bar, {
        back: "The platform handbook",
        tools: ["notes", "display"],
        ...chromeOf({ hidden: true, pct: 42, pill: false }).bar,
      }),
    );
    expect(html).toMatch(/class="bar-wrap is-sticky is-hidden"/);
    expect(html).toContain(
      '<div class="bar-line" aria-hidden="true"><i style="width:42%">',
    );
    expect(html).toContain(">Show reading controls</button>");
  });
});

describe("a kept place opens there, with the pill and both bars shown (F64, F100)", () => {
  // `useReading` lands the page at the kept block, else the kept fraction, and says so (`quiet`)
  it("keeps both bars shown while the page lands, and hides them on the reader's first scroll down", () => {
    const start = quietBars(readerBars(0), 1_000, 450);
    const landed = scrollBars(start, { y: 6_800, max: 10_000, now: 1_050 });
    expect(landed.hidden).toBe(false);
    expect(landed.last).toBe(6_800);
    // a late font moves the lines; the landing runs again, still the page's own move
    const again = scrollBars(quietBars(landed, 1_300, 450), {
      y: 6_820,
      max: 10_000,
      now: 1_320,
    });
    expect(again.hidden).toBe(false);
    // the reader's first scroll down hides them
    expect(
      scrollBars(again, { y: 6_900, max: 10_000, now: 3_000 }).hidden,
    ).toBe(true);
  });

  it("keeps the pill through the landing and an event that moved nothing; the first scroll drops it", () => {
    expect(
      pillAfterScroll(true, { moved: true, now: 1_050, quietUntil: 1_450 }),
    ).toBe(true);
    expect(
      pillAfterScroll(true, { moved: false, now: 5_000, quietUntil: 1_450 }),
    ).toBe(true);
    expect(
      pillAfterScroll(true, { moved: true, now: 5_000, quietUntil: 1_450 }),
    ).toBe(false);
  });

  it("shows the kept figure in the line and the foot, the pill over a shown foot bar", () => {
    const c = chromeOf({ hidden: false, pct: 68, pill: true });
    expect(c.bar.progress).toBe(68);
    expect(c.foot).toEqual({ hidden: false, pill: true, pct: 68 });
    const html = renderToStaticMarkup(
      createElement(ReaderFoot, {
        n: 6,
        total: 14,
        prev: "The search index",
        next: "Sessions and sign-in",
        ...c.foot,
      }),
    );
    expect(html).toMatch(/^<div class="reader-foot">/);
    expect(html).toContain(
      '<div class="pill" role="status"><span>Picked up where you left off</span><button type="button" class="link-row">From the top</button></div>',
    );
    expect(html).toContain("Chapter 6 of 14, " + FIGURE_SPACE + "68%");
  });
});

describe("the foot's percentage keeps one width from 0 to 100 (F94, FG12)", () => {
  it("pads the figure to three with figure spaces, set right", () => {
    const widths = new Set<number>();
    for (let pct = 0; pct <= 100; pct++) {
      const where = READER_FRAME.foot.where(6, 14, pct);
      widths.add(where.length);
      expect(where.endsWith(`${pct}%`)).toBe(true);
      expect(where.startsWith("Chapter 6 of 14, ")).toBe(true);
    }
    expect([...widths]).toEqual(["Chapter 6 of 14, 100%".length]);
    expect(READER_FRAME.foot.where(6, 14, 0)).toBe(
      `Chapter 6 of 14, ${FIGURE_SPACE}${FIGURE_SPACE}0%`,
    );
  });

  it("says the figure without its spaces, and sets it in the tabular slot", () => {
    const html = renderToStaticMarkup(
      createElement(ReaderFoot, { n: 6, total: 14, pct: 7, next: "x" }),
    );
    expect(html).toContain('aria-label="Contents. Chapter 6 of 14, 7%"');
    expect(html).toContain(
      `<span class="foot-where">Chapter 6 of 14, ${FIGURE_SPACE}${FIGURE_SPACE}7%</span>`,
    );
  });
});

/** The element tree's nodes, depth first. */
function nodes(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  return [node, ...nodes(props.children)];
}

/** The end's status button: its click, as `ReaderEnd` wires it. */
function pressStatus(state: Parameters<typeof endAction>[0]) {
  const calls: string[] = [];
  const tree = ReaderEnd({
    kind: "chapter",
    state,
    onFinish: () => calls.push("finish"),
    onUnread: () => calls.push("unread"),
    onAsk: () => calls.push("ask"),
  });
  const button = nodes(tree).find(
    (n) =>
      n.type === "button" &&
      nodes((n.props as { children?: ReactNode }).children).some(
        (c) => (c.props as { className?: string }).className === "swap",
      ),
  );
  (button!.props as { onClick: () => void }).onClick();
  return calls;
}

describe("the end's button (F64): one button, the right write", () => {
  it("is Mark as unread on a finished chapter, else Mark as finished; a visitor's offers Sign in to save", () => {
    expect(pressStatus("not-yet")).toEqual(["finish"]);
    expect(pressStatus("unread")).toEqual(["finish"]);
    expect(pressStatus("finished")).toEqual(["unread"]);
    expect(pressStatus("updated")).toEqual(["unread"]);
    expect(pressStatus("visitor")).toEqual(["ask"]);
  });

  it("reads each state's line, and swaps the label in place", () => {
    const html = (state: Parameters<typeof endAction>[0]) =>
      renderToStaticMarkup(
        createElement(ReaderEnd, { kind: "chapter", state }),
      );
    expect(html("not-yet")).toContain(
      "<strong>Not finished yet.</strong> Reading to here marks this chapter finished.",
    );
    expect(html("finished")).toContain(
      '<strong>Finished.</strong> Saved to your progress.</p><button type="button" class="btn" data-swap="true">',
    );
    expect(html("updated")).toContain(
      "You finished an earlier version. This chapter has changed since.",
    );
    expect(html("unread")).toContain(
      '<strong>Not finished.</strong> Marked as unread.</p><button type="button" class="btn" data-swap="false">',
    );
    expect(html("visitor")).toContain(
      "<strong>Not saved.</strong> Signed-out reading isn’t saved.",
    );
  });

  it("maps the reader's memory to the end's state", () => {
    expect(endState({ member: false, saves: false, state: "started" })).toBe(
      "visitor",
    );
    expect(endState({ member: true, saves: false, state: "started" })).toBe(
      null,
    );
    expect(endState({ member: true, saves: true, state: "started" })).toBe(
      "not-yet",
    );
    expect(endState({ member: true, saves: true, state: "updated" })).toBe(
      "updated",
    );
    expect(endRowsShown({ total: 1, finished: true, last: true })).toBe(false);
    expect(endRowsShown({ total: 14, finished: false, last: false })).toBe(
      false,
    );
    expect(endRowsShown({ total: 14, finished: true, last: false })).toBe(true);
    expect(endRowsShown({ total: 14, finished: false, last: true })).toBe(true);
  });
});

// ---- no Ask anywhere --------------------------------------------------------------------------------

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
} as unknown as AppRouterInstance;

function view(over: Partial<ReaderView> = {}): ReaderView {
  const target = {
    kind: "chapter" as const,
    org: "june",
    project: "platform",
    book: "handbook",
    chapter: "c6",
  };
  const row = (n: number) => ({
    key: `c${n}`,
    n,
    title: `Chapter title ${n}`,
    lang: "en",
    format: "native" as const,
    href: `/@june/platform/books/handbook/c${n}`,
    current: n === 6,
  });
  return {
    kind: "chapter",
    member: true,
    title: "How capture deduplicates feedback",
    lang: "en",
    langs: [
      { lang: "en", label: "English" },
      { lang: "ko", label: "한국어" },
    ],
    version: 3,
    newest: 3,
    summary: "A lede.",
    date: "2026-11-02",
    project: "platform",
    staleSource: null,
    target,
    write: { org: "june", project: "platform", doc: "2026-11-02-c6" },
    progress: {
      state: "started",
      finishedVersion: null,
      maxFraction: 0.68,
      resume: { block: null, fraction: 0.68 },
    },
    versions: {
      ok: true,
      label: "English",
      rows: [
        { n: 3, date: "2026-11-02", from: null },
        { n: 2, date: "2026-10-01", from: null },
      ],
    },
    book: {
      title: "The platform handbook",
      backHref: "/@june/platform/books/handbook",
      n: 6,
      total: 14,
      prev: { title: "The search index", lang: "en", href: row(5).href, n: 5 },
      next: {
        title: "Sessions and sign-in",
        lang: "en",
        href: row(7).href,
        n: 7,
        summary: "Next lede.",
      },
      chapters: Array.from({ length: 14 }, (_, i) => row(i + 1)),
      finished: 5,
    },
    headings: [
      { id: "s1", level: 2, text: "One" },
      { id: "s2", level: 2, text: "Two" },
    ],
    settings: { size: 3, theme: "sepia" },
    ...over,
  };
}

const inApp = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: router }, el),
  );

describe("no Ask anywhere, whatever the props (decision 3, F327)", () => {
  const cases: [string, ReaderView][] = [
    ["a member", view()],
    ["a visitor", view({ member: false, write: null, progress: null })],
    ["one language", view({ langs: [{ lang: "en", label: "English" }] })],
    ["an older version", view({ version: 2 })],
  ];
  for (const [name, v] of cases)
    it(`the chapter's frame for ${name}: Notes and Display, no Ask, no side panel`, () => {
      const html = inApp(
        createElement(
          ChapterReader,
          { view: v, notes: true } as ChapterReaderProps,
          createElement("p", null, "the text"),
        ),
      );
      expect(html).toContain(">Notes</button>");
      expect(html).toContain('<span class="bar-long">Display</span>');
      expect(html).not.toMatch(/>Ask</);
      expect(html).not.toContain("reader-side");
      expect(html).not.toContain("has-side");
    });

  it("the reader's root carries the scheme and the size; System leaves the scheme to the device", () => {
    expect(
      inApp(
        createElement(ChapterReader, { view: view() } as ChapterReaderProps),
      ),
    ).toContain('class="app bare reader" data-scheme="sepia" data-size="3"');
    const system = inApp(
      createElement(ChapterReader, {
        view: view({ settings: { size: 5, theme: "system" } }),
      } as ChapterReaderProps),
    );
    expect(system).toContain('class="app bare reader" data-size="5"');
  });

  it("Loading and Chapter not found: no Ask either", () => {
    for (const member of [true, false]) {
      const seg = (child: ReactElement) =>
        inApp(
          createElement(
            ReaderSegment,
            {
              member,
              settings: { size: 3, theme: "dark" },
            } as ReaderSegmentValue & { children: ReactNode },
            child,
          ),
        );
      const loading = seg(createElement(ReaderLoading));
      expect(loading).toContain('aria-busy="true"');
      expect(loading).toContain('<span class="sr-only">Loading…</span>');
      expect(loading).toContain('data-scheme="dark"');
      expect(loading).not.toMatch(/>Ask</);
      const missing = seg(createElement(ReaderMissing));
      expect(missing).toContain("Chapter not found");
      expect(missing).not.toMatch(/>Ask</);
    }
  });
});
