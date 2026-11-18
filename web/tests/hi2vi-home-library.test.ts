import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  KbDashboard,
  KbDashboardProject,
  KbOrgLibrary,
} from "@/lib/knowledge/types";

// Org home and project home (P63, D254-wv, D246-p7, D248-j7), proved through the pages themselves:
// each page is called as the server calls it, its reads stubbed, and the props it hands its panels
// read off the element tree it returns (nothing is rendered).

const jar = vi.hoisted(() => ({ zone: null as string | null }));
const reads = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getDocuments: vi.fn(),
  getUsage: vi.fn(),
  listOrgCredentials: vi.fn(),
  getOrgLibrary: vi.fn(),
  getProjectUsage: vi.fn(),
  listFeedback: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "kb_tz" && jar.zone !== null ? { value: jar.zone } : undefined,
  })),
  headers: vi.fn(async () => new Headers({ host: "hi2vi.com" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
  useRouter: vi.fn(),
}));
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({
    token: "tok",
    identity: { tenant: { id: "t1", slug: "june", name: "Personal" } },
  })),
}));
vi.mock("@/lib/knowledge/app", () => ({
  getDashboard: reads.getDashboard,
  getDocuments: reads.getDocuments,
  getUsage: reads.getUsage,
  listOrgCredentials: reads.listOrgCredentials,
  getOrgLibrary: reads.getOrgLibrary,
  getProjectUsage: reads.getProjectUsage,
}));
vi.mock("@/lib/feedback/app", () => ({ listFeedback: reads.listFeedback }));
vi.mock("@/lib/workspace/read", () => ({
  readWorkspace: vi.fn(async () => ({
    state: "unlinked",
    head: { version: null, sync: { state: "unlinked", at: null } },
  })),
}));

const { default: DashboardPage } = await import("@/app/(app)/dashboard/page");
const { ProjectsPanel } = await import("@/app/(app)/dashboard/projects-panel");
const { default: ProjectHomePage } =
  await import("@/app/(app)/projects/[projectId]/page");
const { LibraryPanel } = await import("@/app/(app)/projects/[projectId]/parts");
const { ProjectHead } =
  await import("@/app/(app)/projects/[projectId]/project-head");

/** Every element of `type` in the tree a page returned. */
function find(node: ReactNode, type: unknown): ReactElement[] {
  const found: ReactElement[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    if (n.type === type) found.push(n);
    walk((n.props as { children?: ReactNode }).children);
  };
  walk(node);
  return found;
}

/** Half past eleven at night in UTC: already the next day in Seoul. */
const LATE = "2026-11-16T23:30:00Z";

function project(i: number, extra: Partial<KbDashboardProject> = {}) {
  return {
    id: `p${i}`,
    name: `Project ${i}`,
    created_at: LATE,
    documents: 0,
    keys: 1,
    last_used_at: null,
    visibility: "private" as const,
    ...extra,
  };
}

function orgHomeReads(projects: KbDashboardProject[]) {
  const dashboard: KbDashboard = { projects, activity: [] };
  reads.getDashboard.mockResolvedValue(dashboard);
  reads.getDocuments.mockResolvedValue({ items: [], total: 7 });
  reads.getUsage.mockResolvedValue({
    window: {},
    totals: { documents_created: 0, searches: 0, documents_deleted: 0 },
    daily_counts: [],
    projects: [],
  });
  reads.listOrgCredentials.mockResolvedValue([]);
}

async function projectsPanelRows() {
  const tree = await DashboardPage();
  const [panel] = find(tree, ProjectsPanel);
  return (panel.props as { rows: { docs: string; created: string }[] | null })
    .rows;
}

beforeEach(() => {
  jar.zone = null;
  for (const read of Object.values(reads)) read.mockReset();
});

