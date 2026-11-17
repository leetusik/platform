import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/knowledge/client";
import type { Feedback } from "@/lib/feedback/types";

// P65-nh.S4 — the Feedback list as signed (job 04 round 02, `result.md` § The list): one list for
// `/feedback` and `/projects/{id}/feedback`; the body in the record's precedence; the count line; the
// project select and the Project column left out with a project picked; the Library's pager only with
// more than one page; No such view and Not found; Clear and a row's way back; no old-page wrapper.

const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({}),
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message === NOT_FOUND) throw error;
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: async () => ({
    token: "t",
    identity: { tenant: { name: "Personal" } },
  }),
}));

const api = vi.hoisted(() => ({
  projects: [] as { id: string; name: string }[] | Error,
  page: { records: [] as unknown[], total: 0 } as
    { records: unknown[]; total: number } | Error,
  calls: [] as unknown[][],
}));
vi.mock("@/lib/knowledge/app", () => ({
  listProjects: async () => {
    if (api.projects instanceof Error) throw api.projects;
    return api.projects;
  },
}));
vi.mock("@/lib/feedback/app", () => ({
  listFeedbackPage: async (...args: unknown[]) => {
    api.calls.push(args);
    if (api.page instanceof Error) throw api.page;
    return api.page;
  },
}));

const PROJECTS = [
  { id: "p1", name: "platform" },
  { id: "p2", name: "보캐" },
];

function record(i: number, over: Partial<Feedback> = {}): Feedback {
  return {
    id: `f${i}`,
    message: `message ${i}`,
    source_product: "reader",
    feedback_value: null,
    project_id: "p1",
    ingested_at: "2026-11-15T01:00:00Z",
    ...over,
  } as Feedback;
}

beforeEach(() => {
  api.projects = PROJECTS;
  api.page = { records: [record(1)], total: 1 };
  api.calls = [];
});

/** The org route's own element: the shared list's body, nothing around it. */
async function orgPage() {
  const { default: Page } = await import("@/app/(app)/feedback/page");
  const { FeedbackListPage } = await import("@/hi2vi/feedback/list");
  const node = (await Page({
    searchParams: Promise.resolve({}),
  })) as ReactElement;
  expect(node.type).toBe(FeedbackListPage);
  return orgBody();
}

async function projectPage(
  projectId: string,
  search: Record<string, string> = {},
) {
  const { default: Page } =
    await import("@/app/(app)/projects/[projectId]/feedback/page");
  const { FeedbackListPage } = await import("@/hi2vi/feedback/list");
  const node = (await Page({
    params: Promise.resolve({ projectId }),
    searchParams: Promise.resolve(search),
  })) as ReactElement<Parameters<typeof FeedbackListPage>[0]>;
  return renderToStaticMarkup(
    (await FeedbackListPage(node.props)) as ReactElement,
  );
}

async function orgBody(search: Record<string, string> = {}) {
  const { default: Page } = await import("@/app/(app)/feedback/page");
  const { FeedbackListPage } = await import("@/hi2vi/feedback/list");
  const node = (await Page({
    searchParams: Promise.resolve(search),
  })) as ReactElement<Parameters<typeof FeedbackListPage>[0]>;
  return renderToStaticMarkup(
    (await FeedbackListPage(node.props)) as ReactElement,
  );
}

describe("which body shows", () => {
  it("follows the record: failed, a request out, rows, no project, no match, none yet", async () => {
    const { listBody } = await import("@/hi2vi/feedback/list/model");
    const all = { rows: 3, projects: 2, filtered: true };
    expect(listBody({ ...all, phase: "failed" })).toBe("failed");
    expect(listBody({ ...all, phase: "searching" })).toBe("waiting");
    expect(listBody({ ...all, phase: "loading" })).toBe("waiting");
    expect(listBody({ ...all, phase: "paging" })).toBe("rows");
    expect(listBody({ ...all, phase: "ready" })).toBe("rows");
    expect(listBody({ ...all, rows: 0, projects: 0, phase: "ready" })).toBe(
      "no-projects",
    );
    expect(listBody({ ...all, rows: 0, phase: "ready" })).toBe("no-match");
    expect(listBody({ ...all, rows: 0, filtered: false, phase: "ready" })).toBe(
      "none",
    );
  });

  it("draws each body's words", async () => {
    api.page = { records: [], total: 0 };
    expect(await orgBody()).toContain(
      "No feedback yet. Your product sends it here with a",
    );
    expect(await orgBody({ q: "refund" })).toContain(
      "No feedback contains “refund”.",
    );
    expect(await orgBody({ q: "x", rating: "liked", project: "p1" })).toContain(
      "No feedback contains “x” with these filters.",
    );
    expect(await orgBody({ rating: "liked" })).toContain(
      "No feedback matches this filter.",
    );
    api.projects = [];
    const none = await orgBody();
    expect(none).toContain("No projects yet. Create one on");
    expect(none).toMatch(
      /<a class="link fl-inline" href="\/dashboard">Overview<\/a>,/,
    );
    api.projects = PROJECTS;
    api.page = new ApiError(500, "boom");
    const failed = await orgBody();
    expect(failed).toContain("Feedback did not load.");
    expect(failed).toContain(">Try again</button>");
    expect(failed).toMatch(/<p class="meta" role="status"><\/p>/);
  });
});

