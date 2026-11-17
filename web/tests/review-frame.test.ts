import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookRow, Counts, ReviewQueue } from "@/lib/review/types";

// `/review` in Review's focused frame (job 07-listen-review, round 01: frame.md F201, F215, F218 to F221, F227;
// `Review.dc.html`, `Focus.dc.html`, `DueHead.dc.html`, `Schedule.dc.html`). The claims of P64-3y.S7: the bar's
// progress figure, the head's rows and note from the queue payload, the settings save's `PATCH /profile` payload,
// Display's cookie (one setting with the reader) and one queue read per page load. The look is checked in Chrome
// by the fidelity slices; here, the pure models and the server render.

const actions = vi.hoisted(() => ({
  loadReviewQueue: vi.fn(),
  loadReviewContinue: vi.fn(async () => null),
  rateReviewCard: vi.fn(),
  saveReviewSettings: vi.fn(),
  setReviewCardStatus: vi.fn(),
}));
vi.mock("@/lib/review/actions", () => actions);
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({ token: "tok" })),
}));
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "kb_reader" && jar.value !== undefined
        ? { name, value: jar.value }
        : undefined,
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  usePathname: () => "/review",
}));

const model = await import("@/hi2vi/review/model");
const { REVIEW } = await import("@/content/review");
const { parseReaderCookie, READER_COOKIE } =
  await import("@/lib/reader-cookie");
const ReviewPage = (await import("@/app/review/page")).default;
const { ReviewLoading, Schedule } = await import("@/hi2vi/review");

const web = fileURLToPath(new URL("..", import.meta.url));

// june's day (frame.md F213): 7 due, 33 new highlights, 12 done today; two books, then documents of three projects.
const BY_BOOK: BookRow[] = [
  {
    org: "june",
    project: "platform",
    book: null,
    book_title: null,
    due: 1,
    new: 4,
  },
  {
    org: "june",
    project: "platform",
    book: "handbook",
    book_title: "The platform handbook",
    due: 5,
    new: 1,
  },
  {
    org: "june",
    project: "bootstrap_agentic_workspace",
    book: "workspace",
    book_title: "How the workspace was built",
    due: 0,
    new: 25,
  },
  {
    org: "june",
    project: "vocky",
    book: null,
    book_title: null,
    due: 1,
    new: 2,
  },
  {
    org: "june",
    project: "bootstrap_agentic_workspace",
    book: null,
    book_title: null,
    due: 0,
    new: 1,
  },
];
const COUNTS: Counts = {
  due: 7,
  new_highlights: 33,
  done_today: 12,
  by_book: BY_BOOK,
};
const PROFILE = {
  time_zone: "Asia/Seoul",
  day_starts_at_hour: 4,
  max_reviews_per_day: 200,
  new_highlights_per_day: 40,
};

function queue(over: Partial<ReviewQueue> = {}): ReviewQueue {
  return {
    now: "2026-11-17T01:00:00.000Z",
    day: {
      start: "2026-11-16T19:00:00.000Z",
      end: "2026-11-17T19:00:00.000Z",
      time_zone: "Asia/Seoul",
    },
    profile: PROFILE,
    counts: COUNTS,
    limit_reached: null,
    next_due_at: "2026-11-18T00:30:00.000Z",
    cards: [],
    ...over,
  };
}

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe("the bar's progress line (F201, F227.1)", () => {
  it("is done ÷ (done + due + new), june's day at 23%", () => {
    expect(model.focusProgress("ready", COUNTS)).toBe(23);
    expect(
      model.focusProgress("ready", {
        ...COUNTS,
        due: 0,
        new_highlights: 0,
        done_today: 52,
      }),
    ).toBe(100);
  });
  it("is 0 while loading, failed, or with nothing today", () => {
    expect(model.focusProgress("loading", COUNTS)).toBe(0);
    expect(model.focusProgress("failed", COUNTS)).toBe(0);
    expect(
      model.focusProgress("ready", {
        ...COUNTS,
        due: 0,
        new_highlights: 0,
        done_today: 0,
      }),
    ).toBe(0);
  });
});