describe("org home", () => {
  it("dates a project in the viewer's zone from the cookie, UTC without it", async () => {
    orgHomeReads([project(1)]);
    jar.zone = "Asia/Seoul";
    expect((await projectsPanelRows())?.[0].created).toBe("Nov 17");
    jar.zone = null;
    expect((await projectsPanelRows())?.[0].created).toBe("Nov 16");
  });

  it("reads every project's count from the one dashboard read", async () => {
    const many = Array.from({ length: 24 }, (_, i) =>
      project(i, { active_documents: i * 10 }),
    );
    orgHomeReads(many);
    const rows = await projectsPanelRows();
    expect(reads.getDashboard).toHaveBeenCalledTimes(1);
    // the one remaining documents read is the org's Active total, not a project's
    expect(reads.getDocuments).toHaveBeenCalledTimes(1);
    expect(reads.getDocuments.mock.calls[0][1]).toEqual({ limit: 1 });
    expect(rows).toHaveLength(24);
    expect(rows?.find((r) => r.created && r.docs === "230")).toBeDefined();
    expect(rows?.map((r) => r.docs)).toContain("0");
  });

  it("keeps the table when the counts could not be read", async () => {
    orgHomeReads([
      project(1, { active_documents: null }),
      project(2, { active_documents: null }),
    ]);
    const rows = await projectsPanelRows();
    expect(rows).toHaveLength(2);
    expect(rows?.map((r) => r.docs)).toEqual(["—", "—"]);
  });
});

const listing: KbOrgLibrary = {
  org: { id: "t1", slug: "june", name: "Personal", label: "june" },
  member: true,
  projects: [{ name: "platform", visibility: "private" }],
  books: [
    {
      project: "platform",
      slug: "handbook",
      title: "The platform handbook",
      sub: "플랫폼 안내서",
      kind: "codebase",
      subject: null,
      chapters: [
        {
          key: "c1",
          position: 1,
          title: null,
          variants: [
            {
              lang: "en",
              doc: "2026-11-10-c1",
              doc_id: 9,
              title: "One",
              version: 1,
              format: "native",
            },
          ],
        },
      ],
    },
    {
      project: "platform",
      slug: "guide",
      title: "A guide",
      kind: "codebase",
      subject: null,
      chapters: [],
    },
  ],
  documents: [
    {
      id: 1,
      project: "platform",
      slug: "capture",
      doc: "2026-11-14-capture",
      title: "How capture deduplicates feedback",
      date: "2026-11-14",
      format: "md",
      lang: "en",
      version: 1,
      subject: null,
      reading_minutes: 6,
      canonical_path: "/@june/platform/capture",
    },
    {
      id: 2,
      project: "platform",
      slug: "older",
      doc: "2026-11-12-older",
      title: "An older one",
      date: "2026-11-12",
      format: "md",
      lang: "en",
      version: 1,
      subject: null,
      canonical_path: "/@june/platform/older",
    },
  ],
};

function projectHomeReads() {
  reads.getProjectUsage.mockResolvedValue({
    project: {
      id: "p1",
      name: "platform",
      created_at: LATE,
      visibility: "private",
    },
    totals: { documents_created: 0, searches: 0, documents_deleted: 0 },
    daily_counts: [],
    credentials: [],
  });
  reads.getDocuments.mockResolvedValue({ items: [], total: 2 });
  reads.getOrgLibrary.mockResolvedValue(listing);
  reads.listFeedback.mockResolvedValue({ records: [] });
}

async function projectHome() {
  const tree = await ProjectHomePage({
    params: Promise.resolve({ projectId: "p1" }),
  });
  const [head] = find(tree, ProjectHead);
  const [library] = find(tree, LibraryPanel);
  return {
    created: (head.props as { created: string }).created,
    library: library.props as {
      state: {
        rows: { title: string; length: string | null; sub: string | null }[];
      };
    },
  };
}

describe("project home", () => {
  it("dates the project in the viewer's zone from the cookie, UTC without it", async () => {
    projectHomeReads();
    jar.zone = "Asia/Seoul";
    expect((await projectHome()).created).toBe("Nov 17");
    jar.zone = null;
    expect((await projectHome()).created).toBe("Nov 16");
  });

  it("shows a document's reading time, and nothing where the read carries none", async () => {
    projectHomeReads();
    const { rows } = (await projectHome()).library.state;
    const length = (title: string) =>
      rows.find((r) => r.title === title)?.length;
    expect(length("How capture deduplicates feedback")).toBe("6 min");
    expect(length("An older one")).toBeNull();
  });

  it("shows a book's second title only when the read carries one", async () => {
    projectHomeReads();
    const { rows } = (await projectHome()).library.state;
    const sub = (title: string) => rows.find((r) => r.title === title)?.sub;
    expect(sub("The platform handbook")).toBe("플랫폼 안내서");
    expect(sub("A guide")).toBeNull();
  });
});
