import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DEFERRED_FILTERS } from "@/content/workspace/deferred";
import {
  DeferredFilter,
  DeferredJob,
  DeferredList,
  deferredListView,
  filterChoices,
  isSliceId,
  jobItem,
  promotedPhase,
  readDeferredPlace,
  withQuery,
  withStatus,
  type DeferredPlace,
} from "@/hi2vi/workspace/deferred";
import { loadDeferredList, loadJob } from "@/hi2vi/workspace/deferred/load";
import { promotedSub } from "@/hi2vi/workspace/deferred/job-model";
import { wsSyncLine } from "@/hi2vi/workspace/frame";
import {
  decodeWorkspaceFrom,
  deferredHref,
  FROM_PARAM,
  JOB_FILTERS,
  jobHref,
  wayBack,
  type JobFilter,
} from "@/lib/workspace/address";
import type { AgendaItem, Job, JobRow, PhaseRow } from "@/lib/workspace/types";

// The Deferred jobs list and one job (design job 02, round 02-agenda-and-links; `DeferredList`, `DeferredFilter`,
// `DeferredJob`; frame.md F300, F82): the status filter's sets and counts, the search, fifty a page with the page
// in the address, the empty sentences, the filter's rooms that hold still, the way back through `from`, and the
// reads each page makes. The look is the fidelity slices', checked live.

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

const PROJECT = "3f6c2a9e-8b1d-4e7a-9c05-6d2e1f4b7a10";
const TOKEN = "session-token";

// -- a workspace of this size and shape: 293 open jobs, 36 dropped, 2 promoted, none done ---------------------

const SUBJECTS = [
  "Rate-limit sign-in attempts per address",
  "Old hosts: drop the redirect after 90 days",
  "A per-org switch for what a workspace sync may upload",
  "Search: index paragraphs, not only pages",
  "재생 속도를 기억하기",
  "The top bar runs off the screen under 340 px",
  "Export highlights to Markdown",
  "Log the request id on every 5xx",
  "A dark scheme for the public library",
  "Backfill created dates for imported documents",
  "Rename tenant to org in the API’s error text",
  "Decide the face for long reading",
  "The pager's ellipsis sits low beside a number",
  "Keep the reader's place across two devices",
  "Retire the old Feedback sheet once the new one lands",
  "A code reader for the docs phase too",
  "Smoke suite: count the probes it skips",
];
const TRIGGERS = [
  "Before sign-up opens to the public",
  "After Feb 12, 2027",
  "Before a company’s project is linked",
  "In the next search phase",
  "Next time Listen is touched",
  "When the shell is built from the signed design",
  "If a second reader asks",
  "Next time the error handler is touched",
];
const SOURCES = [
  "P56-t8.S3",
  "P57-4q.DECOMP",
  "P52-d6.REVIEW",
  "P38.REVIEW",
  "P-7kq2.REVIEW",
  "superseded D12 (P34)",
  "P54-k9.F2",
];

function job(n: number, status: JobRow["status"]): JobRow {
  const subject = SUBJECTS[n % SUBJECTS.length];
  const day = String((n % 28) + 1).padStart(2, "0");
  const month = String((n % 11) + 1).padStart(2, "0");
  return {
    id: `D${n}-${(n * 7919).toString(36).slice(-2)}`,
    title: n % SUBJECTS.length === 4 ? subject : `${subject} (${n})`,
    lang: n % SUBJECTS.length === 4 ? "ko" : "en",
    status,
    source: SOURCES[n % SOURCES.length],
    trigger: TRIGGERS[n % TRIGGERS.length],
    created: `2026-${month}-${day}`,
    reason:
      "Found while moving the session: outside the slice, and the fix is known.",
    promotedTo: status === "promoted" ? "P58-yw" : null,
    dropped: status === "dropped" ? "Superseded by the signed design." : null,
    agenda: null,
  };
}

/** The workspace's order (by id, newest first), statuses spread as this host has them. */
const JOBS: JobRow[] = Array.from({ length: 331 }, (_, i) => {
  const n = 331 - i;
  const status: JobRow["status"] =
    n % 9 === 0
      ? "dropped"
      : n === 140 || n === 125
        ? "promoted"
        : n % 10 === 3
          ? "ready"
          : "deferred";
  return job(n, status);
});
// fix the spread to this host's: 36 dropped, 2 promoted, the rest open
const COUNTS = JOBS.reduce<Record<string, number>>((m, j) => {
  m[j.status ?? ""] = (m[j.status ?? ""] ?? 0) + 1;
  return m;
}, {});

