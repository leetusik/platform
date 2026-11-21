import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  KbIdentity,
  KbLibraryDocument,
  KbOrgLibrary,
} from "@/lib/knowledge/types";

// A project's library (job 03, Library round 02, `ProjectLibrary.dc.html`; frame.md F321, F322, F71):
// the claims of P63-fk.S5 that are not the Shell's (tests/project-library-shell.test.ts).

const app = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getOrgLibrary: vi.fn(),
}));
vi.mock("@/lib/knowledge/app", () => app);
vi.mock("@/lib/knowledge/reader", () => ({
  getReaderLibrary: vi.fn(async () => ({ books: [], docs: [] })),
}));
vi.mock("@/lib/library/continue", () => ({
  loadContinue: vi.fn(async () => []),
}));
vi.mock("@/lib/auth-guards", () => ({
  optionalIdentity: vi.fn(async () => null),
  requireIdentity: vi.fn(async () => ({
    token: "tok",
    identity: { tenant: { id: "t1", slug: "june", name: "Personal" } },
  })),
}));
vi.mock("@/sikstack/shell/data", () => ({
  requestNonce: vi.fn(async () => undefined),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  usePathname: () => "/",
}));

const { ApiError } = await import("@/lib/knowledge/client");
const { loadMemberProjectOnce, loadPublicProjectOnce } =
  await import("@/lib/project-library/load");
const { projectLibraryView, visitorSource } =
  await import("@/lib/project-library/model");
const { optionalIdentity } = await import("@/lib/auth-guards");
const { ProjectParts, projectNotFound } =
  await import("@/app/(app)/projects/[projectId]/library/parts");
const { StateBlock } = await import("@/sikstack/states");
const PublicProjectPage = (await import("@/app/(public)/[org]/[project]/page"))
  .default;

function doc(i: number, project: string): KbLibraryDocument {
  return {
    id: 100 - i,
    project,
    slug: `doc-${i}`,
    doc: `2026-11-1${i}-doc-${i}`,
    title: `Document ${i}`,
    date: `2026-11-1${i}`,
    format: "md",
    lang: "en",
    version: 1,
    subject: null,
    canonical_path: `/@june/${project}/doc-${i}`,
  };
}

function listing(
  projects: KbOrgLibrary["projects"] = [
    { name: "platform", visibility: "private" },
    { name: "vocky", visibility: "public" },
  ],
): KbOrgLibrary {
  return {
    org: { id: "t1", slug: "june", name: "Personal", label: "june" },
    member: false,
    projects,
    books: [],
    documents: [doc(1, "platform"), doc(2, "vocky"), doc(3, "vocky")],
  };
}

const identity = {
  tenant: { id: "t1", slug: "june", name: "Personal" },
} as unknown as KbIdentity;

/** `notFound()`'s throw. */
const notFoundThrow = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").startsWith(
    "NEXT_HTTP_ERROR_FALLBACK;404",
  );

beforeEach(() => {
  app.listProjects.mockReset();
  app.getOrgLibrary.mockReset();
});

