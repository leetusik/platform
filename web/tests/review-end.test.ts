import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Counts, Profile, ReviewQueue } from "@/lib/review/types";

// The end of a review session on `/review` (job 07-listen-review, round 01: frame.md F214, F235 to F237, F241, F242;
// `ReviewEnd.dc.html`, `ReviewEndBody.dc.html`). The claims of P64-3y.S9: each end kind from the queue payload (done, the
// reviews limit, the new-highlights limit, paused at 0 new a day, none) with its words; the save that lifts the limit
// that ended the session (and only that save) brings the held cards back; the day start is the profile's hour; the
// Continue line's `Chapter n of N` and `p% read` come from the continue read. The look is checked in Chrome by the
// fidelity slices; here, the pure models and the server render.

const actions = vi.hoisted(() => ({
  loadReviewQueue: vi.fn(),
  loadReviewContinue: vi.fn(),
  rateReviewCard: vi.fn(),
  saveReviewSettings: vi.fn(),
  setReviewCardStatus: vi.fn(),
}));
vi.mock("@/lib/review/actions", () => actions);
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({ token: "tok" })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  usePathname: () => "/review",
}));

const end = await import("@/hi2vi/review/end-model");
const { endKind } = await import("@/lib/review/model");
const ReviewPage = (await import("@/app/review/page")).default;
const { ReviewEndBody } = await import("@/hi2vi/review");

const html = (el: ReactElement) => renderToStaticMarkup(el);

// june's profile (frame.md F213): the product's day start, 04:00; the two limits in force.
const PROFILE: Profile = {
  time_zone: "Asia/Seoul",
  day_starts_at_hour: 4,
  max_reviews_per_day: 200,
  new_highlights_per_day: 40,
};
const counts = (due: number, nw: number, done: number): Counts => ({
  due,
  new_highlights: nw,
  done_today: done,
  by_book:
    due + nw > 0
      ? [
          {
            org: "june",
            project: "platform",
            book: "handbook",
            book_title: "The platform handbook",
            due,
            new: nw,
          },
        ]
      : [],
});

function queue(over: Partial<ReviewQueue> = {}): ReviewQueue {
  return {
    now: "2026-11-17T01:00:00.000Z",
    day: {
      start: "2026-11-16T19:00:00.000Z",
      end: "2026-11-17T19:00:00.000Z",
      time_zone: "Asia/Seoul",
    },
    profile: PROFILE,
    counts: counts(0, 0, 52),
    limit_reached: null,
    // tomorrow at 09:30 in Seoul
    next_due_at: "2026-11-18T00:30:00.000Z",
    cards: [],
    ...over,
  };
}

/** The end view the page draws for a queue payload, as the frame computes it. */
function viewOf(q: ReviewQueue) {
  const kind = endKind({
    cards: q.cards.length,
    counts: q.counts,
    limit_reached: q.limit_reached,
    profile: q.profile,
    next_due_at: q.next_due_at,
  });
  if (kind === "card") throw new Error("not an end");
  return end.endView(kind, q);
}

// The five ends with june's held figures (F235, review-end FG3).
const DONE = queue();
const LIMIT = queue({
  counts: counts(0, 2, 50),
  limit_reached: "reviews",
  profile: { ...PROFILE, max_reviews_per_day: 50 },
});
const NEW_LIMIT = queue({
  counts: counts(0, 3, 49),
  limit_reached: "new_highlights",
});
const PAUSED = queue({
  counts: counts(0, 33, 19),
  limit_reached: "new_highlights",
  profile: { ...PROFILE, new_highlights_per_day: 0 },
});
const NONE = queue({ counts: counts(0, 0, 0), next_due_at: null });

// The continue read's pointer (lib/library/continue.ts's first item, as loadReviewContinue maps it).
const CONT = {
  title: "Capture: from a widget to a message",
  lede: "The platform handbook · Chapter 6 of 14 · 68% read",
  href: "/@june/platform/books/handbook/capture",
  lang: "en",
  book: "The platform handbook",
  chapter: { n: 6, total: 14 },
  pct: 68,
};