const place = (p: Partial<DeferredPlace> = {}): DeferredPlace => ({
  q: "",
  status: "open",
  page: 1,
  ...p,
});

describe("the status filter's sets", () => {
  it("Open counts the deferred and the ready jobs; the other three are their own", () => {
    const v = deferredListView(JOBS, place());
    const open = (COUNTS.deferred ?? 0) + (COUNTS.ready ?? 0);
    expect(COUNTS.ready).toBeGreaterThan(0);
    expect(v.totals).toEqual({
      open,
      promoted: COUNTS.promoted ?? 0,
      dropped: COUNTS.dropped ?? 0,
      done: 0,
    });
    expect(v.listed).toBe(open);
    expect(v.count).toBe(`${open} open`);
    // every listed job is deferred or ready, and every ready job is listed
    const listed = new Set(
      [1, 2, 3, 4, 5, 6, 7].flatMap((page) =>
        deferredListView(JOBS, place({ page })).rows.map((j) => j.id),
      ),
    );
    expect(listed.size).toBe(open);
    for (const j of JOBS)
      expect(listed.has(j.id)).toBe(
        j.status === "deferred" || j.status === "ready",
      );
  });
});

describe("the search", () => {
  it("matches the trimmed text, case-blind, in id, title, source and trigger, and counts per status", () => {
    const v = deferredListView(JOBS, place({ q: "  REDIRECT " }));
    const hits = JOBS.filter((j) =>
      j.title?.toLowerCase().includes("redirect"),
    );
    const per = (s: JobFilter) =>
      hits.filter((j) =>
        s === "open"
          ? j.status === "deferred" || j.status === "ready"
          : j.status === s,
      ).length;
    expect(v.counts).toEqual({
      open: per("open"),
      promoted: per("promoted"),
      dropped: per("dropped"),
      done: per("done"),
    });
    expect(v.counts.dropped).toBeGreaterThan(0);
    expect(v.count).toBe(`${per("open")} of ${v.totals.open} open`);
    // the totals stay the whole workspace's
    expect(v.totals).toEqual(deferredListView(JOBS, place()).totals);
    // a source and a trigger are searched; the reason is not
    expect(
      deferredListView(JOBS, place({ q: "p57-4q.decomp" })).listed,
    ).toBeGreaterThan(0);
    expect(
      deferredListView(JOBS, place({ q: "feb 12, 2027" })).listed,
    ).toBeGreaterThan(0);
    expect(
      deferredListView(JOBS, place({ q: "outside the slice" })).listed,
    ).toBe(0);
    expect(
      deferredListView(JOBS, place({ q: "D331-" })).rows.map((j) => j.id),
    ).toEqual([JOBS[0].id]);
  });
});

describe("fifty a page, the page in the address", () => {
  it("pages the listed jobs in the workspace's order, the last page short, a page past the last held", () => {
    const open = deferredListView(JOBS, place()).listed;
    const pages = Math.ceil(open / 50);
    const first = deferredListView(JOBS, place());
    expect(first.rows).toHaveLength(50);
    expect(first.pager).toEqual({ page: 1, pages, first: 1, last: 50 });
    const last = deferredListView(JOBS, place({ page: pages }));
    expect(last.rows).toHaveLength(open - 50 * (pages - 1));
    expect(deferredListView(JOBS, place({ page: 99 })).place.page).toBe(pages);
    // the workspace's own order
    const ids = first.rows.map((j) => j.id);
    expect(ids).toEqual(
      JOBS.filter((j) => j.status === "deferred" || j.status === "ready")
        .slice(0, 50)
        .map((j) => j.id),
    );
    // no pager with one page
    expect(
      deferredListView(JOBS, place({ status: "dropped" })).pager,
    ).toBeNull();
  });

  it("a search or a status change goes to page 1, and the address says so", () => {
    const at = place({ q: "sign-in", status: "open", page: 3 });
    expect(withQuery(at, "sign-in a")).toEqual({
      q: "sign-in a",
      status: "open",
      page: 1,
    });
    expect(withStatus(at, "dropped")).toEqual({
      q: "sign-in",
      status: "dropped",
      page: 1,
    });
    expect(deferredHref(PROJECT, withStatus(at, "dropped"))).toBe(
      `/projects/${PROJECT}/workspace/deferred?q=sign-in&status=dropped`,
    );
    expect(
      readDeferredPlace({ q: "sign-in", status: "dropped", page: "3" }),
    ).toEqual({
      q: "sign-in",
      status: "dropped",
      page: 3,
    });
    expect(readDeferredPlace({ status: "nope", page: "0" })).toEqual(place());
  });
});