describe("a private or missing project reads Project not found, to each viewer in its own words", () => {
  it("a member: an id that is no project of the active org is the miss", async () => {
    app.listProjects.mockResolvedValue([
      { id: "p1", name: "platform", visibility: "private" },
    ]);
    app.getOrgLibrary.mockResolvedValue(listing());
    expect(await loadMemberProjectOnce("tok", identity, "nope")).toBeNull();
    expect((await loadMemberProjectOnce("tok", identity, "p1"))?.project).toBe(
      "platform",
    );
  });

  it("a visitor: a private project, a missing one and an unknown org are one miss", async () => {
    app.getOrgLibrary.mockResolvedValue(listing());
    expect(
      await loadPublicProjectOnce(undefined, "june", "platform"),
    ).toBeNull();
    expect(await loadPublicProjectOnce(undefined, "june", "nope")).toBeNull();
    expect(
      (await loadPublicProjectOnce(undefined, "june", "vocky"))?.project,
    ).toBe("vocky");
    app.getOrgLibrary.mockRejectedValue(new ApiError(404, "not found"));
    expect(await loadPublicProjectOnce(undefined, "nope", "x")).toBeNull();
  });

  it("reads the member's words with Back to Library, the visitor's with Sign in", () => {
    const member = renderToStaticMarkup(
      createElement(StateBlock, {
        state: projectNotFound({ viewer: "member", orgName: "Personal" }),
      }),
    );
    expect(member).toContain("Project not found");
    expect(member).toContain(
      "This project doesn’t exist, or it isn’t part of Personal.",
    );
    expect(member).toContain('href="/library"');
    expect(member).toContain("Back to Library");
    const visitor = renderToStaticMarkup(
      createElement(StateBlock, {
        state: projectNotFound({
          viewer: "visitor",
          signInHref: "/login?next=%2F%40june%2Fplatform",
        }),
      }),
    );
    expect(visitor).toContain("Project not found");
    expect(visitor).toContain(
      "This link doesn’t point at a public project. It may have moved, been made private, or never existed.",
    );
    expect(visitor).toContain(">Sign in<");
    expect(visitor).not.toContain("isn’t part of");
  });
});

describe("a visitor gets no search and no Delete", () => {
  const draw = (viewer: "member" | "visitor") => {
    const at =
      viewer === "member"
        ? ({ viewer, id: "p2" } as const)
        : ({ viewer, org: "june" } as const);
    const view = projectLibraryView(
      listing(),
      viewer === "member" ? { books: [], docs: [] } : null,
      "vocky",
      at,
      { page: 1, q: "" },
      visitorSource(listing()),
      { timeZone: "UTC" },
    );
    return renderToStaticMarkup(createElement(ProjectParts, { view }));
  };

  it("a member's table has the search and a Delete a row", () => {
    const html = draw("member");
    expect(html).toContain('role="search"');
    expect(html).toContain("Delete document Document 2");
  });

  it("a visitor's has neither, and its rows carry the visitor's list on", () => {
    const html = draw("visitor");
    expect(html).toContain("Document 2");
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain("Delete");
    expect(html).toContain(`from=${encodeURIComponent("/@june/vocky")}`);
  });

  it("drops a visitor's search from the address", () => {
    const view = projectLibraryView(
      listing(),
      null,
      "vocky",
      { viewer: "visitor", org: "june" },
      { page: 1, q: "Document 3" },
      visitorSource(listing()),
    );
    expect(view.docs.items.map((d) => d.title)).toEqual([
      "Document 3",
      "Document 2",
    ]);
    expect(view.from.place.q).toBeNull();
  });
});

describe("/@nope/x is Project not found (notFound(): 404 where nothing has streamed)", () => {
  const visit = (org: string, project: string) =>
    PublicProjectPage({
      params: Promise.resolve({ org, project }),
      searchParams: Promise.resolve({}),
    });

  it("an unknown org: the read's 404 is the page's notFound()", async () => {
    app.getOrgLibrary.mockRejectedValue(new ApiError(404, "not found"));
    const error = await visit("@nope", "x").catch((e: unknown) => e);
    expect(notFoundThrow(error)).toBe(true);
  });

  it("an unknown project of a known org, and a private one, too", async () => {
    app.getOrgLibrary.mockResolvedValue(listing());
    for (const project of ["nope", "platform"]) {
      const error = await visit("@june", project).catch((e: unknown) => e);
      expect(notFoundThrow(error)).toBe(true);
    }
  });

  it("an address without the @ is rejected before any read", async () => {
    const error = await visit("nope", "x").catch((e: unknown) => e);
    expect(notFoundThrow(error)).toBe(true);
    expect(app.getOrgLibrary).not.toHaveBeenCalled();
  });

  it("a public project renders", async () => {
    app.getOrgLibrary.mockResolvedValue(listing());
    const html = renderToStaticMarkup(await visit("@june", "vocky"));
    expect(html).toContain("<h1>vocky</h1>");
    expect(html).toContain("Document 3");
  });
});