describe("each end kind from the queue payload (F214, F236, F237)", () => {
  it("done: the state word, every card due today, the next due in the viewer's zone", () => {
    expect(viewOf(DONE)).toEqual({
      kind: "done",
      mark: true,
      title: "That’s every card due today.",
      sentences: [
        "You reviewed 52 cards today.",
        "The next card is due tomorrow at 09:30, your time.",
      ],
      limits: false,
      library: false,
    });
  });

  it("the reviews limit: its figure, the held new highlights, the day start, and Change your daily limits →", () => {
    expect(viewOf(LIMIT)).toEqual({
      kind: "limit",
      mark: true,
      title: "You reached today’s limit of 50 reviews.",
      sentences: [
        "2 new highlights are due, and they wait for tomorrow.",
        "Your next review day starts at 04:00.",
      ],
      limits: true,
      library: false,
    });
  });

  it("the new-highlights limit", () => {
    expect(viewOf(NEW_LIMIT)).toEqual({
      kind: "new-limit",
      mark: true,
      title: "Your reviews are done, and so are today’s 40 new highlights.",
      sentences: [
        "3 more new highlights wait for tomorrow.",
        "Your next review day starts at 04:00.",
      ],
      limits: true,
      library: false,
    });
  });

  it("paused at 0 new highlights a day", () => {
    expect(viewOf(PAUSED)).toEqual({
      kind: "paused",
      mark: true,
      title: "Your reviews are done. New highlights are paused.",
      sentences: [
        "33 new highlights wait.",
        "They join your reviews when New highlights a day is above 0.",
      ],
      limits: true,
      library: false,
    });
  });

  it("none: no state word, no limits, Open the library →", () => {
    expect(viewOf(NONE)).toEqual({
      kind: "none",
      mark: false,
      title: "No review cards yet",
      sentences: [
        "A card is made when you answer a quiz question in a chapter, or turn on Review this on a highlight.",
        "It comes back here when it is due.",
      ],
      limits: false,
      library: true,
    });
  });

  it("names a next due days off month first (F227's Oct 23 as Nov 20)", () => {
    // 22:15 UTC on the 19th is 07:15 on the 20th in Seoul
    const v = viewOf(queue({ next_due_at: "2026-11-19T22:15:00.000Z" }));
    expect(v.sentences[1]).toBe(
      "The next card is due on Nov 20 at 07:15, your time.",
    );
  });
});

describe("the day start is the profile's hour, never a setting (F214, F242)", () => {
  it("reads day_starts_at_hour", () => {
    const v = viewOf({
      ...LIMIT,
      profile: { ...LIMIT.profile, day_starts_at_hour: 5 },
    });
    expect(v.sentences[1]).toBe("Your next review day starts at 05:00.");
    const n = viewOf({
      ...NEW_LIMIT,
      profile: { ...NEW_LIMIT.profile, day_starts_at_hour: 0 },
    });
    expect(n.sentences[1]).toBe("Your next review day starts at 00:00.");
  });
});

describe("a save on the end (F237, review-end FG6)", () => {
  const lifts = (q: ReviewQueue, after: Partial<Profile>) =>
    end.saveLifts(viewOf(q).kind, q.counts, q.profile, {
      ...q.profile,
      ...after,
    });

  it("the reviews limit lifts when Reviews a day is above the done count, and only then", () => {
    expect(lifts(LIMIT, { max_reviews_per_day: 60 })).toBe(true);
    expect(lifts(LIMIT, { max_reviews_per_day: 51 })).toBe(true);
    expect(lifts(LIMIT, { max_reviews_per_day: 50 })).toBe(false);
    expect(lifts(LIMIT, { new_highlights_per_day: 80 })).toBe(false);
  });

  it("the new-highlights limit lifts when New highlights a day is raised, and only then", () => {
    expect(lifts(NEW_LIMIT, { new_highlights_per_day: 41 })).toBe(true);
    expect(lifts(NEW_LIMIT, { new_highlights_per_day: 40 })).toBe(false);
    expect(lifts(NEW_LIMIT, { new_highlights_per_day: 20 })).toBe(false);
    expect(lifts(NEW_LIMIT, { max_reviews_per_day: 999 })).toBe(false);
  });

  it("paused lifts when New highlights a day is above 0, and only then", () => {
    expect(lifts(PAUSED, { new_highlights_per_day: 1 })).toBe(true);
    expect(lifts(PAUSED, { new_highlights_per_day: 0 })).toBe(false);
    expect(lifts(PAUSED, { max_reviews_per_day: 999 })).toBe(false);
  });

  it("done and none have nothing to lift", () => {
    expect(lifts(DONE, { max_reviews_per_day: 999 })).toBe(false);
    expect(lifts(NONE, { new_highlights_per_day: 999 })).toBe(false);
  });
});

