import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Slice, WithHead } from "@/lib/workspace/types";

// A slice's page (design job 02, `Slice.dc.html`, `SliceHead`, `SliceVerdict`, `SliceCommits`; frame.md F84 to
// F86, F305): the one sentence in each state, the verdict's fields, the plan's Sections list from five sections,
// the commits (nothing with none), and the page's one read, which carries the sync line.

vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({
    token: "session-token",
    identity: { tenant: { id: "t1", slug: "june", name: "Personal" } },
  })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "kb_tz" ? { value: "Asia/Seoul" } : undefined,
  })),
  headers: vi.fn(async () => new Headers()),
}));

const {
  planOutline,
  sliceCommits,
  sliceFacts,
  sliceLead,
  SliceCommits,
  SlicePage,
  verdictFields,
  verdictFiles,
} = await import("@/sikstack/workspace/slice");
const { wsSyncLine } = await import("@/sikstack/workspace/frame");
const SliceRoute = (
  await import("@/app/(app)/projects/[projectId]/workspace/slices/[sliceId]/page")
).default;

const PROJECT = "3f6c2a9e-8b1d-4e7a-9c05-6d2e1f4b7a10";
const HEAD = {
  version: "v97",
  sync: { state: "fresh" as const, at: "2026-11-18T08:40:00Z" },
};

/** A plan as the workspace writes them: a title, sections, an eight-column table and a code block. */
function plan(sections: number): string {
  const names = [
    "Your slice",
    "Read for this slice",
    "The phase, briefly",
    "Always",
    "Wave",
    "Returning",
  ];
  return [
    "# The slice page",
    "",
    ...names
      .slice(0, sections)
      .flatMap((name, i) => [
        `## ${name}`,
        "",
        i === 0
          ? [
              "| Claim | Kind | Seen failing | Passing | Command | Runtime | Owner | Note |",
              "| --- | --- | --- | --- | --- | --- | --- | --- |",
              "| Files changed reads `—` for prose | claim | before | yes | `vitest run` | node | web | F86 |",
            ].join("\n")
          : "Build the head, the sentence and the facts **as signed**; nothing is redesigned.",
        "",
        "### Detail",
        "",
        "```sh\npnpm --dir web test -- tests/workspace-slice.test.ts\n```",
        "",
      ]),
  ].join("\n");
}

const DONE: Slice = {
  id: "S1",
  full: "P8-q4.S1",
  phase: "P8-q4",
  name: "Server endpoint",
  kind: "implementation",
  status: "done",
  risk: "low",
  deps: ["DECOMP"],
  started: "2026-11-12",
  completed: "2026-11-12",
  outcome: "The retry endpoint is in place.",
  plan: plan(4),
  result: {
    verdict: {
      status: "done",
      route: "mid",
      model: "sonnet",
      effort: "medium",
      summary: "The retry endpoint is in place.",
      files: "`server/retry.py`; `tests/test_retry.py`",
      validation: "- `pytest tests/test_retry.py`: pass\n- parity: pass",
      deviations: "none",
      docImpact: "architecture.md: the retry queue",
    },
    body: "## What changed\n\n- `server/retry.py`: the endpoint.",
  },
  stop: null,
};

const WAITING: Slice = {
  ...DONE,
  id: "S2",
  full: "P23-h7.S2",
  phase: "P23-h7",
  name: "회의록 정리",
  kind: "co-work",
  status: "pending",
  risk: "high",
  deps: [],
  completed: null,
  outcome: null,
  result: null,
  stop: {
    kind: "decision",
    what: null,
    words: "“accept” signs the canvas as drawn.",
    since: "2026-11-16",
  },
};

const day = (v: string | null | undefined) => (v ? `day ${v}` : "—");
const depHref = (full: string) => `/slices/${full}`;
const html = (el: ReactElement) => renderToStaticMarkup(el);

describe("the one sentence under a slice's title", () => {
  it("is the outcome of a slice that has one", () => {
    expect(sliceLead(DONE)).toEqual({
      text: "The retry endpoint is in place.",
      words: null,
    });
  });

  it("is left out for a stop with no `what`, its words still drawn, Stop and Since leading the facts", () => {
    expect(sliceLead(WAITING)).toEqual({
      text: null,
      words: "“accept” signs the canvas as drawn.",
    });
    const facts = sliceFacts(WAITING, day, depHref);
    expect(facts.map((f) => f.label)).toEqual([
      "Stop",
      "Since",
      "Risk",
      "Depends on",
      "Started",
      "Completed",
    ]);
    expect(facts[0].text).toBe("Decision");
    expect(facts[1].text).toBe("day 2026-11-16");
    expect(facts[3].text).toBe("—");
    const page = html(
      createElement(SlicePage, {
        slice: WAITING,
        commits: [],
        back: { href: "/p", label: "P23-h7" },
        line: wsSyncLine(HEAD.sync, HEAD.version),
        date: day,
        depHref,
      }),
    );
    expect(page).not.toContain("slice-lead-text");
    expect(page).toContain(
      '<p class="slice-words ws-prose">“accept” signs the canvas as drawn.</p>',
    );
    expect(page).toContain('<span lang="ko">회의록 정리</span>');
  });

  it("is nothing for a slice with neither an outcome nor a stop", () => {
    expect(sliceLead({ ...DONE, status: "todo", outcome: null })).toBeNull();
    // a stop on a slice that no longer waits is not drawn
    expect(
      sliceLead({ ...WAITING, status: "in_progress", outcome: null }),
    ).toBeNull();
  });
});

