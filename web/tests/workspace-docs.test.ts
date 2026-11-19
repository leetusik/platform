import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createElement,
  isValidElement,
  type ReactElement,
  Suspense,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import WorkspaceDocPage from "@/app/(app)/projects/[projectId]/workspace/docs/[doc]/page";
import WorkspaceDocsPage from "@/app/(app)/projects/[projectId]/workspace/docs/page";
import {
  DocPage,
  docsCount,
  DocsList,
  docsRow,
  docView,
  retiredCount,
} from "@/hi2vi/workspace/docs";
import { DocTop } from "@/hi2vi/workspace/docs/top";
import { wsSyncLine } from "@/hi2vi/workspace/frame";
import { dates } from "@/lib/workspace/model";
import type { Doc, DocRow, WithHead } from "@/lib/workspace/types";

// The Workspace's docs pages (design job 02, page docs): the list with Retired, one doc, an earlier version of it,
// a retired doc. The fixtures are the read model's own shapes, with a doc's history as the workspace writes it
// (stored ids `v0001`, `v2611020550`; ordinals beside them).

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({ requireIdentity: vi.fn() }));

const web = fileURLToPath(new URL("..", import.meta.url));
const PROJECT = "3f6c2a9e-8b1d-4e7a-9c05-6d2e1f4b7a10";
const NOW = Date.parse("2026-11-18T09:00:00Z");
const D = dates("Asia/Seoul", NOW);
const html = (el: ReactElement) => renderToStaticMarkup(el);

type Keyed = ReactElement<{ fallback: ReactElement; children: ReactElement }>;

/** A doc page's body: the page draws it inside a boundary keyed on the version it shows, read here as it streams. */
async function body(page: unknown): Promise<ReactElement> {
  const el = page as Keyed;
  expect(el.type).toBe(Suspense);
  const inner = el.props.children as ReactElement<object>;
  return await (inner.type as (p: object) => Promise<ReactElement>)(
    inner.props,
  );
}
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

const HEAD = {
  version: "97",
  sync: { state: "fresh" as const, at: "2026-11-18T08:40:00Z" },
};

const ARCH_SECTIONS = [
  {
    id: "architecture-1",
    title: "Shape",
    md: "One API behind one host. The web app reads it through its own server.",
  },
  {
    id: "architecture-2",
    title: "Reads",
    md: "| Route | Answers |\n| --- | --- |\n| `GET …/workspace` | the lists |",
  },
  {
    id: "architecture-3",
    title: "Writes",
    md: "The web writes only inbox entries.\n\n```\nknowledge sync --project platform\n```",
  },
  {
    id: "architecture-4",
    title: "검색 색인",
    md: "색인은 동기화 때 다시 만듭니다.",
  },
];

/** Architecture, stale: four notes from two phases, at v14 of fourteen. */
const ARCH: Doc = {
  id: "architecture",
  title: "Architecture",
  state: "stale",
  version: "v2611171507",
  ordinal: 14,
  versioned: "2026-10-28",
  from: ["P5-a3", "P4-d6"],
  stale: [
    { phase: "P7-m3", notes: 3 },
    { phase: "P8-q4", notes: 1 },
  ],
  sections: ARCH_SECTIONS,
  versions: [
    {
      version: "v2610251200",
      ordinal: 13,
      date: "2026-10-25",
      summary: "Folded in the notes of P3-vo.",
    },
    {
      version: "v0012",
      ordinal: 12,
      date: "2026-10-08",
      summary: "Cut what the code already says.",
    },
    {
      version: "v0011",
      ordinal: 11,
      date: "2026-09-21",
      summary: "Folded in the notes of three phases.",
    },
  ],
};

/** Architecture at v12: its own text, the other versions (the current among them), no summary of its own. */
const ARCH_V12: Doc = {
  ...ARCH,
  version: "v0012",
  ordinal: 12,
  versioned: "2026-10-08",
  from: ["P1-x1"],
  sections: [
    { id: "architecture-1", title: "Shape", md: "Two hosts, one redirecting." },
  ],
  versions: [
    {
      version: "v2611171507",
      ordinal: 14,
      date: "2026-10-28",
      summary: "Folded in the notes of P5-a3.",
    },
    {
      version: "v2610251200",
      ordinal: 13,
      date: "2026-10-25",
      summary: "Folded in the notes of P3-vo.",
    },
    {
      version: "v0011",
      ordinal: 11,
      date: "2026-09-21",
      summary: "Folded in the notes of three phases.",
    },
  ],
};

