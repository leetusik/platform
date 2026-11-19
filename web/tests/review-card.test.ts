import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChoiceCard,
  ClozeCard,
  Counts,
  HighlightCard,
  QueueMeta,
  RateReply,
  RecallCard,
  ReviewCard,
  StatusReply,
} from "@/lib/review/types";

// Review's card (job 07-listen-review, round 01: frame.md F216, F217, F223, F239, F242; `ReviewCard.dc.html`,
// `pages/review/result.md` § Build › The card and § Behaviour). The claims of P64-3y.S8: a stale reply never lands
// on the next card; Again puts the card back at the queue's end, still counted; Good lowers due or new; the saved
// line's interval words; Undo restores the card and its count; Open at this → carries the card's place and
// `?from=`; the rating payloads are unchanged. The look is checked in Chrome by the fidelity slices; here, the pure
// models and the server render.

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
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  usePathname: () => "/review",
}));

const { ReviewCardView } = await import("@/hi2vi/review");
const cardModel = await import("@/hi2vi/review/card-model");
const session = await import("@/hi2vi/review/session");
const { reduce } = await import("@/lib/reader/quiz");
const { freshFor, specFor } = await import("@/lib/review/spec");
const { decodeFrom } = await import("@/lib/library/from");
const ReviewPage = (await import("@/app/review/page")).default;

const web = fileURLToPath(new URL("..", import.meta.url));
const html = (el: ReactElement) => renderToStaticMarkup(el);

const text = (t: string) => [{ type: "text" as const, text: t }];

const PREVIEWS = {
  again: { due: "2026-11-17T01:10:00.000Z", interval: 10 },
  good: { due: "2026-11-18T01:00:00.000Z", interval: 1440 },
};

const IN_CHAPTER = {
  org: "june",
  project: "platform",
  book: "handbook",
  book_title: "The platform handbook",
  chapter_key: "09-search",
  chapter_title: "How search ranks a passage",
  chapter_index: 9,
  chapter_count: 14,
  doc: "2026-10-02-search",
  lang: "en",
  version: 3,
  block_id: "check-yourself",
  href: "/@june/platform/books/handbook/09-search?lang=en#check-yourself",
  quiz_title: "Check yourself",
  item_count: 3,
};

const CHOICE: ChoiceCard = {
  card_id: "0b6f3c1e-1a2b-4c3d-8e4f-5a6b7c8d9e01",
  source: "quiz",
  item_type: "choice",
  status: "active",
  state: "relearning",
  reset: false,
  reps: 4,
  lapses: 1,
  due: "2026-11-14T22:00:00.000Z",
  last_review: "2026-11-10T09:00:00.000Z",
  created_at: "2026-10-20T09:00:00.000Z",
  where: { ...IN_CHAPTER, item_index: 1 },
  front: {
    prompt: text("A query has three terms. Which passage is a candidate?"),
    options: [
      { id: "a", text: text("Only a passage that holds all three terms") },
      { id: "b", text: text("Any passage that holds at least one of them") },
      {
        id: "c",
        text: text("Any passage in a document whose title holds one of them"),
      },
    ],
    multi: false,
  },
  back: {
    answer: ["b"],
    explain: text(
      "Candidates need one term. Holding more of them raises the score later; it is not required to be considered.",
    ),
  },
  previews: PREVIEWS,
};

const CLOZE: ClozeCard = {
  card_id: "0b6f3c1e-1a2b-4c3d-8e4f-5a6b7c8d9e03",
  source: "quiz",
  item_type: "cloze",
  status: "active",
  state: "learning",
  reset: false,
  reps: 1,
  lapses: 0,
  due: "2026-11-17T00:30:00.000Z",
  last_review: "2026-11-14T09:00:00.000Z",
  created_at: "2026-11-01T09:00:00.000Z",
  where: { ...IN_CHAPTER, item_index: 2 },
  front: {
    text: [
      { type: "text", text: "A match in a heading counts " },
      { type: "blank", accept: [] },
      { type: "text", text: "." },
    ],
    blanks: 1,
  },
  back: {
    accepted: [["double", "twice", "2x", "two times"]],
    explain: text(
      "Headings are short and say what a section is about, so a term there is worth two in the text.",
    ),
  },
  previews: {
    again: { due: "2026-11-17T01:05:00.000Z", interval: 5 },
    good: { due: "2026-11-20T01:00:00.000Z", interval: 4320 },
  },
};

const RECALL: RecallCard = {
  card_id: "0b6f3c1e-1a2b-4c3d-8e4f-5a6b7c8d9e05",
  source: "quiz",
  item_type: "recall",
  status: "active",
  state: "learning",
  reset: false,
  reps: 0,
  lapses: 0,
  due: "2026-11-17T00:00:00.000Z",
  last_review: null,
  created_at: "2026-11-17T00:00:00.000Z",
  where: { ...IN_CHAPTER, item_index: 3 },
  front: {
    prompt: text("Why does a rare term count for more than a common one?"),
  },
  back: {
    answer: text(
      "A term that appears in nearly every passage cannot tell them apart. A rare term narrows the candidates, so a match on it says more about the passage.",
    ),
    explain: null,
  },
  previews: PREVIEWS,
};