describe("the count line", () => {
  it("reads the total at rest and the matches under a search or a filter", async () => {
    api.page = { records: [record(1)], total: 230 };
    expect(await orgBody()).toContain(
      '<p class="meta" role="status">230 pieces of feedback</p>',
    );
    api.page = { records: [record(1)], total: 12 };
    expect(await orgBody({ q: "export" })).toContain(
      '<p class="meta" role="status">12 matches</p>',
    );
  });
});

describe("a project picked", () => {
  it("leaves out the project select and the Project column", async () => {
    const org = await orgBody();
    expect(org).toContain('aria-label="Project"');
    expect(org).toContain(">Project</th>");
    const project = await projectPage("p1");
    expect(project).not.toContain('aria-label="Project"');
    expect(project).not.toContain(">Project</th>");
    expect(project).toContain(">Product</th>");
    expect(api.calls.at(-1)?.[1]).toMatchObject({ project_id: "p1" });
  });

  it("is Not found for an id that is no project of the org", async () => {
    await expect(projectPage("nope")).rejects.toThrow(NOT_FOUND);
  });
});

describe("the pager", () => {
  it("is not drawn on one page", async () => {
    api.page = { records: [record(1)], total: 50 };
    expect(await orgBody()).not.toContain("Feedback pages");
  });

  it("is the Library's, named Feedback pages, its links keeping the search and filters", async () => {
    api.page = { records: [record(1)], total: 230 };
    const html = await orgBody({ q: "a", rating: "liked", page: "2" });
    expect(html).toContain('<nav class="pager" aria-label="Feedback pages">');
    expect(html).toContain("51–100 of 230");
    expect(html).toContain('href="/feedback?page=3&amp;q=a&amp;rating=liked"');
    expect(html).toContain('href="/feedback?q=a&amp;rating=liked"');
    expect(html).toMatch(/aria-current="page"[^>]*>2</);
  });

  it("marks the page asked for at once and keeps the rows while it loads", async () => {
    const { FeedbackListView } = await import("@/hi2vi/feedback/list/view");
    const { AT_REST } = await import("@/lib/feedback/place");
    const html = renderToStaticMarkup(
      createElement(FeedbackListView, {
        scope: null,
        place: AT_REST,
        projects: PROJECTS,
        rows: [
          {
            id: "f1",
            value: 1,
            message: "kept",
            project: "platform",
            product: "reader",
            at: "2026-11-15T01:00:00Z",
            when: "1h ago",
            href: "/feedback/f1",
          },
        ],
        total: 230,
        phase: "paging",
        pending: 4,
      }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("kept");
    expect(html).toMatch(/aria-current="page"[^>]*>4</);
    expect(html).toContain(
      '<p class="meta" role="status">230 pieces of feedback</p>',
    );
  });
});

describe("No such view", () => {
  it.each([
    [{ project: "elsewhere" }],
    [{ rating: "unrated" }],
    [{ page: "0" }],
    [{ page: "x" }],
  ])("is drawn for %j, with Back to Feedback at rest", async (search) => {
    const html = await orgBody(search);
    expect(html).toContain("No such view");
    expect(html).toContain(
      "That filter doesn’t match a project or a rating in Personal.",
    );
    expect(html).toContain('href="/feedback">Back to Feedback</a>');
    expect(html).not.toContain('aria-label="Feedback"');
  });

  it("is drawn for a page past the last and for the API's refusal", async () => {
    api.page = { records: [], total: 60 };
    expect(await orgBody({ page: "9" })).toContain("No such view");
    api.page = new ApiError(400, "bad page");
    expect(await orgBody({ page: "2" })).toContain("No such view");
  });

  it("goes back to the project's list with a project picked", async () => {
    const html = await projectPage("p1", { rating: "unrated" });
    expect(html).toContain('href="/projects/p1/feedback">Back to Feedback</a>');
  });
});

describe("the ways out", () => {
  it("Clear goes to page 1 with no search and no filter, only while one is set", async () => {
    expect(await orgBody()).not.toContain(">Clear<");
    const html = await orgBody({ q: "x", rating: "disliked", page: "1" });
    expect(html).toContain(
      '<a class="btn" aria-label="Clear search and filters" href="/feedback">Clear</a>',
    );
  });

  it("a row's message opens the item with the way back to this place", async () => {
    api.page = { records: [record(7, { message: "결제 오류" })], total: 1 };
    const html = await orgBody({ q: "결제" });
    expect(html).toContain(
      `href="/feedback/f7?${new URLSearchParams({ from: `/feedback?${new URLSearchParams({ q: "결제" })}` })}"`,
    );
    expect(html).toContain('lang="ko"');
    api.page = { records: [record(1)], total: 1 };
    const rest = await projectPage("p1");
    expect(rest).toContain('href="/projects/p1/feedback/f1"');
  });
});

describe("the org's list", () => {
  it("is a system page: no old-page wrapper", async () => {
    const html = await orgPage();
    expect(html).not.toContain("kb-legacy-page");
    expect(html).not.toContain("data-ui-legacy");
    expect(html).toContain("<h1>Feedback</h1>");
  });

  it("loads with the count a bar, the bar disabled and eight skeleton rows", async () => {
    const { default: Loading } = await import("@/app/(app)/feedback/loading");
    const html = renderToStaticMarkup(createElement(Loading));
    expect(html).not.toContain("kb-legacy-page");
    expect(html).toContain('<span class="sr-only">Loading…</span>');
    expect(html.match(/<tr aria-hidden="true">/g)?.length).toBe(8);
    expect(html).toMatch(
      /<button type="submit" class="btn" disabled="">Search/,
    );
  });
});
