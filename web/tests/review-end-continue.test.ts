import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContinueItem } from "@/lib/library/continue";

// The end's Continue line takes its figures from the continue read (P64-3y.S9; job 07 F214, review-end FG5):
// `loadReviewContinue` passes the Library's first `ContinueItem` on as the book, the chapter's n of N and the share
// read, never a figure of its own.

const cont = vi.hoisted(() => ({ loadContinue: vi.fn() }));
vi.mock("@/lib/library/continue", () => cont);
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => "tok") }));

const { loadReviewContinue } = await import("@/lib/review/actions");

const ITEM: ContinueItem = {
  key: "c:june/platform/handbook/capture",
  kind: "chapter",
  next: false,
  legacy: false,
  project: "platform",
  bookTitle: "The platform handbook",
  showProject: false,
  n: 6,
  total: 14,
  finishedN: 0,
  title: "Capture: from a widget to a message",
  lang: "en",
  langName: "",
  section: "Deduplication",
  sectionLang: null,
  org: "june",
  docId: null,
  pct: 68,
  href: "/@june/platform/books/handbook/capture",
};

describe("loadReviewContinue: the continue read's own figures", () => {
  beforeEach(() => cont.loadContinue.mockReset());

  it("passes on the book, n of N and the share read of a started chapter", async () => {
    cont.loadContinue.mockResolvedValue([ITEM]);
    expect(await loadReviewContinue()).toMatchObject({
      title: "Capture: from a widget to a message",
      href: "/@june/platform/books/handbook/capture",
      book: "The platform handbook",
      chapter: { n: 6, total: 14 },
      pct: 68,
    });
    cont.loadContinue.mockResolvedValue([
      {
        ...ITEM,
        bookTitle: "How the workspace was built",
        n: 3,
        total: 9,
        pct: 12,
      },
    ]);
    expect(await loadReviewContinue()).toMatchObject({
      book: "How the workspace was built",
      chapter: { n: 3, total: 9 },
      pct: 12,
    });
  });

  it("has no share read for an offered next chapter, and a loose document's project as its book", async () => {
    cont.loadContinue.mockResolvedValue([{ ...ITEM, next: true, pct: 0 }]);
    expect(await loadReviewContinue()).toMatchObject({ pct: null });
    cont.loadContinue.mockResolvedValue([
      { ...ITEM, kind: "doc", bookTitle: "", n: 0, total: 0, pct: 40 },
    ]);
    expect(await loadReviewContinue()).toMatchObject({
      book: "platform",
      chapter: null,
      pct: 40,
    });
  });

  it("is null with no pointer", async () => {
    cont.loadContinue.mockResolvedValue([]);
    expect(await loadReviewContinue()).toBeNull();
  });
});