const ROADMAP: Doc = {
  id: "roadmap",
  title: "Roadmap",
  state: "retired",
  version: "v0004",
  ordinal: 4,
  versioned: "2026-06-30",
  from: [],
  stale: [],
  sections: [
    {
      id: "roadmap-1",
      title: "Fourth quarter",
      md: "Nothing planned here any more.",
    },
  ],
  versions: [
    {
      version: "v0003",
      ordinal: 3,
      date: "2026-05-02",
      summary: "The third quarter.",
    },
  ],
};

const row = (doc: Doc): DocRow => {
  const { sections: _s, ...rest } = doc;
  return rest;
};

const DOCS: DocRow[] = [
  {
    ...row(ARCH),
    id: "product",
    title: "Product",
    state: "current",
    ordinal: 9,
    versioned: "2026-11-02",
    from: ["P2-c7", "P3-vo"],
    stale: [],
  },
  row(ARCH),
  {
    ...row(ARCH),
    id: "operations",
    title: "Operations",
    ordinal: 11,
    versioned: "2026-11-06",
    from: ["P1-k9"],
    stale: [{ phase: "P8-q4", notes: 1 }],
  },
  {
    ...row(ARCH),
    id: "qa",
    title: "QA",
    state: "current",
    ordinal: 7,
    versioned: "2026-11-13",
    from: [],
    stale: [],
  },
  {
    ...row(ARCH),
    id: "decisions",
    title: "결정 기록",
    state: "current",
    ordinal: 21,
    versioned: "2026-11-13",
    from: ["P9-m1", "P1-k9", "P5-a3"],
    stale: [],
  },
];

describe("the docs list", () => {
  it("counts the docs and the stale ones, and Retired's", () => {
    expect(docsCount(DOCS)).toBe("5 docs, 2 stale");
    expect(docsCount(DOCS.filter((d) => d.state === "current"))).toBe("3 docs");
    expect(retiredCount([row(ROADMAP), row(ROADMAP)])).toBe("2 docs");
    expect(retiredCount([row(ROADMAP)])).toBe("1 doc");
  });

  it("says what a stale doc waits for: the notes' sum, then its phases joined", () => {
    const one = docsRow(
      PROJECT,
      { ...DOCS[1], stale: [{ phase: "P7-m3", notes: 1 }] },
      D,
    );
    const two = docsRow(PROJECT, DOCS[1], D);
    const three = docsRow(
      PROJECT,
      {
        ...DOCS[1],
        stale: [
          { phase: "P6-b2", notes: 2 },
          { phase: "P7-m3", notes: 3 },
          { phase: "P8-q4", notes: 1 },
        ],
      },
      D,
    );
    expect(one.notes).toBe("1 note from P7-m3");
    expect(two.notes).toBe("4 notes from P7-m3 and P8-q4");
    expect(three.notes).toBe("6 notes from P6-b2, P7-m3 and P8-q4");
    // a retired doc waits for nothing, whatever the read says
    expect(
      docsRow(
        PROJECT,
        { ...row(ROADMAP), stale: [{ phase: "P7-m3", notes: 2 }] },
        D,
      ).notes,
    ).toBe("");
  });

  it("draws the ordinal and keeps the stored id in the address", () => {
    const r = docsRow(PROJECT, DOCS[1], D);
    expect(r.version).toBe("v14");
    expect(r.versioned).toBe("Oct 28");
    expect(r.from).toBe("P5-a3 and P4-d6");
    expect(r.href).toBe(`/projects/${PROJECT}/workspace/docs/architecture`);
    expect(docsRow(PROJECT, DOCS[3], D).from).toBeNull();
  });

  it("renders the table with its roles, the stacked line's words and the Retired panel on the same columns", () => {
    const rows = DOCS.map((d) => docsRow(PROJECT, d, D));
    const retired = [docsRow(PROJECT, row(ROADMAP), D)];
    const out = html(
      createElement(DocsList, {
        state: {
          kind: "ok",
          rows,
          count: docsCount(DOCS),
          retired,
          retiredCount: retiredCount(retired),
        },
      }),
    );
    expect(out).toMatch(/^<div class="[^"]*\bdocs-list\b[^"]*">/);
    expect(
      out.match(/<table class="[^"]*docs-table[^"]*" role="table">/g),
    ).toHaveLength(2);
    expect(out.match(/role="columnheader"/g)).toHaveLength(10);
    expect(out).toContain("5 docs, 2 stale");
    expect(out).toContain(
      '<h2 id="docs-retired-head">Retired</h2><p class="meta">1 doc</p>',
    );
    // the stale line under its status; ids never break
    expect(out).toContain(
      '<span class="status status-changes">Stale</span><span class="meta docs-wait">4 notes from <span class="ws-nobr">P7-m3</span> and <span class="ws-nobr">P8-q4</span></span>',
    );
    // the stacked row's line: `v14, versioned Oct 28, from P5-a3 and P4-d6`; a doc from no phase ends at its date
    const arch = text(out.split("Architecture")[1].split("</tr>")[0]);
    expect(arch).toContain("v14, versioned Oct 28, from P5-a3 and P4-d6");
    expect(out).toContain(
      '<td role="cell" class="docs-fact is-none"><span class="docs-join">, from </span>—</td>',
    );
    // a Korean title takes its language
    expect(out).toContain('<span lang="ko">결정 기록</span>');
    expect(out).toContain('<span class="status status-revoked">Retired</span>');
  });

  it("loads with its head and column heads over five rows, and no Retired; fails with the panel's sentence", () => {
    const loading = html(
      createElement(DocsList, { state: { kind: "loading" } }),
    );
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('class="meta"');
    expect(loading.match(/<tr role="row">/g)).toHaveLength(6);
    expect(loading).not.toContain("Retired");
    const failed = html(
      createElement(DocsList, {
        state: {
          kind: "failed",
          retry: createElement("button", null, "Try again"),
        },
      }),
    );
    expect(failed).toContain(
      '<div class="panel-body has-rule block"><p class="block-text">Docs did not load.</p><button>Try again</button></div>',
    );
    expect(failed).not.toContain("<table");
  });
});