/** A section question in a loose document whose item changed: it starts over. */
const DRIFTED: ChoiceCard = {
  ...CHOICE,
  card_id: "0b6f3c1e-1a2b-4c3d-8e4f-5a6b7c8d9e04",
  state: "review",
  reset: true,
  where: {
    org: "june",
    project: "vocky",
    book: null,
    book_title: null,
    chapter_key: null,
    chapter_title: "How capture folds repeated messages",
    chapter_index: null,
    chapter_count: null,
    doc: "2026-09-12-capture-window",
    lang: "en",
    version: 2,
    block_id: "the-window-quiz",
    href: "/@june/vocky/capture-window#the-window-quiz",
    quiz_title: null,
    item_index: 1,
    item_count: 1,
  },
  front: {
    prompt: text(
      "Two messages with the same text reach capture 40 seconds apart, from the same page. What happens to the second one?",
    ),
    options: [
      { id: "own", text: text("It is stored as a message of its own") },
      {
        id: "fold",
        text: text("It is dropped, and the first message counts two"),
      },
      { id: "wait", text: text("It waits until the first one has been read") },
    ],
    multi: false,
  },
};

const KOREAN_HIGHLIGHT: HighlightCard = {
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
    block_id: "s2-p3",
    href: "/@june/platform/reindex#s2-p3",
    block_title: "지우기 전에",
    annotation_id: "9d1e2f3a-4b5c-4d6e-8f70-112233445566",
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
    good: { due: "2026-11-29T01:00:00.000Z", interval: 17280 },
  },
};

/** june's day (F213): 7 due, 33 new highlights, 12 done today. */
const COUNTS: Counts = {
  due: 7,
  new_highlights: 33,
  done_today: 12,
  by_book: [
    {
      org: "june",
      project: "platform",
      book: "handbook",
      book_title: "The platform handbook",
      due: 5,
      new: 1,
    },
  ],
};

const META: QueueMeta = {
  now: "2026-11-17T01:00:00.000Z",
  day: {
    start: "2026-11-16T19:00:00.000Z",
    end: "2026-11-17T19:00:00.000Z",
    time_zone: "Asia/Seoul",
  },
  profile: {
    time_zone: "Asia/Seoul",
    day_starts_at_hour: 4,
    max_reviews_per_day: 200,
    new_highlights_per_day: 40,
  },
  counts: COUNTS,
  limit_reached: null,
  next_due_at: "2026-11-18T00:30:00.000Z",
};

// --- helpers -----------------------------------------------------------------------------------------

type Send = { rating: "good" | "again" } | null;

/** One card, drawn as the page draws it: its answer state, a rating in flight or failed. */
function card(
  c: ReviewCard,
  opts: {
    act?: Parameters<typeof reduce>[2][];
    sending?: Send;
    failed?: Send;
  } = {},
) {
  const spec = specFor(c);
  let st = spec ? freshFor(c) : null;
  for (const a of opts.act ?? []) if (spec && st) st = reduce(spec, st, a).st;
  const form = cardModel.drawnForm(c, spec);
  if (!form) throw new Error("not a drawn form");
  const props = {
    card: c,
    form,
    spec,
    st,
    meta: META,
    sending: opts.sending ?? null,
    failed: opts.failed ?? null,
    onAct() {},
    onRate() {},
    onRetry() {},
    onSuspend() {},
  };
  return {
    view: cardModel.cardView(props),
    out: html(createElement(ReviewCardView, props)),
  };
}

function desk(over: Partial<Parameters<typeof session.rateStart>[0]> = {}) {
  return {
    queue: [CHOICE, CLOZE, RECALL, KOREAN_HIGHLIGHT] as ReviewCard[],
    meta: META,
    states: {},
    pending: null,
    failed: null,
    saved: null,
    toast: null,
    ...over,
  };
}

function reply(
  rated: ReviewCard,
  rating: "good" | "again",
  counts: Counts,
  over: Partial<RateReply["card"]> = {},
): { ok: true; data: RateReply } {
  return {
    ok: true,
    data: {
      card: {
        card_id: rated.card_id,
        state: rating === "good" ? "review" : "relearning",
        reps: rated.reps + 1,
        lapses: rated.lapses + (rating === "again" ? 1 : 0),
        due:
          rating === "good"
            ? "2026-11-18T01:00:00.000Z"
            : "2026-11-17T01:10:00.000Z",
        interval: rating === "good" ? 1440 : 10,
        due_today: rating === "again",
        rating,
        previews:
          rating === "again"
            ? {
                again: { due: "2026-11-17T01:20:00.000Z", interval: 10 },
                good: { due: "2026-11-17T09:00:00.000Z", interval: 480 },
              }
            : null,
        ...over,
      },
      counts,
      limit_reached: null,
      next_due_at: "2026-11-18T00:30:00.000Z",
      day: META.day,
      next: null,
    },
  };
}