describe("Review's head (F215) from the queue payload", () => {
  it("lists each book in the payload's order, then one row for every document not in a book", () => {
    expect(model.dueRows(BY_BOOK)).toEqual([
      {
        key: "june/platform/handbook",
        title: "The platform handbook",
        sub: "platform · book",
        dueText: "5 due",
        newText: "1 new highlight",
      },
      {
        key: "june/bootstrap_agentic_workspace/workspace",
        title: "How the workspace was built",
        sub: "bootstrap_agentic_workspace · book",
        dueText: "0 due",
        newText: "25 new highlights",
      },
      {
        key: "loose",
        title: "Documents not in a book",
        sub: "",
        dueText: "2 due",
        newText: "7 new highlights",
      },
    ]);
  });
  it("draws no documents row when every card is in a book, and keeps a Korean title", () => {
    expect(
      model.dueRows([
        {
          org: "june",
          project: "platform",
          book: "kb",
          book_title: "색인을 지우기 전에 읽는 책",
          due: 1,
          new: 0,
        },
      ]),
    ).toEqual([
      {
        key: "june/platform/kb",
        title: "색인을 지우기 전에 읽는 책",
        sub: "platform · book",
        dueText: "1 due",
        newText: "0 new highlights",
      },
    ]);
  });

  const N = REVIEW.head.notes;
  const head = (over: Partial<ReviewQueue>, cards = 0) => {
    const q = queue(over);
    return model.dueHeadOf({
      status: "ready",
      meta: q,
      queue: Array.from({ length: cards }, () => ({}) as never),
    });
  };

  it("says what the rows are while cards are shown", () => {
    // a full read (50 cards) holds nothing back
    const h = head({}, 50);
    expect(h.kind).toBe("card");
    expect(h.note).toBe(N.mixed);
    expect(h.counts).toEqual({ due: 7, nw: 33, done: 12 });
    expect(h.rows).toHaveLength(3);
  });
  it("adds the held new highlights when the queue holds fewer than are new", () => {
    expect(head({}, 3).note).toBe(N.mixed + N.heldNew);
  });
  it("names the reviews limit, the new-highlights limit and the pause at each end", () => {
    expect(head({ limit_reached: "reviews" }).note).toBe(
      "You reached today’s limit of 200 reviews, so these wait for tomorrow.",
    );
    expect(head({ limit_reached: "new_highlights" }).note).toBe(
      "You reached today’s limit of 40 new highlights, so these wait for tomorrow.",
    );
    expect(
      head({
        limit_reached: "new_highlights",
        profile: { ...PROFILE, new_highlights_per_day: 0 },
      }).note,
    ).toBe("New highlights are paused, so these wait.");
  });
  it("says nothing is due when the payload has no rows", () => {
    const h = head({
      counts: { due: 0, new_highlights: 0, done_today: 52, by_book: [] },
    });
    expect(h.kind).toBe("done");
    expect(h.rows).toEqual([]);
    expect(h.note).toBe(N.none);
  });
  it("has no end kind while loading or failed", () => {
    const q = queue();
    expect(
      model.dueHeadOf({ status: "loading", meta: q, queue: [] }).kind,
    ).toBeNull();
    expect(
      model.dueHeadOf({ status: "failed", meta: q, queue: [] }).kind,
    ).toBeNull();
  });
});