describe("a visitor's rows draw the tags the public listing carries (OQ8)", () => {
  const tagged = (): KbOrgLibrary => {
    const l = listing();
    l.documents = l.documents.map((d) =>
      d.project === "vocky"
        ? {
            ...d,
            tags:
              d.id === 98
                ? ["capture", "alert"]
                : ["limits", "capture", "proxy", "abuse"],
          }
        : d,
    );
    return l;
  };

  it("each row its own tags, three shown and the rest behind +n, no search", () => {
    const view = projectLibraryView(
      tagged(),
      null,
      "vocky",
      { viewer: "visitor", org: "june" },
      { page: 1, q: "" },
      visitorSource(tagged()),
      { timeZone: "UTC" },
    );
    expect(view.docs.items.map((d) => [d.title, d.tags])).toEqual([
      ["Document 3", ["limits", "capture", "proxy", "abuse"]],
      ["Document 2", ["capture", "alert"]],
    ]);
    const html = renderToStaticMarkup(createElement(ProjectParts, { view }));
    expect(html).toContain("alert");
    expect(html).toContain("+1");
    expect(html).not.toContain('role="search"');
  });

  it("a listing without tags (an older backend) draws none, as before", () => {
    expect([...visitorSource(listing()).tags.values()]).toEqual([[], [], []]);
  });
});

describe("a member at the public address goes to the project's library (OQ7)", () => {
  const visit = (project: string, search: Record<string, string> = {}) =>
    PublicProjectPage({
      params: Promise.resolve({ org: "@june", project }),
      searchParams: Promise.resolve(search),
    });
  const redirectTo = (error: unknown) => {
    const digest = String((error as { digest?: unknown })?.digest ?? "");
    return digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : null;
  };
  const signedIn = () =>
    vi.mocked(optionalIdentity).mockResolvedValue({
      token: "tok",
    } as Awaited<ReturnType<typeof optionalIdentity>>);

  it("a member: redirected with the page and the search kept, before any part is drawn", async () => {
    signedIn();
    app.getOrgLibrary.mockResolvedValue({ ...listing(), member: true });
    app.listProjects.mockResolvedValue([
      { id: "p1", name: "platform", visibility: "private" },
      { id: "p2", name: "vocky", visibility: "public" },
    ]);
    const error = await visit("vocky", { page: "2", q: "dedupe" }).catch(
      (e: unknown) => e,
    );
    expect(redirectTo(error)).toBe("/projects/p2/library?page=2&q=dedupe");
    // their own private project too: a member reads it in the Shell
    const own = await visit("platform").catch((e: unknown) => e);
    expect(redirectTo(own)).toBe("/projects/p1/library");
  });

  it("a signed-in reader of another org keeps the visitor's page; a private project stays Not found", async () => {
    signedIn();
    app.getOrgLibrary.mockResolvedValue(listing());
    const html = renderToStaticMarkup(await visit("vocky"));
    expect(html).toContain("<h1>vocky</h1>");
    expect(app.listProjects).not.toHaveBeenCalled();
    const error = await visit("platform").catch((e: unknown) => e);
    expect(notFoundThrow(error)).toBe(true);
  });

  it("a visitor keeps the visitor's page", async () => {
    vi.mocked(optionalIdentity).mockResolvedValue(null);
    app.getOrgLibrary.mockResolvedValue({ ...listing(), member: true });
    const html = renderToStaticMarkup(await visit("vocky", { page: "1" }));
    expect(html).toContain("<h1>vocky</h1>");
    expect(app.listProjects).not.toHaveBeenCalled();
  });
});