const statusOk = (counts: Counts): { ok: true; data: StatusReply } => ({
  ok: true,
  data: {
    card: { card_id: CHOICE.card_id, status: "suspended" },
    counts,
    limit_reached: null,
    next_due_at: META.next_due_at,
    day: META.day,
  },
});

// --- the card (F216, F217) -------------------------------------------------------------------------------

describe("a choice card (F216): graded on the tap", () => {
  it("opens on its kind line, its source, the prompt, the hint and three rows; no foot; Open at … kept hidden in place", () => {
    const { out } = card(CHOICE);
    expect(out).toMatch(
      /^<div class="stack gap-4"><article class="card-page rv-card" tabindex="-1" aria-labelledby="([^"]+)-kind" data-rv-card="0b6f3c1e-1a2b-4c3d-8e4f-5a6b7c8d9e01"><div class="stack gap-1"><p class="card-kind" id="\1-kind"><span class="strong">Question<\/span><span class="badge is-wrap">Relearning · due 2 days ago<\/span><\/p><p class="card-source">The platform handbook · Chapter 9 of 14<\/p><\/div>/,
    );
    expect(out).toContain(
      '<div class="stack gap-1" lang="en"><p class="card-prompt">A query has three terms. Which passage is a candidate?</p><p class="rv-hint" lang="en">Choose one answer.</p></div>',
    );
    expect(out).toContain(
      '<ul class="rv-opts" aria-label="Answers" lang="en"><li><button type="button" class="rv-opt" data-first="" aria-disabled="false"><span class="rv-opt-lead" aria-hidden="true"><span class="rv-opt-key">A</span></span><span>Only a passage that holds all three terms</span></button></li>',
    );
    expect(out).not.toContain("rv-foot");
    expect(out).not.toContain("notice");
    expect(out).toContain(
      '<div class="rv-where"><p class="label">From the chapter</p><p lang="en">How search ranks a passage</p><p class="meta">Quiz “Check yourself” · question 1 of 3</p><div class="rv-where-go"><a class="link-row is-off" aria-hidden="true" tabindex="-1" href="/@june/platform/books/handbook/09-search?lang=en&amp;from=%2Flibrary#check-yourself">Open at this question →</a><button type="button" class="btn">Suspend card</button></div></div></div>',
    );
  });

  it("right: the row's tag, the verdict line with what Next rates, Next, the why, and the way into the text", () => {
    const { out, view } = card(CHOICE, { act: [{ t: "pick", opt: "b" }] });
    expect(out).toContain(
      '<button type="button" class="rv-opt" data-state="right" aria-disabled="true"><span class="rv-opt-lead" aria-hidden="true"><span class="rv-opt-key">B</span></span><span>Any passage that holds at least one of them</span><span class="rv-opt-tag" lang="en">Your answer, correct</span></button>',
    );
    expect(out).toContain(
      '<div class="rv-foot"><p class="say rv-line"><span class="status status-done">Correct</span><span class="say-rest">Next rates it Good · in 1 day</span></p><button type="button" class="btn btn-primary rv-main" data-rv-main="" data-busy="false" aria-busy="false"><span class="hold"><span class="is-held">Check</span><span>Next</span><span class="is-held">Saving…</span><span class="is-held">Try again</span></span></button></div>',
    );
    expect(out).toContain(
      '<p class="rv-text" lang="en">Candidates need one term. Holding more of them raises the score later; it is not required to be considered.</p>',
    );
    expect(out).toMatch(
      /<a class="link-row" href="[^"]+">Open at this question →<\/a>/,
    );
    expect(view.main).toMatchObject({ press: "rate", rating: "good" });
    expect(view.live).toBe("Correct. Next rates it Good · in 1 day");
  });

  it("wrong: its own row struck in the danger colour, the right row named, Next rates it Again", () => {
    const { out, view } = card(CHOICE, { act: [{ t: "pick", opt: "a" }] });
    expect(out).toContain(
      'data-state="wrong" aria-disabled="true"><span class="rv-opt-lead" aria-hidden="true"><span class="rv-opt-key">A</span></span><span>Only a passage that holds all three terms</span><span class="rv-opt-tag" lang="en">Your answer, incorrect</span>',
    );
    expect(out).toContain(
      '<span class="rv-opt-tag" lang="en">Correct answer</span>',
    );
    expect(out).toContain(
      '<span class="status status-fail">Incorrect</span><span class="say-rest">Next rates it Again · in 10 minutes</span>',
    );
    expect(view.main).toMatchObject({ press: "rate", rating: "again" });
  });

  it("saving: Saving… in the button's cell, in full colour and disabled; Suspend card waits", () => {
    const { out, view } = card(CHOICE, {
      act: [{ t: "pick", opt: "b" }],
      sending: { rating: "good" },
    });
    expect(out).toContain(
      'class="btn btn-primary rv-main" data-rv-main="" data-busy="true" aria-busy="true" disabled=""><span class="hold"><span class="is-held">Check</span><span class="is-held">Next</span><span>Saving…</span>',
    );
    expect(out).toContain(
      '<button type="button" class="btn" disabled="">Suspend card</button>',
    );
    expect(view.live).toBe("Saving…");
  });

  it("failed: the line is one sentence with the error mark, and the button says Try again", () => {
    const { out, view } = card(CHOICE, {
      act: [{ t: "pick", opt: "b" }],
      failed: { rating: "good" },
    });
    expect(out).toContain(
      '<p class="say rv-line rv-line-fail"><span class="status status-fail">Not saved</span><span class="say-rest">· check your connection</span></p>',
    );
    expect(out).toContain(
      '<span class="is-held">Saving…</span><span>Try again</span>',
    );
    expect(view.main).toMatchObject({ press: "retry" });
    expect(view.live).toBe("Not saved · check your connection");
  });

  it("a card that starts over shows the drift notice under its source", () => {
    const { out } = card(DRIFTED);
    expect(out).toContain(
      '<span class="badge is-wrap">Starts over</span></p><p class="card-source">vocky · Document</p></div><p class="notice">This question changed since your last review, so its card starts over. Your history is kept.</p>',
    );
    expect(out).toContain('<p class="label">From the document</p>');
  });
});