describe("one doc", () => {
  const line = wsSyncLine(HEAD.sync, HEAD.version, {
    timeZone: "Asia/Seoul",
    now: NOW,
  });
  const back = { href: `/projects/${PROJECT}/workspace/docs`, label: "Docs" };

  it("says a stale doc's notes once, each phase a link, `is` for one note", () => {
    const view = docView(PROJECT, ARCH, ARCH, D);
    const out = html(createElement(DocPage, { view, back, line }));
    expect(text(out)).toContain(
      "4 notes from P7-m3 and P8-q4 are not folded into this doc yet.",
    );
    expect(out).toContain(
      `<a href="/projects/${PROJECT}/workspace/phases/P7-m3">P7-m3</a>`,
    );
    const single = docView(
      PROJECT,
      { ...ARCH, stale: [{ phase: "P8-q4", notes: 1 }] },
      { ...ARCH, stale: [{ phase: "P8-q4", notes: 1 }] },
      D,
    );
    expect(
      text(html(createElement(DocPage, { view: single, back, line }))),
    ).toContain("1 note from P8-q4 is not folded into this doc yet.");
    const many = {
      ...ARCH,
      stale: [
        { phase: "P6-b2", notes: 1 },
        { phase: "P7-m3", notes: 1 },
        { phase: "P8-q4", notes: 1 },
      ],
    };
    expect(
      text(
        html(
          createElement(DocPage, {
            view: docView(PROJECT, many, many, D),
            back,
            line,
          }),
        ),
      ),
    ).toContain("3 notes from P6-b2, P7-m3 and P8-q4 are not folded");
  });

  it("draws the facts, the Text with its outline, and Earlier versions newest first, each at its stored id", () => {
    const view = docView(PROJECT, ARCH, ARCH, D);
    expect(view.facts.map((f) => [f.label, f.value])).toEqual([
      ["Version", "v14"],
      ["Versioned", "Oct 28"],
      ["From", "P5-a3 and P4-d6"],
    ]);
    expect(view.sectionCount).toBe("4 sections");
    expect(view.versions.map((v) => [v.version, v.label, v.date])).toEqual([
      ["v13", "Open v13", "Oct 25"],
      ["v12", "Open v12", "Oct 8"],
      ["v11", "Open v11", "Sep 21"],
    ]);
    expect(view.versions[1].href).toBe(
      `/projects/${PROJECT}/workspace/docs/architecture?version=v0012`,
    );
    const out = html(createElement(DocPage, { view, back, line }));
    expect(out).toContain('aria-label="Back to Docs"');
    expect(out).toContain(
      '<h1>Architecture</h1><span class="status status-changes">Stale</span>',
    );
    expect(out).toContain(
      '<h2 id="docs-text-head">Text</h2><p class="meta">4 sections</p>',
    );
    expect(out).toContain('class="md-outline"');
    expect(out).toContain('<h2 id="docs-vers-head">Earlier versions</h2>');
  });

  it("draws an earlier version with its five changes", () => {
    const view = docView(PROJECT, ARCH, ARCH_V12, D);
    const docBack = {
      href: `/projects/${PROJECT}/workspace/docs/architecture`,
      label: "Architecture",
    };
    const out = html(createElement(DocPage, { view, back: docBack, line }));
    // 1. the title says the version
    expect(out).toContain("<h1>Architecture v12</h1>");
    // 2. the back link reads the doc's title and returns to it
    expect(out).toContain(
      `<a class="back" aria-label="Back to Architecture" href="/projects/${PROJECT}/workspace/docs/architecture">Architecture</a>`,
    );
    // 3. the badge where the status was
    expect(out).toContain('<span class="badge">Earlier version</span>');
    expect(out).not.toContain("Stale");
    // 4. the notice names the current version, a link to the doc
    expect(text(out)).toContain(
      "The current version is v14, versioned Oct 28.",
    );
    expect(out).toContain(
      `<a href="/projects/${PROJECT}/workspace/docs/architecture">v14</a>`,
    );
    expect(out).not.toContain("not folded");
    // 5. Versioned and Summary (from the latest's list of versions); no Version, no From
    expect(view.facts.map((f) => [f.label, f.value])).toEqual([
      ["Versioned", "Oct 8"],
      ["Summary", "Cut what the code already says."],
    ]);
    // its own text, and no Earlier versions
    expect(out).toContain("Two hosts, one redirecting.");
    expect(out).not.toContain("Earlier versions");
  });

  it("draws a retired doc with no notice and no earlier versions", () => {
    const view = docView(
      PROJECT,
      { ...ROADMAP, stale: [{ phase: "P7-m3", notes: 2 }] },
      ROADMAP,
      D,
    );
    expect(view.notice).toBeNull();
    expect(view.versions).toEqual([]);
    const out = html(createElement(DocPage, { view, back, line }));
    expect(out).toContain('<span class="status status-revoked">Retired</span>');
    expect(out).not.toContain("notice");
    expect(out).not.toContain("Earlier versions");
    expect(view.facts.find((f) => f.label === "From")?.value).toBe("—");
  });
});

