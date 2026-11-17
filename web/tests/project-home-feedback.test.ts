import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Feedback } from "@/lib/feedback/types";

// Project home's Feedback panel (job 01 round 03, `ProjectHomeFeedback`; D247-4x; operator D3): the
// month's count over the viewer's month, the Feedback job's Rating, each message's `lang`, the
// project-scoped addresses, and the panel's own failed form in place of the page's error.

const feedbackApp = vi.hoisted(() => ({
  listFeedbackPage: vi.fn(),
  countFeedback: vi.fn(),
  listFeedback: vi.fn(),
}));
const knowledgeApp = vi.hoisted(() => ({
  getProjectUsage: vi.fn(),
  getDocuments: vi.fn(),
  getOrgLibrary: vi.fn(),
}));
const zone = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("@/lib/feedback/app", () => feedbackApp);
vi.mock("@/lib/knowledge/app", () => knowledgeApp);
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({
    token: "t",
    identity: { tenant: { id: "t1", slug: "june", name: "Personal" } },
  })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "kb_tz" && zone.value ? { value: zone.value } : undefined,
  })),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  setProjectVisibilityAction: vi.fn(),
  mintCredentialAction: vi.fn(),
  revokeCredentialAction: vi.fn(),
}));

const { default: ProjectHomePage } =
  await import("@/app/(app)/projects/[projectId]/page");
const { feedbackRows, monthWindow } =
  await import("@/app/(app)/projects/[projectId]/model");

const record = (id: string, message: string, value: 1 | 2 | null): Feedback =>
  ({
    id,
    message,
    feedback_value: value,
    ingested_at: "2026-11-15T08:00:00Z",
  }) as unknown as Feedback;

const RECORDS = [
  record("f1", "Search finds the page but not the paragraph.", 1),
  record("f2", "재생 속도를 기억해 주면 좋겠어요.", 2),
  record("f3", "On my phone the top bar runs off the screen.", null),
];

beforeEach(() => {
  vi.clearAllMocks();
  zone.value = undefined;
  knowledgeApp.getProjectUsage.mockResolvedValue({
    project: {
      id: "p1",
      name: "platform",
      created_at: "2026-03-02T00:00:00Z",
      visibility: "private",
    },
    totals: { documents_created: 1, searches: 2, documents_deleted: 0 },
    daily_counts: [],
    credentials: [],
  });
  knowledgeApp.getDocuments.mockResolvedValue({ documents: [], total: 0 });
  knowledgeApp.getOrgLibrary.mockResolvedValue({
    org: { id: "t1", slug: "june", name: "Personal", label: "june" },
    member: true,
    projects: [],
    books: [],
    documents: [],
  });
  feedbackApp.listFeedbackPage.mockResolvedValue({
    records: RECORDS,
    total: 40,
  });
  feedbackApp.countFeedback.mockResolvedValue(23);
});

async function render(): Promise<string> {
  return renderToStaticMarkup(
    await ProjectHomePage({ params: Promise.resolve({ projectId: "p1" }) }),
  );
}

/** The Feedback panel's own markup. */
function feedbackPanel(html: string): string {
  const start = html.indexOf('aria-label="Feedback"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

describe("the month's window", () => {
  it("is the viewer's month, the first at 00:00 there to the next month's first", () => {
    // Nov 30, 20:00 UTC is already Dec 1 in Seoul.
    const now = Date.parse("2026-11-30T20:00:00Z");
    expect(monthWindow({ now, timeZone: "Asia/Seoul" })).toEqual({
      start: "2026-11-30T15:00:00.000Z",
      end: "2026-12-31T15:00:00.000Z",
    });
    expect(monthWindow({ now, timeZone: "UTC" })).toEqual({
      start: "2026-11-01T00:00:00.000Z",
      end: "2026-12-01T00:00:00.000Z",
    });
    // Behind UTC, across a DST change: Nov 1, 03:00 UTC is still Oct 31 in New York.
    expect(
      monthWindow({
        now: Date.parse("2026-11-01T03:00:00Z"),
        timeZone: "America/New_York",
      }),
    ).toEqual({
      start: "2026-10-01T04:00:00.000Z",
      end: "2026-11-01T04:00:00.000Z",
    });
  });

  it("is UTC's month while the zone is unknown", () => {
    expect(monthWindow({ now: Date.parse("2026-12-31T23:30:00Z") })).toEqual({
      start: "2026-12-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
    });
  });

  it("is the window the page asks the count for, in the viewer's zone, and the head shows the API's total", async () => {
    zone.value = "Asia/Seoul";
    const html = feedbackPanel(await render());
    expect(feedbackApp.countFeedback).toHaveBeenCalledTimes(1);
    const [, window] = feedbackApp.countFeedback.mock.calls[0];
    expect(window.project_id).toBe("p1");
    expect(window.start).toMatch(/T15:00:00\.000Z$/);
    expect(Date.parse(window.end)).toBeGreaterThan(Date.parse(window.start));
    expect(html).toContain('<p class="meta">23 this month</p>');
  });
});

describe("the rows", () => {
  it("read Liked, Disliked and Unrated, never a five-point score", async () => {
    const html = feedbackPanel(await render());
    expect(html).toContain('class="rating rating-liked ph-rating">Liked<');
    expect(html).toContain(
      'class="rating rating-disliked ph-rating">Disliked<',
    );
    expect(html).toContain('class="rating rating-unrated ph-rating">Unrated<');
    expect(html).not.toMatch(/\d\/5/);
  });

  it("mark a Korean message lang=ko and leave an English one the page's", () => {
    const rows = feedbackRows(RECORDS, "p1", { timeZone: "UTC" });
    expect(rows[1].lang).toBe("ko");
    expect(rows[0].lang).toBeUndefined();
  });

  it("lead to the project-scoped addresses, and so does the foot", async () => {
    const html = feedbackPanel(await render());
    expect(html).toContain('lang="ko"');
    expect(html).toContain('href="/projects/p1/feedback/f1"');
    expect(html).toContain('href="/projects/p1/feedback"');
    expect(html).not.toContain("/feedback?project=");
    expect(feedbackApp.listFeedbackPage).toHaveBeenCalledWith(
      "t",
      { project_id: "p1", limit: 5 },
      1,
    );
  });
});

describe("a failed Feedback read", () => {
  it("keeps the page and shows the panel's failed form with Try again", async () => {
    feedbackApp.listFeedbackPage.mockRejectedValue(new Error("502"));
    const html = await render();
    expect(html).toContain('aria-label="Library"');
    const panel = feedbackPanel(html);
    expect(panel).toContain("Feedback did not load.");
    expect(panel).toContain("Try again");
    expect(panel).not.toContain("See all in Feedback");
  });

  it("a failed count read is the failed form too", async () => {
    feedbackApp.countFeedback.mockRejectedValue(new Error("502"));
    const panel = feedbackPanel(await render());
    expect(panel).toContain("Feedback did not load.");
    expect(panel).not.toContain("this month");
  });
});