describe("a cloze card: the field in the sentence, Enter is Check", () => {
  it("opens with the field in the sentence, the line held hidden and Check", () => {
    const { out, view } = card(CLOZE);
    expect(out).toMatch(
      /<p class="card-prompt rv-gap">A match in a heading counts <span class="rv-gap-w"><input id="[^"]+-gap" class="input" type="text" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" enterKeyHint="done" aria-label="Blank 1 of 1" data-first="" aria-invalid="false" value=""\/>\.<\/span><\/p><p class="rv-hint" lang="en">Fill in the blank\. Capitals and spaces around the answer don’t count\.<\/p>/,
    );
    expect(out).toContain(
      '<p class="say rv-line is-empty"><span class="status">Correct</span><span class="say-rest"></span></p>',
    );
    expect(view.main).toMatchObject({ label: 0, press: "check" });
  });

  it("an empty Check says why it waits", () => {
    const { out } = card(CLOZE, { act: [{ t: "check" }] });
    expect(out).toContain(
      '<p class="say rv-line"><span class="status status-idle">Nothing to check yet</span><span class="say-rest">Fill in at least one blank first.</span></p>',
    );
  });

  it("wrong: the field struck and locked, what was written and every accepted form", () => {
    const { out } = card(CLOZE, {
      act: [{ t: "type", n: 1, v: " three times " }, { t: "check" }],
    });
    expect(out).toMatch(
      /aria-label="Blank 1 of 1" data-first="" data-state="wrong" aria-invalid="true" readOnly="" value=" three times "\/>/,
    );
    expect(out).toContain(
      '<p class="rv-wrote">You wrote “<b lang="en">three times</b>”. Accepted: <b lang="en">double, twice, 2x or two times</b>.</p>',
    );
    expect(out).toContain(
      '<span class="status status-fail">Incorrect</span><span class="say-rest">Next rates it Again · in 5 minutes</span>',
    );
  });

  it("right: Good · in 3 days", () => {
    const { out } = card(CLOZE, {
      act: [{ t: "type", n: 1, v: "Twice" }, { t: "check" }],
    });
    expect(out).toContain(
      'data-state="right" aria-invalid="false" readOnly=""',
    );
    expect(out).toContain("Next rates it Good · in 3 days");
    expect(out).not.toContain("rv-wrote");
  });
});