describe("the docs pages' reads", () => {
  const calls: string[] = [];
  beforeAll(() => {
    process.env.KB_API_BASE_URL = "http://kb.test:8766";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
  });

  async function signedIn() {
    const headers = await import("next/headers");
    vi.mocked(headers.cookies).mockResolvedValue({
      get: () => undefined,
    } as never);
    vi.mocked(headers.headers).mockResolvedValue(
      new Headers({ host: "hi2vi.com" }) as never,
    );
    const guards = await import("@/lib/auth-guards");
    vi.mocked(guards.requireIdentity).mockResolvedValue({
      token: "session-token",
      identity: { tenant: null },
    } as never);
  }

  function api(answer: (url: string) => unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url.replace("http://kb.test:8766", ""));
        return new Response(JSON.stringify(answer(url)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  }

  const withHead = (doc: Doc): WithHead<Doc> => ({ ...doc, workspace: HEAD });
  const base = `/app/projects/${PROJECT}/workspace`;

  it("reads the list once", async () => {
    await signedIn();
    api(() => ({
      project: PROJECT,
      linked: true,
      ...HEAD,
      streams: [],
      pointer: { phase: null, slice: null, next: null, waiting: [] },
      phases: [],
      deferred: [],
      docs: DOCS,
      retired: [row(ROADMAP)],
      agenda: [],
      unplaced: [],
    }));
    const page = await WorkspaceDocsPage({
      params: Promise.resolve({ projectId: PROJECT }),
    });
    expect(calls).toEqual([base]);
    const out = html(page);
    expect(out).toContain("5 docs, 2 stale");
    expect(out).toContain('aria-current="page"');
  });

  it("reads a doc once", async () => {
    await signedIn();
    api(() => withHead(ARCH));
    const page = await body(
      await WorkspaceDocPage({
        params: Promise.resolve({ projectId: PROJECT, doc: "architecture" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(calls).toEqual([`${base}/docs/architecture`]);
    expect(html(page)).toContain("<h1>Architecture</h1>");
  });

  it("reads an earlier version at its stored id and the doc at its latest, at once", async () => {
    await signedIn();
    api((url) => withHead(url.includes("?version=") ? ARCH_V12 : ARCH));
    const page = await body(
      await WorkspaceDocPage({
        params: Promise.resolve({ projectId: PROJECT, doc: "architecture" }),
        searchParams: Promise.resolve({ version: "v0012" }),
      }),
    );
    expect(calls.sort()).toEqual([
      `${base}/docs/architecture`,
      `${base}/docs/architecture?version=v0012`,
    ]);
    const out = html(page);
    expect(out).toContain("<h1>Architecture v12</h1>");
    expect(text(out)).toContain("Cut what the code already says.");
  });
  it("draws a version's own loading under a boundary keyed on it, landing at the top", async () => {
    await signedIn();
    api(() => withHead(ARCH));
    const page = async (search: Record<string, string>) =>
      (await WorkspaceDocPage({
        params: Promise.resolve({ projectId: PROJECT, doc: "architecture" }),
        searchParams: Promise.resolve(search),
      })) as Keyed;
    const [latest, v12, v11] = await Promise.all([
      page({}),
      page({ version: "v0012" }),
      page({ version: "v0011", from: "docs" }),
    ]);
    // nothing is read before the boundary: the old version gives way to the loading form at once
    expect(calls).toEqual([]);
    for (const el of [latest, v12, v11]) expect(el.type).toBe(Suspense);
    const keys = [latest.key, v12.key, v11.key];
    expect(new Set(keys).size).toBe(3);
    expect(keys).toContain("v0012");
    // the fallback is the Doc loading form, its way back reading Docs, and it lands at the top
    const fallback = v12.props.fallback as ReactElement<{
      children: ReactElement[];
    }>;
    const [top, loading] = fallback.props.children;
    expect(isValidElement(top) && top.type).toBe(DocTop);
    const out = html(loading);
    expect(out).toContain('aria-label="Back to Docs"');
    expect(out).toContain(`href="/projects/${PROJECT}/workspace/docs"`);
    expect(out).toContain('aria-busy="true"');
  });

  it("draws Doc not found under the back row, with the sync line and the project's name", async () => {
    await signedIn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.replace("http://kb.test:8766", "");
        calls.push(path);
        const [status, body] = path.includes("/docs/")
          ? [404, { detail: "doc not found" }]
          : path.endsWith("/workspace")
            ? [
                200,
                {
                  project: PROJECT,
                  linked: true,
                  ...HEAD,
                  streams: [],
                  pointer: {
                    phase: null,
                    slice: null,
                    next: null,
                    waiting: [],
                  },
                  phases: [],
                  deferred: [],
                  docs: DOCS,
                  retired: [],
                  agenda: [],
                  unplaced: [],
                },
              ]
            : [
                200,
                {
                  project: {
                    id: PROJECT,
                    name: "platform",
                    visibility: "private",
                    created_at: "2026-03-02T01:30:00Z",
                  },
                },
              ];
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const page = (await body(
      await WorkspaceDocPage({
        params: Promise.resolve({ projectId: PROJECT, doc: "glossary" }),
        searchParams: Promise.resolve({}),
      }),
    )) as ReactElement<{
      children: ReactElement<{ state?: unknown; children?: ReactElement }>[];
    }>;
    const [header, block] = page.props.children;
    expect(block.props.state).toEqual({
      title: "Doc not found",
      text: "This doc doesn’t exist, or it isn’t part of platform.",
      actions: [
        {
          kind: "link",
          label: "Back to Docs",
          href: `/projects/${PROJECT}/workspace/docs`,
          variant: "default",
        },
      ],
      reference: null,
    });
    const top = html(header);
    expect(top).toContain('aria-label="Back to Docs"');
    expect(top).toContain("Synced ");
  });
});

describe("the docs sheet", () => {
  it("holds the boards' rules in the system's scope", () => {
    const sheet = readFileSync(
      join(web, "src/hi2vi/styles/workspace/docs.css"),
      "utf8",
    );
    expect(sheet).toContain("@scope (.ui) to ([data-ui-legacy]) {");
    expect(sheet).toContain(".docs-list { container-type: inline-size; }");
    expect(sheet).toContain("@container (max-width: 47.99em)");
    expect(sheet).toContain(".docs-join { display: none; }");
  });
});