describe("the empty sentences", () => {
  it("says each case in its own words", () => {
    const none = deferredListView([], place());
    expect(none.empty).toBe(
      "No deferred jobs yet. An agent files one when a slice finds work for later.",
    );
    expect(none.count).toBe("0 open");
    expect(none.tools).toBe(false);
    expect(deferredListView(JOBS, place({ status: "done" })).empty).toBe(
      "No job is done.",
    );
    const only = (status: JobRow["status"]) => [job(1, status)];
    expect(deferredListView(only("done"), place()).empty).toBe("No open jobs.");
    expect(
      deferredListView(only("done"), place({ status: "promoted" })).empty,
    ).toBe("No job has been promoted.");
    expect(
      deferredListView(only("done"), place({ status: "dropped" })).empty,
    ).toBe("No job has been dropped.");
    // a search with matches elsewhere, quoted trimmed; and with none anywhere
    const promotedOnly = JOBS.find((j) => j.status === "promoted")!.id;
    expect(
      deferredListView(JOBS, place({ q: ` ${promotedOnly} ` })).empty,
    ).toBe(`No open job contains “${promotedOnly}”.`);
    expect(deferredListView(JOBS, place({ q: "zebra" })).empty).toBe(
      "No deferred job contains “zebra”.",
    );
    expect(deferredListView(JOBS, place()).empty).toBeNull();
  });
});