describe("a recall card: Show answer, then the pair", () => {
  it("opens with the answer's box closed, no pair, and Open at … kept hidden", () => {
    const { out } = card(RECALL);
    expect(out).toContain(
      '<div class="rv-answer" role="group" aria-label="Answer" tabindex="-1" data-rv-answer=""><div class="rv-answer-head"><span>Answer</span><button type="button" class="btn" aria-expanded="false" data-first="">Show answer</button></div></div>',
    );
    expect(out).toContain("Answer it in your head, then show the answer.");
    expect(out).not.toContain("rate-pair");
    expect(out).toContain('class="link-row is-off"');
    expect(out).toContain(
      '<span class="badge is-wrap">Learning · added today</span>',
    );
  });

  it("shown: the answer, then Did you get it? and the pair, Good first, each with its interval", () => {
    const { out, view } = card(RECALL, { act: [{ t: "reveal" }] });
    expect(out).toContain(
      '<div class="rv-answer-text rv-text" lang="en"><p>A term that appears in nearly every passage cannot tell them apart. A rare term narrows the candidates, so a match on it says more about the passage.</p></div>',
    );
    expect(out).toContain(
      '<div class="hold"><div class="stack gap-2"><p class="rate-ask">Did you get it?</p><div class="rate-pair"><button type="button" class="btn rate" data-busy="false" aria-busy="false"><span class="swap"><span>I got it</span><span>Saving…</span></span><span class="rate-ivl">Good · in 1 day</span></button><button type="button" class="btn rate" data-busy="false" aria-busy="false"><span class="swap"><span>I missed it</span><span>Saving…</span></span><span class="rate-ivl">Again · in 10 minutes</span></button></div></div><div class="stack gap-2 is-held">',
    );
    expect(out).toMatch(/<a class="link-row" href=/);
    expect(view.live).toBe("Answer shown. Did you get it?");
  });

  it("a failed rating puts Try again in the pair's cell", () => {
    const { out } = card(RECALL, {
      act: [{ t: "reveal" }],
      failed: { rating: "again" },
    });
    expect(out).toContain(
      '<div class="stack gap-2 is-held"><p class="rate-ask">',
    );
    expect(out).toContain(
      '<div class="stack gap-2"><p class="say rv-line rv-line-fail"><span class="status status-fail">Not saved</span><span class="say-rest">· check your connection</span></p><button type="button" class="btn btn-primary rv-main" data-rv-main="">Try again</button></div>',
    );
  });
});

describe("a highlight card", () => {
  it("is the quote in its language, Your note, and the pair; a Korean card says 한국어 after its source", () => {
    const { out } = card(KOREAN_HIGHLIGHT, { sending: { rating: "good" } });
    expect(out).toContain(
      '<span class="strong">Highlight</span><span class="badge is-wrap">New</span></p><p class="card-source">platform · Document · <span lang="ko">한국어</span></p>',
    );
    expect(out).toContain(
      '<blockquote class="card-quote" lang="ko">색인을 지우기 전에 새 색인이 모든 문서를 다시 읽었는지 확인하세요. 그렇지 않으면 검색이 잠시 빈 결과를 돌려줍니다.</blockquote><div class="stack gap-1"><p class="label">Your note</p>',
    );
    // saving: both wait; the pressed one says Saving…
    expect(out).toContain(
      '<button type="button" class="btn rate" data-rv-main="" data-busy="true" aria-busy="true" disabled=""><span class="swap"><span>Got it</span><span>Saving…</span></span><span class="rate-ivl">Good · in 12 days</span></button><button type="button" class="btn rate" data-busy="false" aria-busy="false" disabled=""><span class="swap"><span>Show sooner</span>',
    );
    expect(out).toContain(
      '<p class="label">From the document</p><p lang="ko">색인 다시 만들기</p><p class="meta">Section “<span lang="ko">지우기 전에</span>”</p>',
    );
    expect(out).toContain(">Open at this highlight →</a>");
  });
});

describe("forms job 07 does not draw keep today's card, whole", () => {
  it("several right answers or several blanks have no drawn form", () => {
    const multi: ChoiceCard = {
      ...CHOICE,
      front: { ...CHOICE.front, multi: true },
      back: { ...CHOICE.back, answer: ["a", "b"] },
    };
    const two: ClozeCard = {
      ...CLOZE,
      back: { ...CLOZE.back, accepted: [["double"], ["title"]] },
    };
    expect(cardModel.drawnForm(multi, specFor(multi))).toBeNull();
    expect(cardModel.drawnForm(two, specFor(two))).toBeNull();
    expect(cardModel.drawnForm(CHOICE, specFor(CHOICE))).toBe("choice");
    expect(cardModel.drawnForm(KOREAN_HIGHLIGHT, null)).toBe("highlight");
  });
});

// --- Open at this … (F242) ---------------------------------------------------------------------------------

describe("Open at this … → (F242): the card's place, and the way back", () => {
  it("opens the card's text at its block, carrying ?from= the reader reads back as the Library", () => {
    const href = cardModel.openHref(CHOICE);
    expect(href).toBe(
      "/@june/platform/books/handbook/09-search?lang=en&from=%2Flibrary#check-yourself",
    );
    const url = new URL(href, "https://hi2vi.invalid");
    expect(url.hash).toBe(`#${CHOICE.where.block_id}`);
    expect(url.searchParams.get("lang")).toBe("en");
    expect(decodeFrom(url.searchParams.get("from"))).toEqual({
      origin: "library",
      place: {},
    });
    expect(cardModel.openHref(KOREAN_HIGHLIGHT)).toBe(
      "/@june/platform/reindex?from=%2Flibrary#s2-p3",
    );
  });
});