describe("Review settings' save (F219): the same PATCH /profile payload", () => {
  it("sends the time zone and the two limits as whole numbers", () => {
    expect(
      model.settingsPlan({ tz: "Asia/Seoul", max: " 200 ", maxNew: "40" }),
    ).toEqual({
      ok: true,
      input: {
        time_zone: "Asia/Seoul",
        max_reviews_per_day: 200,
        new_highlights_per_day: 40,
      },
    });
    expect(model.settingsPlan({ tz: "UTC", max: "1", maxNew: "0" })).toEqual({
      ok: true,
      input: {
        time_zone: "UTC",
        max_reviews_per_day: 1,
        new_highlights_per_day: 0,
      },
    });
  });
  it("refuses a number outside its range, a fraction or a word, and sends nothing", () => {
    for (const [max, maxNew, bad] of [
      ["0", "40", { max: true, maxNew: false }],
      ["1000", "40", { max: true, maxNew: false }],
      ["2.5", "40", { max: true, maxNew: false }],
      ["", "40", { max: true, maxNew: false }],
      ["200", "-1", { max: false, maxNew: true }],
      ["200", "forty", { max: false, maxNew: true }],
      ["abc", "1000", { max: true, maxNew: true }],
    ] as const) {
      expect(model.settingsPlan({ tz: "Asia/Seoul", max, maxNew })).toEqual({
        ok: false,
        errors: bad,
      });
    }
  });
  it("is what the page sends: the frame passes the plan's input to saveReviewSettings", () => {
    const src = readFileSync(`${web}src/hi2vi/review/review-frame.tsx`, "utf8");
    // the two sends of the profile: the save, and the first review's time zone (unchanged)
    expect(
      [...src.matchAll(/saveReviewSettings\(([^)]*)\)/g)].map((m) => m[1]),
    ).toEqual(["{ time_zone: tz }", "plan.input"]);
  });
});

describe("Display (F220): one setting with the reader", () => {
  it("writes the reader's own cookie, keeping the library's grouping", () => {
    const next = model.withDisplay(
      { size: 3, theme: "system", libraryGroup: "subject" },
      { theme: "dark" },
      false,
    );
    expect(next.settings).toEqual({
      size: 3,
      theme: "dark",
      libraryGroup: "subject",
    });
    expect(next.cookie.startsWith(`${READER_COOKIE}=`)).toBe(true);
    const value = next.cookie.slice(READER_COOKIE.length + 1).split(";")[0];
    expect(parseReaderCookie(value)).toEqual(next.settings);
    expect(next.cookie).not.toMatch(/Secure/);
    expect(model.withDisplay(next.settings, { size: 5 }, true).cookie).toMatch(
      /size=5&theme=dark&libraryGroup=subject; Path=\/; .*; Secure$/,
    );
  });
  it("sets the frame's scheme for Light, Dark and Sepia; System follows the device", () => {
    expect(model.frameScheme("system")).toBeUndefined();
    expect(model.frameScheme("light")).toBe("light");
    expect(model.frameScheme("dark")).toBe("dark");
    expect(model.frameScheme("sepia")).toBe("sepia");
  });
});

