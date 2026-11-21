import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { documentBack } from "@/sikstack/reader/document/model";
import { statePlace } from "@/lib/book/place";
import { decodeFrom, LIBRARY_ORIGIN } from "@/lib/library/from";
import { DEFAULT_READER_SETTINGS } from "@/lib/reader-cookie";

// P63-fk.F4 — the way back names the place it links to, from the item's own data, never from text
// carried in `?from=`. A list that is not the item's own (another org's, another project's) is not
// trusted: the way back is the item's own default, exactly as with no `from`.

vi.mock("@/lib/auth-guards", () => ({
  optionalIdentity: vi.fn(async () => null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));

// The document's states read the address and `?from=` through the router's hooks.
const nav = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => nav.params,
  useSearchParams: () => nav.search,
}));

const { bookBack } = await import("@/lib/book/load");
const { DocumentLoading } =
  await import("@/sikstack/reader/document/document-states");
const { ReaderSegmentContext } = await import("@/sikstack/reader/reader-states");

const book = {
  owner: "p63-fid",
  slug: "p63-fid",
  orgName: "Personal",
  project: "platform",
};
const visitorBook = { ...book, member: false };
const memberBook = { ...book, member: true };
const names = { project: "platform", org: "Personal" };

describe("another org's public library is not trusted", () => {
  it("on a document: the item's default, label and link", () => {
    expect(
      documentBack({
        member: false,
        from: "/@someone?page=2",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
    expect(
      documentBack({ member: true, from: "/@someone", org: "p63-fid", names }),
    ).toMatchObject({ href: "/library", label: "Library" });
  });
  it("on a book: the item's default, label and link", () => {
    expect(bookBack(decodeFrom("/@someone?page=2"), visitorBook)).toEqual({
      href: "/@p63-fid",
      label: "Personal",
    });
    expect(bookBack(decodeFrom("/@someone"), memberBook)).toEqual({
      href: "/library",
      label: "Library",
    });
  });
  it("the reproduced link reads the book's own org", () => {
    const raw =
      "/@Session%20expired%20-%20sign%20in%20again%20at%20sikstack-login.example";
    expect(bookBack(decodeFrom(raw), visitorBook)).toEqual({
      href: "/@p63-fid",
      label: "Personal",
    });
    expect(
      documentBack({ member: false, from: raw, org: "p63-fid", names }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
  });
});

describe("another project's library is not trusted: label and link agree", () => {
  it("on a document", () => {
    expect(
      documentBack({
        member: false,
        from: "/@p63-fid/other-project?page=2",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
    // the same project name under another org
    expect(
      documentBack({
        member: false,
        from: "/@acme/platform",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
  });
  it("on a book", () => {
    expect(bookBack(decodeFrom("/@p63-fid/other"), visitorBook)).toEqual({
      href: "/@p63-fid",
      label: "Personal",
    });
    expect(bookBack(decodeFrom("/@acme/platform"), memberBook)).toEqual({
      href: "/library",
      label: "Library",
    });
  });
  it("a state with no project read never labels a project by the address's id", () => {
    // the document's loading and not-found states: no read, so no project to name
    expect(
      documentBack({
        member: true,
        from: "/projects/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab/library",
        org: "p63-fid",
      }),
    ).toMatchObject({ href: "/library", label: "Library" });
    expect(
      documentBack({
        member: false,
        from: "/@p63-fid/platform",
        org: "p63-fid",
      }),
    ).toMatchObject({ href: "/@p63-fid", label: "p63-fid" });
  });
});

describe("decodeFrom refuses what no list of ours emits", () => {
  it.each([
    ["encoded text", "/@Session%20expired"],
    ["an encoded slash", "/@acme%2Fplatform"],
    ["an encoded letter", "/@%61cme"],
    ["an encoded project", "/@acme/plat%20form"],
    ["a space", "/@acme/plat form"],
    ["a long org", `/@${"a".repeat(41)}`],
    ["a long project", `/@acme/${"p".repeat(201)}`],
    ["a long project id", `/projects/${"1".repeat(37)}/library`],
    ["an absolute URL", "https://evil.example.com/@acme?page=2"],
    ["a protocol-relative URL", "//evil.example.com/library?page=2"],
    ["a dot-dot path", "/@acme/x/../platform"],
    ["a dot-dot into the Library", "/projects/../library?page=2"],
    ["an encoded dot-dot", "/@acme/%2e%2e/platform"],
    ["a dot segment", "/@acme/./platform"],
    ["a control character", "/@ac\tme?page=2"],
    ["a newline", "/libr\nary?page=2"],
    ["an uppercase org", "/@Acme"],
    ["a project not starting alphanumeric", "/@acme/_platform"],
    ["an org with a dot", "/@ac.me"],
    ["an unknown shape", "/@acme/platform/extra"],
    ["a member project's sub-page", "/projects/17/library/x"],
    ["a trailing slash", "/library/"],
  ])("%s", (_name, raw) => {
    expect(decodeFrom(raw)).toEqual(LIBRARY_ORIGIN);
  });
});

describe("still: the item's own lists, named from its data", () => {
  it("no from: the item's default", () => {
    expect(
      documentBack({ member: false, from: null, org: "p63-fid", names }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
    expect(
      documentBack({ member: true, from: null, org: "p63-fid", names }),
    ).toMatchObject({ href: "/library", label: "Library" });
    expect(bookBack(LIBRARY_ORIGIN, memberBook)).toEqual({
      href: "/library",
      label: "Library",
    });
  });
  it("the item's own org: its name, else the slug of its own address", () => {
    expect(
      documentBack({
        member: false,
        from: "/@p63-fid?view=all&page=2&q=x&filter=platform",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({
      href: "/@p63-fid?view=all&page=2&q=x&filter=platform",
      label: "Personal",
    });
    expect(
      documentBack({ member: false, from: "/@p63-fid", org: "p63-fid" }),
    ).toMatchObject({ href: "/@p63-fid", label: "p63-fid" });
    expect(
      bookBack(decodeFrom("/@p63-fid?page=2"), {
        ...visitorBook,
        orgName: null,
      }),
    ).toEqual({ href: "/@p63-fid?page=2", label: "p63-fid" });
  });
  it("the item's own org by its other segment (tenant id and slug)", () => {
    const tenant = "6b1f0c1e-1111-4222-8333-944455556666";
    expect(
      bookBack(decodeFrom(`/@${tenant}`), {
        ...visitorBook,
        owner: tenant,
        slug: null,
      }),
    ).toEqual({ href: `/@${tenant}`, label: "Personal" });
  });
  it("the item's own project: its name, at its place", () => {
    expect(
      documentBack({
        member: false,
        from: "/@p63-fid/platform?page=2&q=x",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({
      href: "/@p63-fid/platform?page=2&q=x",
      label: "platform",
    });
    expect(
      bookBack(decodeFrom("/@p63-fid/platform?page=3"), visitorBook),
    ).toEqual({ href: "/@p63-fid/platform?page=3", label: "platform" });
  });
  it("a member's lists: the Library at its view, page, query and filter; the project's library", () => {
    expect(
      documentBack({
        member: true,
        from: "/library?view=all&page=2&q=lantern&filter=handbook",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({
      href: "/library?view=all&page=2&q=lantern&filter=handbook",
      label: "Library",
    });
    expect(
      documentBack({
        member: true,
        from: "/projects/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab/library?page=2",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({
      href: "/projects/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab/library?page=2",
      label: "platform",
    });
    expect(
      bookBack(decodeFrom("/library?view=all&page=2"), memberBook),
    ).toEqual({ href: "/library?view=all&page=2", label: "Library" });
    expect(
      bookBack(decodeFrom("/projects/p1/library?page=4&q=a"), memberBook),
    ).toEqual({ href: "/projects/p1/library?page=4&q=a", label: "platform" });
  });
  it("a visitor never goes back to a member's list", () => {
    expect(bookBack(decodeFrom("/library?page=2"), visitorBook)).toEqual({
      href: "/@p63-fid",
      label: "Personal",
    });
    expect(bookBack(decodeFrom("/projects/p1/library"), visitorBook)).toEqual({
      href: "/@p63-fid",
      label: "Personal",
    });
  });
});

// P63-fk.F5 — every length `decodeFrom` checks is what the server emits: a project's name up to 200
// characters (`server/app_api.py` `CreateProjectInput.name`), a project's id and a tenant's id as UUIDs
// (36), an org slug up to 40 (`server/accounts/slugs.py`).
describe("each segment as long as the server makes it, and no longer", () => {
  const p = (n: number) => "p".repeat(n);
  const long = [100, 101, 150, 200];
  it.each(long)(
    "a visitor's document from a project page of %i characters",
    (n) => {
      expect(
        documentBack({
          member: false,
          from: `/@p63-fid/${p(n)}?page=2&q=x`,
          org: "p63-fid",
          names: { project: p(n), org: "Personal" },
        }),
      ).toMatchObject({ href: `/@p63-fid/${p(n)}?page=2&q=x`, label: p(n) });
    },
  );
  it.each(long)(
    "a visitor's book from a project page of %i characters",
    (n) => {
      expect(
        bookBack(decodeFrom(`/@p63-fid/${p(n)}?page=3`), {
          ...visitorBook,
          project: p(n),
        }),
      ).toEqual({ href: `/@p63-fid/${p(n)}?page=3`, label: p(n) });
    },
  );
  it.each(long)("the book's states at a project of %i characters", (n) => {
    const from = `/@p63-fid/${p(n)}?page=2`;
    expect(
      statePlace(
        `/@p63-fid/${p(n)}/books/guide?from=${encodeURIComponent(from)}`,
        false,
      ).back,
    ).toEqual({ href: from, label: p(n) });
  });
  it.each(long)(
    "the document's loading state at a project of %i characters",
    (n) => {
      nav.params = { org: "@p63-fid", project: p(n), slug: "note" };
      nav.search = new URLSearchParams({ from: `/@p63-fid/${p(n)}?page=2` });
      const html = renderToStaticMarkup(
        createElement(
          ReaderSegmentContext.Provider,
          { value: { member: false, settings: DEFAULT_READER_SETTINGS } },
          createElement(DocumentLoading),
        ),
      );
      expect(html).toContain(`href="/@p63-fid/${p(n)}?page=2"`);
      expect(html).toContain(`>${p(n)}<`);
    },
  );
  it("a project name of 201 characters is refused: the item's default", () => {
    expect(decodeFrom(`/@p63-fid/${p(201)}`)).toEqual(LIBRARY_ORIGIN);
    expect(
      documentBack({
        member: false,
        from: `/@p63-fid/${p(201)}?page=2`,
        org: "p63-fid",
        names: { project: p(201), org: "Personal" },
      }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
  });
  it("a member's project id (a UUID) and org segments at their longest", () => {
    const id = "0f1e2d3c-aaaa-bbbb-cccc-1234567890ab";
    expect(decodeFrom(`/projects/${id}/library?page=2`)).toEqual({
      origin: "project-library",
      viewer: "member",
      project: id,
      place: { page: 2 },
    });
    const slug = `${"a".repeat(19)}-${"b".repeat(20)}`;
    expect(slug).toHaveLength(40);
    expect(decodeFrom(`/@${slug}`)).toEqual({
      origin: "public-library",
      org: slug,
      place: {},
    });
    expect(decodeFrom(`/@${id}/${p(200)}`)).toMatchObject({
      origin: "project-library",
      viewer: "visitor",
      org: id,
      project: p(200),
    });
  });
});

describe("each guard of decodeFrom holds on its own", () => {
  // `safeNextPath` already refuses every value with another origin, so the origin check is the layer
  // behind it: proved here with `safeNextPath` stood aside (an identity), the origin check alone.
  it("the origin check, with safeNextPath out of the way", async () => {
    vi.resetModules();
    vi.doMock("@/lib/next-path", () => ({
      safeNextPath: (raw: string) => raw,
    }));
    try {
      const alone = await import("@/lib/library/from");
      for (const raw of [
        "https://evil.example.com/@acme?page=2",
        "//evil.example.com/library?page=2",
        "/\\evil.example.com/library",
      ]) {
        expect(alone.decodeFrom(raw), raw).toEqual(alone.LIBRARY_ORIGIN);
      }
      // and a real list still decodes through it
      expect(alone.decodeFrom("/@acme?page=2")).toEqual({
        origin: "public-library",
        org: "acme",
        place: { page: 2 },
      });
    } finally {
      vi.doUnmock("@/lib/next-path");
      vi.resetModules();
    }
  });
});

describe("the book's states (loading, Book not found, Error): the address's own org and project", () => {
  const at = "/@p63-fid/platform/books/guide";
  const withRaw = (from: string) => `${at}?from=${encodeURIComponent(from)}`;
  it("another org's or project's list is not trusted", () => {
    expect(statePlace(withRaw("/@someone?page=2"), false).back).toEqual({
      href: "/@p63-fid",
      label: "p63-fid",
    });
    expect(statePlace(withRaw("/@p63-fid/other"), false).back).toEqual({
      href: "/@p63-fid",
      label: "p63-fid",
    });
    expect(statePlace(withRaw("/@someone"), true).back).toEqual({
      href: "/library",
      label: "Library",
    });
  });
  it("a visitor never gets a member's list", () => {
    expect(statePlace(withRaw("/library?page=2"), false).back).toEqual({
      href: "/@p63-fid",
      label: "p63-fid",
    });
  });
  it("a member's project page reads the address's project, never its id", () => {
    expect(
      statePlace(withRaw("/projects/p1/library?page=2"), true).back,
    ).toEqual({ href: "/projects/p1/library?page=2", label: "platform" });
  });
  it("still: no from, and the address's own lists", () => {
    expect(statePlace(at, false).back).toEqual({
      href: "/@p63-fid",
      label: "p63-fid",
    });
    expect(statePlace(at, true).back).toEqual({
      href: "/library",
      label: "Library",
    });
    expect(statePlace(withRaw("/@p63-fid?page=2"), false).back).toEqual({
      href: "/@p63-fid?page=2",
      label: "p63-fid",
    });
    expect(
      statePlace(withRaw("/@p63-fid/platform?page=2"), false).back,
    ).toEqual({ href: "/@p63-fid/platform?page=2", label: "platform" });
    expect(statePlace(withRaw("/library?view=all&page=2"), true).back).toEqual({
      href: "/library?view=all&page=2",
      label: "Library",
    });
    expect(statePlace("/x", false).back).toEqual({
      href: "/library",
      label: "Library",
    });
  });
});

describe("the document's loading state: the address's own org and project", () => {
  function loading(member: boolean, from: string): string {
    nav.params = { org: "@p63-fid", project: "platform", slug: "note" };
    nav.search = new URLSearchParams({ from });
    return renderToStaticMarkup(
      createElement(
        ReaderSegmentContext.Provider,
        { value: { member, settings: DEFAULT_READER_SETTINGS } },
        createElement(DocumentLoading),
      ),
    );
  }
  it("a member's own project page keeps its link and reads the address's project", () => {
    const html = loading(true, "/projects/p1/library?page=2");
    expect(html).toContain('href="/projects/p1/library?page=2"');
    expect(html).toContain(">platform<");
  });
  it("another org's list is the address's own org", () => {
    const html = loading(false, "/@someone?page=2");
    expect(html).toContain('href="/@p63-fid"');
    expect(html).not.toContain("someone");
  });
});