// --- the session (§ Behaviour) ---------------------------------------------------------------------------

describe("a rating's reply lands only on the rating that sent it", () => {
  it("a stale reply (another rating in flight, or none) changes nothing", () => {
    // The choice's rating was sent as seq 1; the page has moved on and sends the blank's rating as seq 2.
    const moved = desk({
      queue: [CLOZE, RECALL],
      pending: {
        cardId: CLOZE.card_id,
        rating: "good",
        reviewId: "id-2",
        seq: 2,
      },
    });
    const late = reply(CHOICE, "good", { ...COUNTS, due: 6, done_today: 13 });
    const sent = {
      card: CHOICE,
      rating: "good" as const,
      reviewId: "id-1",
      seq: 1,
    };
    expect(session.rateLanded(moved, sent, late, META.now)).toBeNull();
    expect(
      session.rateLanded(desk({ queue: [CLOZE] }), sent, late, META.now),
    ).toBeNull();
    // a failure that comes back late is no failure of the card on screen either
    expect(
      session.rateLanded(moved, sent, { ok: false, ref: "r" }, META.now),
    ).toBeNull();
    // the reply of the rating in flight lands
    expect(
      session.rateLanded(
        moved,
        { card: CLOZE, rating: "good", reviewId: "id-2", seq: 2 },
        reply(CLOZE, "good", { ...COUNTS, due: 6, done_today: 13 }),
        META.now,
      )?.patch.queue,
    ).toEqual([RECALL]);
  });

  it("every rating sends with a fresh id; only Try again of the failed rating repeats its id", () => {
    let n = 0;
    const make = () => `fresh-${++n}`;
    const failed = {
      cardId: CHOICE.card_id,
      rating: "good" as const,
      reviewId: "id-1",
    };
    expect(
      session.rateStart(desk({ failed }), "good", 2, make)?.send.reviewId,
    ).toBe("id-1");
    expect(
      session.rateStart(desk({ failed }), "again", 3, make)?.send.reviewId,
    ).toBe("fresh-1");
    expect(session.rateStart(desk(), "good", 4, make)?.send.reviewId).toBe(
      "fresh-2",
    );
    // nothing is sent while a rating is in flight
    expect(
      session.rateStart(
        desk({ pending: { ...failed, seq: 1 } }),
        "good",
        5,
        make,
      ),
    ).toBeNull();
  });
});

describe("a rating saved (§ Behaviour)", () => {
  it("Again puts the card back at the queue's end, still counted, with the reply's schedule", () => {
    const d = desk({
      pending: {
        cardId: CHOICE.card_id,
        rating: "again",
        reviewId: "id-1",
        seq: 1,
      },
    });
    const counts = { ...COUNTS, done_today: 13 };
    const out = session.rateLanded(
      d,
      { card: CHOICE, rating: "again", reviewId: "id-1", seq: 1 },
      reply(CHOICE, "again", counts),
      "2026-11-17T01:00:05.000Z",
    );
    const queue = out?.patch.queue ?? [];
    expect(queue.map((c) => c.card_id)).toEqual([
      CLOZE.card_id,
      RECALL.card_id,
      KOREAN_HIGHLIGHT.card_id,
      CHOICE.card_id,
    ]);
    expect(queue[3]).toMatchObject({
      state: "relearning",
      due: "2026-11-17T01:10:00.000Z",
      previews: { good: { interval: 480 } },
    });
    expect(out?.patch.meta?.counts).toEqual(counts);
    expect(out?.patch.meta?.counts.due).toBe(7);
    expect(out?.then).toBe("focus");
  });

  it("Good lowers due (a card in review) or new (a new highlight), and done goes up", () => {
    const pend = (c: ReviewCard) => ({
      cardId: c.card_id,
      rating: "good" as const,
      reviewId: "id-1",
      seq: 1,
    });
    const due = session.rateLanded(
      desk({ pending: pend(CHOICE) }),
      { card: CHOICE, rating: "good", reviewId: "id-1", seq: 1 },
      reply(CHOICE, "good", { ...COUNTS, due: 6, done_today: 13 }),
      META.now,
    );
    expect(due?.patch.meta?.counts).toMatchObject({
      due: 6,
      new_highlights: 33,
      done_today: 13,
    });
    expect(due?.patch.queue?.map((c) => c.card_id)).not.toContain(
      CHOICE.card_id,
    );
    const nw = session.rateLanded(
      desk({
        queue: [KOREAN_HIGHLIGHT, CLOZE],
        pending: pend(KOREAN_HIGHLIGHT),
      }),
      { card: KOREAN_HIGHLIGHT, rating: "good", reviewId: "id-1", seq: 1 },
      reply(
        KOREAN_HIGHLIGHT,
        "good",
        { ...COUNTS, new_highlights: 32, done_today: 13 },
        { interval: 17280 },
      ),
      META.now,
    );
    expect(nw?.patch.meta?.counts).toMatchObject({
      due: 7,
      new_highlights: 32,
      done_today: 13,
    });
    expect(nw?.patch.queue).toEqual([CLOZE]);
  });

  it("the head's saved line says the rating and its interval, in the page's words", () => {
    const at = (rating: "good" | "again", interval: number) =>
      session.rateLanded(
        desk({
          pending: { cardId: CHOICE.card_id, rating, reviewId: "x", seq: 1 },
        }),
        { card: CHOICE, rating, reviewId: "x", seq: 1 },
        reply(CHOICE, rating, COUNTS, { interval }),
        META.now,
      )?.patch.saved;
    expect(at("good", 1440)).toEqual({
      word: "Saved",
      rest: "Good · next review in 1 day",
    });
    expect(at("good", 4320)).toEqual({
      word: "Saved",
      rest: "Good · next review in 3 days",
    });
    expect(at("again", 10)).toEqual({
      word: "Saved",
      rest: "Again · next review in 10 minutes",
    });
    expect(at("good", 1410)).toEqual({
      word: "Saved",
      rest: "Good · next review in 1 day",
    });
  });

  it("a failed rating keeps the card, remembers the id for Try again, and moves the focus to Try again", () => {
    const out = session.rateLanded(
      desk({
        pending: {
          cardId: CHOICE.card_id,
          rating: "good",
          reviewId: "id-1",
          seq: 1,
        },
      }),
      { card: CHOICE, rating: "good", reviewId: "id-1", seq: 1 },
      { ok: false, ref: "r" },
      META.now,
    );
    expect(out).toEqual({
      patch: {
        pending: null,
        failed: { cardId: CHOICE.card_id, rating: "good", reviewId: "id-1" },
      },
      then: "focus-retry",
    });
  });
});