describe("/review in the focused frame (F201)", () => {
  beforeEach(() => {
    actions.loadReviewQueue.mockReset();
    actions.loadReviewContinue.mockClear();
    jar.value = undefined;
  });

  it("makes one queue read on load", async () => {
    actions.loadReviewQueue.mockResolvedValue({ ok: true, data: queue() });
    html(await ReviewPage());
    expect(actions.loadReviewQueue).toHaveBeenCalledTimes(1);
  });

  it("is the focused frame: Focus, the column with the head, the toast region; no old bar, line, scrim or sheet", async () => {
    jar.value = "size=4&theme=sepia";
    actions.loadReviewQueue.mockResolvedValue({
      ok: true,
      data: queue({
        counts: { ...COUNTS, due: 0, new_highlights: 0, done_today: 52 },
      }),
    });
    const out = html(await ReviewPage());
    expect(out).toMatch(
      /<div class="app bare focus" data-scheme="sepia" data-size="4"/,
    );
    expect(out).toMatch(/<main class="app-main focus-main" id="main-content"/);
    expect(out).toMatch(/<div class="focus-col"><header class="due-head"/);
    expect(out).toMatch(
      /<div class="toast-region" role="status" aria-live="polite">/,
    );
    // the bar: the wordmark and Library to the library, Settings and Display; the line at 100%
    expect(out).toMatch(
      /<a class="mark" aria-label="hi2vi, home" href="\/library">hi2vi<\/a>/,
    );
    expect(out).toMatch(
      /<a class="back bar-back" href="\/library"><span>Library<\/span><\/a>/,
    );
    expect(out).toMatch(
      /aria-haspopup="dialog" aria-expanded="false">Settings<\/button>/,
    );
    expect(out).toMatch(
      /role="progressbar" aria-label="Today’s reviews" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-valuetext="100% of today’s cards done"><i style="width:100%"><\/i>/,
    );
    // the two sheets are the Library's dialog, closed
    expect(out.match(/<dialog class="sheet at-end"/g)).toHaveLength(2);
    expect(out).not.toMatch(/rd-top|rd-line|rd-scrim|rd-sheet|an-slot/);
    // the end is the old view, bridged in the flow until S9
    expect(out).toMatch(/data-ui-legacy=""><div class="rd-root rd-size-4"/);
  });

  it("bridges the old card in the flow until S8, under the head and june's 23%", async () => {
    const korean = {
      card_id: "4f2b8c1e-6a3d-4e7f-9b21-0c5d8e7f6a10",
      source: "highlight",
      item_type: "highlight",
      status: "active",
      state: "new",
      reset: false,
      reps: 0,
      lapses: 0,
      due: "2026-11-17T00:00:00.000Z",
      last_review: null,
      created_at: "2026-11-10T03:00:00.000Z",
      where: {
        org: "june",
        project: "platform",
        book: null,
        book_title: null,
        chapter_key: null,
        chapter_title: "색인 다시 만들기",
        chapter_index: null,
        chapter_count: null,
        doc: "2026-11-10-reindex",
        lang: "ko",
        version: 1,
        block_id: "s2",
        href: "/@june/platform/reindex#s2",
        block_title: "지우기 전에",
      },
      front: {
        quote:
          "색인을 지우기 전에 새 색인이 모든 문서를 다시 읽었는지 확인하세요. 그렇지 않으면 검색이 잠시 빈 결과를 돌려줍니다.",
        block_title: "지우기 전에",
        note: "Check the count of documents first, then swap the alias.",
        lang: "ko",
      },
      back: null,
      previews: {
        again: { due: "2026-11-17T01:10:00.000Z", interval: 10 },
        good: { due: "2026-11-18T01:00:00.000Z", interval: 1440 },
      },
    };
    actions.loadReviewQueue.mockResolvedValue({
      ok: true,
      data: queue({ cards: [korean as never] }),
    });
    const out = html(await ReviewPage());
    expect(actions.loadReviewQueue).toHaveBeenCalledTimes(1);
    expect(out).toMatch(/aria-valuenow="23"/);
    expect(out).toContain(
      '<strong>7</strong> due</span><span aria-hidden="true">·</span><span><strong>33</strong> new highlights</span>',
    );
    expect(out).toMatch(
      /<\/header><div data-ui-legacy=""><div class="rd-root rd-size-3"[^>]*><div style="container-type:inline-size;container-name:rd"><article class="rv-card"/,
    );
    expect(out).toContain(
      'data-rv-card="4f2b8c1e-6a3d-4e7f-9b21-0c5d8e7f6a10"',
    );
  });

  it("shows the failure under Review alone, with the reference, and an empty line", async () => {
    actions.loadReviewQueue.mockResolvedValue({
      ok: false,
      ref: "rv-7f3a2c91",
    });
    const out = html(await ReviewPage());
    expect(out).toContain(
      '<div class="focus-col"><header class="due-head"><h1>Review</h1></header><div class="rv-failed" role="alert"',
    );
    expect(out).toContain('<p class="meta">Error · 500</p>');
    expect(out).toContain("<h2>Something on our side stopped reading.</h2>");
    expect(out).toContain(
      '<button type="button" class="btn btn-primary">Try again</button><p class="meta">ref · rv-7f3a2c91</p>',
    );
    expect(out).toMatch(/aria-valuenow="0"/);
    expect(out).not.toMatch(/due-counts|by-book/);
  });
});