describe("the verdict", () => {
  it("leaves Summary out when it repeats the outcome, and keeps it otherwise", () => {
    expect(
      verdictFields(DONE.result!.verdict, DONE.outcome).map((f) => f.label),
    ).toEqual(["Validation", "Deviations", "Doc impact"]);
    expect(
      verdictFields(
        DONE.result!.verdict,
        "Sent back: the retry has no limit.",
      ).map((f) => f.label),
    ).toEqual(["Summary", "Validation", "Deviations", "Doc impact"]);
  });

  it("reads Files changed as `—` for prose and as the number when it is one", () => {
    expect(verdictFiles("`server/retry.py`; `tests/test_retry.py`")).toBe("—");
    expect(verdictFiles("7")).toBe("7");
    expect(verdictFiles(1204 as unknown as string)).toBe("1,204");
    expect(verdictFiles(null)).toBe("—");
  });
});

describe("the plan's Sections list", () => {
  it("comes from five sections, never four", () => {
    expect(planOutline(plan(4))).toBe(false);
    expect(planOutline(plan(5))).toBe(true);
    const draw = (p: string) =>
      html(
        createElement(SlicePage, {
          slice: { ...DONE, plan: p },
          commits: [],
          back: { href: "/p", label: "P8-q4" },
          line: wsSyncLine(HEAD.sync, HEAD.version),
          date: day,
          depHref,
        }),
      );
    expect(draw(plan(4))).not.toContain("md-outline");
    expect(draw(plan(5))).toContain('<nav class="md-outline"');
  });
});

describe("a slice's commits", () => {
  const COMMITS = [
    {
      repo: "platform",
      sha: "4f1c2a9e07b3d58c61e2f9a04b7d3c8e5a1f6b20",
      short: "4f1c2a9",
      subject: "Serve the app at the apex and redirect the old hosts",
      url: "https://github.com/june/platform/commit/4f1c2a9e07b3d58c61e2f9a04b7d3c8e5a1f6b20",
    },
    {
      repo: "vocky",
      sha: "b72d05e1c9a84f3b6d0e27c5a1f84b9d3e6c0a57",
      short: "b72d05e",
      subject: "Redirect the old reader host to the apex",
      url: "https://github.com/june/vocky/commit/b72d05e1c9a84f3b6d0e27c5a1f84b9d3e6c0a57",
    },
  ];

  it("labels each row's link with the commit, its repo and its subject", () => {
    const out = html(
      createElement(SliceCommits, {
        commits: sliceCommits({ commits: COMMITS }),
      }),
    );
    expect(out).toContain('<p class="meta">2 commits</p>');
    expect(out).toContain(
      'aria-label="Commit 4f1c2a9 in platform on GitHub: Serve the app at the apex and redirect the old hosts"',
    );
    expect(out).toContain(
      '<span class="dim ws-state"><span class="sr-only">Repository </span>vocky</span>',
    );
  });

  it("draws nothing when the slice has none (the read model stores none today)", () => {
    expect(sliceCommits(DONE)).toEqual([]);
    expect(
      html(createElement(SliceCommits, { commits: sliceCommits(DONE) })),
    ).toBe("");
  });
});

// -- the route -------------------------------------------------------------------------------

interface Call {
  url: string;
}

function api(answer: (url: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push({ url });
      const { status, body } = answer(url);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

beforeAll(() => {
  process.env.KB_API_BASE_URL = "http://kb.test:8766";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function route(slice: string, from?: string) {
  return html(
    (await SliceRoute({
      params: Promise.resolve({ projectId: PROJECT, sliceId: slice }),
      searchParams: Promise.resolve(from ? { from } : {}),
    })) as ReactElement,
  );
}

describe("the slice's route", () => {
  it("reads once, and that read carries the back row's sync line", async () => {
    const record: WithHead<Slice> = { ...DONE, workspace: HEAD };
    const calls = api((url) =>
      url.endsWith(`/workspace/slices/P8-q4.S1`)
        ? { status: 200, body: record }
        : { status: 500, body: {} },
    );
    const out = await route(
      "P8-q4.S1",
      `/projects/${PROJECT}/workspace/backlog?archived=2`,
    );
    expect(calls.map((c) => c.url)).toEqual([
      `http://kb.test:8766/app/projects/${PROJECT}/workspace/slices/P8-q4.S1`,
    ]);
    expect(out).toContain('<p class="sync">');
    expect(out).toContain("v97");
    // the back link reads the phase's id and carries the backlog's page on
    expect(out).toContain('aria-label="Back to P8-q4"');
    expect(out).toContain(
      `href="/projects/${PROJECT}/workspace/phases/P8-q4?from=%2Fprojects%2F${PROJECT}%2Fworkspace%2Fbacklog%3Farchived%3D2"`,
    );
    expect(out).toContain('<span class="ws-fact-link-id">DECOMP</span>');
    expect(out).toContain('<span class="status status-done">Done</span>');
    expect(out).toContain('<span class="badge">Implementation</span>');
  });

  it("says Slice not found under the back row, naming the project", async () => {
    api((url) => {
      if (url.endsWith("/app/projects"))
        return {
          status: 200,
          body: { projects: [{ id: PROJECT, name: "platform" }] },
        };
      if (url.endsWith(`/projects/${PROJECT}/workspace`))
        return {
          status: 200,
          body: { project: PROJECT, linked: true, ...HEAD, agenda: [] },
        };
      return { status: 404, body: { detail: "slice not found" } };
    });
    const out = await route("P8-q4.S9");
    expect(out).toContain("Slice not found");
    expect(out).toContain(
      "This slice doesn’t exist, or it isn’t part of platform.",
    );
    expect(out).toContain("Back to P8-q4");
    expect(out).toContain('<p class="sync">');
  });
});