describe("Suspend card and Undo (F223)", () => {
  it("the card leaves with its count, Card suspended offers Undo, and Undo puts both back", () => {
    const d0 = desk();
    const s1 = { ...d0, ...session.suspendStart(d0, CHOICE, 1) };
    expect(s1.queue[0]).toBe(CLOZE);
    expect(s1.meta.counts.due).toBe(6);
    expect(s1.toast).toEqual({
      id: 1,
      kind: "undo",
      card: CHOICE,
      text: "Card suspended. It leaves your reviews and keeps its history.",
    });
    const u = session.undoStart(s1);
    expect(u?.card).toBe(CHOICE);
    const s2 = { ...s1, ...u?.patch };
    expect(s2.queue.map((c) => c.card_id)).toEqual(
      d0.queue.map((c) => c.card_id),
    );
    expect(s2.meta.counts).toEqual(COUNTS);
    expect(s2.toast).toBeNull();
    // a highlight's own words, and its count is a new highlight's
    const h = session.suspendStart(
      desk({ queue: [KOREAN_HIGHLIGHT] }),
      KOREAN_HIGHLIGHT,
      2,
    );
    expect(h.toast?.text).toBe(
      "Card suspended, and Review this is off on its highlight.",
    );
    expect(h.meta.counts).toMatchObject({ due: 7, new_highlights: 32 });
  });

  it("the next rating clears it; the next suspend replaces it", () => {
    const d0 = desk();
    const s1 = { ...d0, ...session.suspendStart(d0, CHOICE, 1) };
    expect(session.rateStart(s1, "good", 1)?.patch.toast).toBeNull();
    const s2 = { ...s1, ...session.suspendStart(s1, CLOZE, 2) };
    expect(s2.toast).toMatchObject({ id: 2, card: CLOZE });
    expect(session.undoStart(s2)?.card).toBe(CLOZE);
    expect(
      session.canSuspend(
        desk({
          pending: {
            cardId: CHOICE.card_id,
            rating: "good",
            reviewId: "x",
            seq: 1,
          },
        }),
      ),
    ).toBeNull();
  });

  it("a failed suspend brings the card back first with the failed notice, which is no toast", () => {
    const d0 = desk();
    const s1 = { ...d0, ...session.suspendStart(d0, CHOICE, 1) };
    const out = session.suspendLanded(s1, CHOICE, { ok: false, ref: "r" }, 2);
    expect(out.patch?.queue?.[0]).toBe(CHOICE);
    expect(out.patch?.meta?.counts.due).toBe(7);
    expect(out.patch?.toast).toMatchObject({
      kind: "retry",
      text: "Not suspended · check your connection",
    });
    // a saved suspend takes the server's counts
    const ok = session.suspendLanded(
      s1,
      CHOICE,
      statusOk({ ...COUNTS, due: 6 }),
      2,
    );
    expect(ok.patch?.meta?.counts.due).toBe(6);
    expect(ok.patch?.queue?.[0]).toBe(CLOZE);
  });
});