describe("Loading (F221)", () => {
  it("keeps the bar whole with an empty line, the head's counts a skeleton, and the card's skeleton", () => {
    const out = html(
      createElement(ReviewLoading, { settings: { size: 3, theme: "dark" } }),
    );
    expect(out).toMatch(
      /<div class="app bare focus" data-scheme="dark" data-size="3"/,
    );
    expect(out).toMatch(/aria-valuenow="0" aria-valuetext="Loading"/);
    expect(out).toMatch(
      /<main class="app-main focus-main" id="main-content" aria-busy="true">/,
    );
    expect(out).toContain(
      '<p class="due-counts"><span class="skel" style="width:18em"></span><span class="sr-only">Loading your cards…</span></p>',
    );
    expect(out).toMatch(
      /class="link-row by-book-btn" aria-expanded="false" aria-controls="[^"]+" aria-disabled="true">By book</,
    );
    expect(out).toContain('<div class="card-page rv-sk" aria-hidden="true">');
    expect(out.match(/class="skel rv-sk-opt"/g)).toHaveLength(4);
    expect(out).toContain('style="width:95%"');
    expect(out).toContain('style="width:70%"');
  });
});

describe("Schedule (F219): rest, invalid, saving, failed", () => {
  const draft = { tz: "Asia/Seoul", max: "200", maxNew: "40" };
  const props = {
    draft,
    attempt: 0,
    zones: ["Asia/Seoul", "UTC"],
    onField() {},
    onSave() {},
    onCancel() {},
  };
  it("rests with the lead, three fields and their hints, the 04:00 note and Save settings", () => {
    const out = html(createElement(Schedule, { ...props, phase: "rest" }));
    expect(out).toMatch(/^<form class="schedule" noValidate="">/);
    expect(out).toContain(
      "<p>These apply to all your cards, on every device.</p>",
    );
    expect(out).toMatch(
      /<option value="Asia\/Seoul" selected="">Asia\/Seoul<\/option>/,
    );
    expect(out).toContain(
      '<p class="meta">Your review day starts at 04:00, so a review after midnight still counts for the day before.</p>',
    );
    expect(out).toContain(
      '<button type="submit" class="btn btn-primary" data-busy="false" data-swap="false"><span class="swap"><span>Save settings</span><span>Saving…</span></span></button>',
    );
    expect(out).not.toMatch(/field-error|notice/);
  });
  it("shows each bad field's error under its hint, and only then", () => {
    const out = html(
      createElement(Schedule, {
        ...props,
        draft: { ...draft, max: "0" },
        phase: "invalid",
      }),
    );
    expect(out).toMatch(
      /aria-invalid="true" aria-describedby="[^"]+-max-hint [^"]+-max-error"/,
    );
    expect(out).toContain('class="field-error" id="');
    expect(out).toContain(">Enter a whole number from 1 to 999.</p>");
    expect(out).not.toContain("Enter a whole number from 0 to 999.");
  });
  it("says Saving… in the button's width, and Try again under the notice when it failed", () => {
    expect(
      html(createElement(Schedule, { ...props, phase: "saving" })),
    ).toMatch(
      /data-busy="true" data-swap="false"><span class="swap"><span>Save settings<\/span><span>Saving…<\/span>/,
    );
    const failed = html(createElement(Schedule, { ...props, phase: "failed" }));
    expect(failed).toMatch(
      /^<form class="schedule" noValidate=""><p class="notice notice-danger" role="alert">Not saved · check your connection<\/p>/,
    );
    expect(failed).toMatch(
      /data-busy="false" data-swap="true"><span class="swap"><span>Save settings<\/span><span>Try again<\/span>/,
    );
  });
});