describe("the filter holds still", () => {
  it("keeps every choice's room while a search changes its count", () => {
    const rooms = (q: string) => {
      const v = deferredListView(JOBS, place({ q }));
      return filterChoices("open", v.counts, v.totals, DEFERRED_FILTERS).map(
        (c) => c.room,
      );
    };
    const still = rooms("");
    expect(still).toEqual(["293", "2", "36", "0"]);
    for (const q of ["s", "si", "sig", "sign-in", "redirect", "zebra", "재생"])
      expect(rooms(q)).toEqual(still);
    // a count on show changes; its room does not
    const typed = deferredListView(JOBS, place({ q: "sign-in" }));
    const choices = filterChoices(
      "open",
      typed.counts,
      typed.totals,
      DEFERRED_FILTERS,
    );
    expect(choices[0].count).not.toBe(choices[0].room);
  });

  it("draws a bar in each room while loading, every choice off", () => {
    const html = renderToStaticMarkup(
      createElement(DeferredFilter, {
        value: "open",
        counts: null,
        totals: null,
        disabled: true,
      }),
    );
    expect(html.split('class="skel"').length - 1).toBe(4);
    expect(html.split("disabled").length - 1).toBe(4);
    expect(html).toContain('role="group" aria-label="Status"');
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("the list as it draws", () => {
  const created = Object.fromEntries(JOBS.map((j) => [j.id, "Nov 14"]));
  const render = (at: DeferredPlace) =>
    renderToStaticMarkup(
      createElement(DeferredList, {
        project: PROJECT,
        jobs: JOBS,
        created,
        place: at,
      }),
    );

  it("draws the head's count as a status, fifty rows, the pager's range and page links", () => {
    const html = render(place({ q: "", status: "open", page: 2 }));
    expect(html).toContain('<p class="meta" role="status">293 open</p>');
    expect(html.split('class="row ws-row"').length - 1).toBe(50);
    expect(html).toContain('aria-label="Deferred jobs, pages"');
    expect(html).toContain("51–100 of 293");
    expect(html).toContain(
      `href="/projects/${PROJECT}/workspace/deferred?page=3"`,
    );
    expect(html).toContain(`href="/projects/${PROJECT}/workspace/deferred"`);
    expect(html).toContain('lang="ko"');
  });

  it("opens a job carrying the list's search, status and page; the way back returns there", () => {
    const at = place({ q: "sign", status: "open", page: 2 });
    const html = render(at);
    const href = /href="([^"]*\/workspace\/deferred\/D[^"]*)"/
      .exec(html)?.[1]
      .replaceAll("&amp;", "&");
    expect(href).toBeDefined();
    const from = new URL(href!, "https://x.test").searchParams.get(FROM_PARAM);
    const list = decodeWorkspaceFrom(from, PROJECT);
    expect(list).toEqual({ list: "deferred", q: "sign", page: 2 });
    expect(wayBack(PROJECT, { kind: "job" }, list).href).toBe(
      deferredHref(PROJECT, { q: "sign", status: "open", page: 2 }),
    );
    const dropped = jobHref(PROJECT, "D9-x1", {
      list: "deferred",
      status: "dropped",
      page: 1,
    });
    const back = wayBack(
      PROJECT,
      { kind: "job" },
      decodeWorkspaceFrom(
        new URL(dropped, "https://x.test").searchParams.get(FROM_PARAM),
        PROJECT,
      ),
    );
    expect(back.href).toBe(
      `/projects/${PROJECT}/workspace/deferred?status=dropped`,
    );
  });

  it("with no job at all draws the sentence and no toolbar", () => {
    const html = renderToStaticMarkup(
      createElement(DeferredList, {
        project: PROJECT,
        jobs: [],
        created: {},
        place: place(),
      }),
    );
    expect(html).toContain("0 open");
    expect(html).toContain("No deferred jobs yet.");
    expect(html).not.toContain("dj-tools");
  });
});

// -- one job ----------------------------------------------------------------------------------------------

const PHASE: PhaseRow = {
  id: "P58-yw",
  short: "P58",
  name: "Apply hi2vi: the Library",
  objective: null,
  status: "in_progress",
  created: "2026-11-14",
  started: "2026-11-14",
  completed: null,
  archived: false,
  stream: "default",
  done: 3,
  total: 7,
  current: "S4",
  gate: {
    state: "required",
    note: null,
    walkthrough: [],
    words: null,
    cleared: null,
  },
  review: { verdict: null, note: null },
  branches: [],
  agenda: null,
};

const ITEM: AgendaItem = {
  id: "A7-m3",
  title: "로그인 시도를 주소마다 제한하기",
  lang: "ko",
  note: "",
  state: "open",
  created: "2026-11-14",
  changed: null,
  phases: ["P58-yw"],
  deferred: ["D141-4r"],
  outcome: "",
  reason: "",
  sync: "waiting",
};

const JOB: Job = {
  id: "D141-4r",
  title: "Rate-limit sign-in attempts per address",
  lang: "en",
  status: "promoted",
  source: "P56-t8.S3",
  trigger: "Before sign-up opens to the public",
  created: "2026-11-14",
  reason:
    "Found while moving the session: outside the slice, and the fix is known.",
  promotedTo: "P58-yw",
  dropped: null,
  agenda: "A7-m3",
  brief:
    "## What\n\nCap sign-in at ten tries in ten minutes.\n\n## Done when\n\nOne test covers it.",
};

const HEAD = {
  version: "97",
  sync: { state: "fresh" as const, at: "2026-11-18T08:40:00Z" },
};

describe("one job", () => {
  it("draws its head, Promoted to, the facts, the brief and its agenda item", () => {
    const ws = { phases: [PHASE], agenda: [ITEM] };
    const html = renderToStaticMarkup(
      createElement(DeferredJob, {
        project: PROJECT,
        job: JOB,
        back: {
          href: `/projects/${PROJECT}/workspace/deferred?page=2`,
          label: "Deferred",
        },
        line: wsSyncLine(HEAD.sync, HEAD.version, {
          now: Date.parse("2026-11-18T08:42:00Z"),
        }),
        created: "Nov 14",
        phase: promotedPhase(JOB, ws.phases),
        item: jobItem(JOB, ws),
      }),
    );
    expect(html).toContain(
      `href="/projects/${PROJECT}/workspace/deferred?page=2">Deferred</a>`,
    );
    expect(html).toContain('<span class="ws-id">D141-4r</span>');
    expect(html).toContain("Promoted to");
    expect(html).toContain(
      `href="/projects/${PROJECT}/workspace/phases/P58-yw"`,
    );
    expect(html).toContain("3/7");
    expect(html).toContain(
      `href="/projects/${PROJECT}/workspace/slices/P56-t8.S3"`,
    );
    expect(html).toContain("Deferred because");
    expect(html).not.toContain("Dropped because");
    expect(html).toContain("Brief");
    expect(html).toContain(
      `href="/projects/${PROJECT}/workspace/agenda/A7-m3"`,
    );
    expect(html).toContain("In progress");
    expect(html).toContain("Waiting for sync");
    expect(html.indexOf("Promoted to")).toBeLessThan(html.indexOf("Source"));
    expect(html.indexOf("Brief")).toBeLessThan(html.indexOf("Agenda item"));
  });

  it("draws Promoted to's current slice as `S4 <name>`, the short id alone without one", () => {
    const draw = (phase: PhaseRow) =>
      renderToStaticMarkup(
        createElement(DeferredJob, {
          project: PROJECT,
          job: JOB,
          back: {
            href: `/projects/${PROJECT}/workspace/deferred`,
            label: "Deferred",
          },
          line: wsSyncLine(HEAD.sync, HEAD.version, {
            now: Date.parse("2026-11-18T08:42:00Z"),
          }),
          created: "Nov 14",
          phase,
          item: null,
        }),
      );
    const named = {
      ...PHASE,
      currentRef: {
        id: "S4",
        full: "P58-yw.S4",
        name: "Foundations and shell",
        status: "in_progress",
      },
    };
    expect(promotedSub(named)).toEqual({
      sub: "S4 Foundations and shell",
      subLang: null,
    });
    expect(draw(named)).toContain(
      '<span class="meta ws-sub">S4 Foundations and shell</span>',
    );
    const ko = {
      ...named,
      currentRef: { ...named.currentRef, name: "문서 화면을 서명대로" },
    };
    expect(draw(ko)).toContain(
      '<span class="meta ws-sub" lang="ko">S4 문서 화면을 서명대로</span>',
    );
    // no stored name (or an older read): the short id alone; a done phase: nothing
    expect(
      promotedSub({ ...named, currentRef: { ...named.currentRef, name: null } })
        .sub,
    ).toBe("S4");
    expect(promotedSub(PHASE).sub).toBe("S4");
    expect(promotedSub({ ...named, status: "done" }).sub).toBeNull();
  });

  it("puts a dropped job's reason first and a prose source as text", () => {
    const dropped: Job = {
      ...JOB,
      status: "dropped",
      dropped: "Superseded by D139-k2.",
      promotedTo: null,
      agenda: null,
      source: "superseded D12 (P34)",
    };
    expect(isSliceId(dropped.source)).toBe(false);
    expect(isSliceId("P57-4q.DECOMP")).toBe(true);
    const html = renderToStaticMarkup(
      createElement(DeferredJob, {
        project: PROJECT,
        job: dropped,
        back: { href: "/x", label: "Deferred" },
        line: wsSyncLine(HEAD.sync, HEAD.version),
        created: "Nov 14",
        phase: null,
        item: null,
      }),
    );
    expect(html.indexOf("Dropped because")).toBeLessThan(
      html.indexOf("Source"),
    );
    expect(html).not.toContain("/workspace/slices/");
    expect(html).not.toContain("Promoted to");
    expect(html).not.toContain("Agenda item");
  });
});

// -- the reads each page makes ------------------------------------------------------------------------------

function api(
  answer: (url: string) => { status: number; body: unknown },
): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const { status, body } = answer(url);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

const WORKSPACE = {
  project: PROJECT,
  linked: true,
  ...HEAD,
  streams: [],
  pointer: { phase: null, slice: null, next: null, waiting: [] },
  phases: [PHASE],
  deferred: JOBS,
  docs: [],
  retired: [],
  agenda: [ITEM],
  unplaced: [],
};

beforeAll(() => {
  process.env.KB_API_BASE_URL = "http://kb.test:8766";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the reads", () => {
  it("the list reads the Workspace once", async () => {
    const calls = api(() => ({ status: 200, body: WORKSPACE }));
    const read = await loadDeferredList(TOKEN, PROJECT);
    expect(read.state).toBe("ready");
    expect(calls).toEqual([
      `http://kb.test:8766/app/projects/${PROJECT}/workspace`,
    ]);
  });

  it("a job reads its route, and the Workspace once only when it draws another record's row", async () => {
    const answer = (job: Job) => (url: string) =>
      url.endsWith("/workspace")
        ? { status: 200, body: WORKSPACE }
        : { status: 200, body: { ...job, workspace: HEAD } };
    let calls = api(answer(JOB));
    const linked = await loadJob(TOKEN, PROJECT, JOB.id);
    expect(calls).toEqual([
      `http://kb.test:8766/app/projects/${PROJECT}/workspace/deferred/D141-4r`,
      `http://kb.test:8766/app/projects/${PROJECT}/workspace`,
    ]);
    expect(linked.workspace?.state).toBe("ready");

    calls = api(
      answer({ ...JOB, status: "deferred", promotedTo: null, agenda: null }),
    );
    const plain = await loadJob(TOKEN, PROJECT, JOB.id);
    expect(calls).toHaveLength(1);
    expect(plain.workspace).toBeNull();

    calls = api(() => ({ status: 404, body: { detail: "job not found" } }));
    expect((await loadJob(TOKEN, PROJECT, "D0-zz")).job.state).toBe(
      "not-found",
    );
    expect(calls).toHaveLength(1);
  });
});

it("JOB_FILTERS keeps the signed order of the four choices", () => {
  expect(JOB_FILTERS).toEqual(["open", "promoted", "dropped", "done"]);
});