describe("Continue reading's line from the continue read (F214, review-end FG5)", () => {
  it("is the book, then Chapter n of N and p% read as one group", () => {
    expect(end.contView(CONT)).toEqual({
      title: "Capture: from a widget to a message",
      lang: "en",
      href: "/@june/platform/books/handbook/capture",
      book: "The platform handbook",
      facts: ["Chapter 6 of 14", "68% read"],
    });
  });

  it("follows the read's own figures", () => {
    const v = end.contView({
      ...CONT,
      book: "How the workspace was built",
      chapter: { n: 3, total: 9 },
      pct: 12,
    });
    expect(v.book).toBe("How the workspace was built");
    expect(v.facts).toEqual(["Chapter 3 of 9", "12% read"]);
  });

  it("an offered next chapter has no share read; a loose document is its project's", () => {
    expect(end.contView({ ...CONT, pct: null }).facts).toEqual([
      "Chapter 6 of 14",
    ]);
    expect(
      end.contView({ ...CONT, book: "platform", chapter: null, pct: 40 }).facts,
    ).toEqual(["Document", "40% read"]);
  });
});

describe("ReviewEndBody (ReviewEndBody.dc.html)", () => {
  const body = (q: ReviewQueue, cont: typeof CONT | null) =>
    html(
      createElement(ReviewEndBody, {
        view: viewOf(q),
        cont: cont ? end.contView(cont) : null,
        onLimits() {},
      }),
    );

  it("is the card's page with the state word, one span per sentence, Change your daily limits → and Continue reading", () => {
    const out = body(LIMIT, CONT);
    expect(out).toMatch(
      /^<div class="stack gap-6"><section class="card-page end-page" tabindex="-1" aria-labelledby="[^"]+" data-rv-end="limit"><p class="say"><span class="status status-done">Done for today<\/span><\/p><div class="stack gap-1"><div class="stack gap-2"><h2 id="[^"]+" class="end-title">You reached today’s limit of 50 reviews\.<\/h2><p class="end-text"><span>2 new highlights are due, and they wait for tomorrow\.<\/span><span>Your next review day starts at 04:00\.<\/span><\/p><\/div><div class="cluster"><button type="button" class="link-row" aria-haspopup="dialog">Change your daily limits →<\/button><\/div><\/div><\/section>/,
    );
    expect(out).toContain('<div class="section-head"><h3 id="');
    expect(out).toContain(
      '<div class="panel"><div class="panel-body end-next"><div class="row-stack"><p class="end-next-title" lang="en">Capture: from a widget to a message</p><p class="dim facts"><span class="facts-in"><span class="fact">The platform handbook</span><span class="fact"><span class="facts"><span class="facts-in"><span class="fact">Chapter 6 of 14</span><span class="fact">68% read</span></span></span></span></span></p></div><a class="btn btn-primary" href="/@june/platform/books/handbook/capture">Continue reading →</a></div></div></section></div>',
    );
  });

  it("done has the state word and no Change your daily limits →", () => {
    const out = body(DONE, CONT);
    expect(out).toContain(
      '<p class="say"><span class="status status-done">Done for today</span></p>',
    );
    expect(out).not.toContain("Change your daily limits");
    expect(out).toContain('data-rv-end="done"');
  });

  it("omits Continue reading with no pointer", () => {
    const out = body(DONE, null);
    expect(out).not.toContain("Continue reading");
    expect(out).toMatch(/<\/section><\/div>$/);
  });

  it("none: no state word, Open the library → as the primary, no Continue reading", () => {
    const out = body(NONE, CONT);
    expect(out).not.toContain("Done for today");
    expect(out).toContain(
      '<div class="cluster"><a class="btn btn-primary" href="/library">Open the library →</a></div></section></div>',
    );
    expect(out).not.toContain("Continue reading");
  });
});

describe("/review on an end (F236, F241)", () => {
  beforeEach(() => {
    actions.loadReviewQueue.mockReset();
    actions.loadReviewContinue.mockReset();
  });

  it("draws Review's own end under the head with the held counts, no old view", async () => {
    actions.loadReviewQueue.mockResolvedValue({ ok: true, data: LIMIT });
    actions.loadReviewContinue.mockResolvedValue(CONT);
    const out = html(await ReviewPage());
    expect(actions.loadReviewContinue).toHaveBeenCalledTimes(1);
    expect(out).toContain(
      '<strong>0</strong> due</span><span aria-hidden="true">·</span><span><strong>2</strong> new highlights</span>',
    );
    expect(out).toMatch(
      /<\/header><div class="stack gap-6"><section class="card-page end-page" tabindex="-1"/,
    );
    expect(out).toContain("68% read");
    expect(out).not.toMatch(/data-ui-legacy|rd-root|rd-end|class="rv-end/);
  });

  it("reads no continue pointer on none", async () => {
    actions.loadReviewQueue.mockResolvedValue({ ok: true, data: NONE });
    const out = html(await ReviewPage());
    expect(actions.loadReviewContinue).not.toHaveBeenCalled();
    expect(out).toContain('data-rv-end="none"');
  });
});