describe("the rating payloads are unchanged", () => {
  it("send the card, the rating, the id and the quiz's own response: selected, blanks or the self-grade; a highlight none", () => {
    const make = () => "id-new";
    const at = (
      c: ReviewCard,
      acts: Parameters<typeof reduce>[2][],
      rating: "good" | "again",
    ) => {
      const spec = specFor(c);
      let st = freshFor(c);
      for (const a of acts) if (spec) st = reduce(spec, st, a).st;
      return session.rateStart(
        desk({ queue: [c], states: spec ? { [c.card_id]: st } : {} }),
        rating,
        1,
        make,
      )?.send;
    };
    expect(at(CHOICE, [{ t: "pick", opt: "b" }], "good")).toEqual({
      cardId: CHOICE.card_id,
      rating: "good",
      reviewId: "id-new",
      response: { selected: ["b"] },
    });
    expect(
      at(
        CLOZE,
        [{ t: "type", n: 1, v: " three times " }, { t: "check" }],
        "again",
      ),
    ).toEqual({
      cardId: CLOZE.card_id,
      rating: "again",
      reviewId: "id-new",
      response: { blanks: [" three times "] },
    });
    expect(at(RECALL, [{ t: "reveal" }], "good")).toEqual({
      cardId: RECALL.card_id,
      rating: "good",
      reviewId: "id-new",
      response: { self_grade: "got" },
    });
    expect(at(RECALL, [{ t: "reveal" }], "again")?.response).toEqual({
      self_grade: "missed",
    });
    const hl = at(KOREAN_HIGHLIGHT, [], "again");
    expect(hl).toEqual({
      cardId: KOREAN_HIGHLIGHT.card_id,
      rating: "again",
      reviewId: "id-new",
      response: undefined,
    });
    expect(Object.keys(hl ?? {})).toEqual([
      "cardId",
      "rating",
      "reviewId",
      "response",
    ]);
  });

  it("are what the page sends: one rateReviewCard call, given the step's send", () => {
    const src = readFileSync(`${web}src/hi2vi/review/review-frame.tsx`, "utf8");
    expect(src.match(/rateReviewCard\(/g)).toHaveLength(1);
    expect(src).toContain("rateReviewCard(start.send)");
  });
});

// --- on the page ---------------------------------------------------------------------------------------------

describe("/review shows Review's own card under the head", () => {
  beforeEach(() => {
    actions.loadReviewQueue.mockReset();
  });
  const page = async (cards: ReviewCard[]) => {
    actions.loadReviewQueue.mockResolvedValue({
      ok: true,
      data: { ...META, cards },
    });
    return html(await ReviewPage());
  };

  it("draws a drawn form in the frame's column, with no bridge", async () => {
    const out = await page([CHOICE, CLOZE]);
    expect(out).toMatch(
      /<\/header><div class="stack gap-4"><article class="card-page rv-card" tabindex="-1"/,
    );
    expect(out).not.toContain("data-ui-legacy");
  });

  it("keeps today's card, bridged whole, for a form job 07 does not draw", async () => {
    const multi: ChoiceCard = {
      ...CHOICE,
      front: { ...CHOICE.front, multi: true },
      back: { ...CHOICE.back, answer: ["a", "b"] },
    };
    const out = await page([multi]);
    expect(out).toMatch(
      /<\/header><div data-ui-legacy=""><div class="rd-root rd-size-3"[^>]*><div style="container-type:inline-size;container-name:rd"><article class="rv-card"/,
    );
  });
});

describe("Review's sheet: the card's text scales with Display, its chrome does not", () => {
  const css = readFileSync(`${web}src/hi2vi/styles/review/review.css`, "utf8");
  it("scales the prompt, the quote, the options and the text by --read-k; the hint, the intervals and the buttons stay", () => {
    expect(css).toContain(
      ".rv-card .card-prompt, .rv-card .card-quote { font-size: calc(var(--fs-head) * var(--read-k)); }",
    );
    expect(css).toContain(
      ".rv-text { font-size: calc(var(--fs-text) * var(--read-k));",
    );
    expect(css).toMatch(
      /\.rv-opt \{[^}]*font-size: calc\(var\(--fs-text\) \* var\(--read-k\)\)/,
    );
    expect(css).toMatch(
      /\.rv-hint \{ color: var\(--ink-2\); font-size: var\(--fs-meta\);/,
    );
    expect(css).toMatch(/\.rate-ivl \{[^}]*font-size: var\(--fs-meta\)/);
    expect(css).toContain(
      "@container focus (min-width: 32em) { .rate-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }",
    );
    // F239's scoped rule is not built: the kind line writes the system's `badge is-wrap`
    expect(css).not.toMatch(/\.card-kind > \.badge \{/);
  });
});
