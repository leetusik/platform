import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  KbBook,
  KbDocument,
  KbDocumentVersion,
  KbOrgLibrary,
} from "@/lib/knowledge/types";

// Each version's own publish date (P63-fk.S24, OQ2, D171-qk) on every version row (the book's, the
// chapter reader's and the document's Version history) and the head's `v3, published …`, in the
// viewer's zone; a read without the stamp shows the document's one date, as before. And a second
// title's language (D248-j7): the manifest's `sub_lang`, the guess only when it is null.

const app = vi.hoisted(() => ({
  getBook: vi.fn(),
  getDocument: vi.fn(),
  getDocumentVersion: vi.fn(),
  getDocumentVersions: vi.fn(),
  resolveDocument: vi.fn(),
}));
vi.mock("@/lib/knowledge/app", async (orig) => ({
  ...(await orig<object>()),
  ...app,
}));
vi.mock("@/lib/auth-guards", () => ({
  optionalIdentity: vi.fn(async () => null),
}));
const zone = vi.hoisted(() => ({ value: "Asia/Seoul" }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "kb_tz" ? { value: zone.value } : undefined,
  })),
  headers: vi.fn(async () => new Headers()),
}));

const { loadLooseReader, versionDate } = await import("@/lib/reader/load");
const { versionItems } = await import("@/sikstack/reader/model");
const { Versions } = await import("@/sikstack/library");
const { loadBook } = await import("@/lib/book/load");
const { headOf } = await import("@/lib/book/model");
const { secondTitleLang, shelvesOf } = await import("@/lib/library/lists");
const { subLang } = await import("@/lib/project-library/model");
const { libraryRows } = await import("@/app/(app)/projects/[projectId]/model");

const V3 = "2026-11-16T23:30:00Z"; // Nov 17 in Seoul, Nov 16 in UTC
const V2 = "2026-11-10T01:00:00Z";

const doc = (over: Partial<KbDocument> = {}): KbDocument =>
  ({
    id: 7,
    project: "platform",
    rel_path: "platform/2026-11-01-sessions.md",
    title: "Sessions",
    date: "2026-11-01",
    version: 3,
    format: "md",
    markdown: "# Sessions\n\nNow.\n",
    canonical_path: "/@june/platform/sessions",
    published: V3,
    published_best_effort: false,
    ...over,
  }) as KbDocument;

const version = (
  n: number,
  over: Partial<KbDocumentVersion> = {},
): KbDocumentVersion => ({
  rel_path: "platform/2026-11-01-sessions.md",
  version: n,
  archive_path: `.versions/platform/2026-11-01-sessions/v000${n}.md`,
  title: "Sessions",
  date: "2026-11-01",
  tags: [],
  format: "md",
  created_at: "2026-11-10T10:00:00+09:00",
  ...over,
});

const settings = { size: 3, theme: "system" } as const;

beforeEach(() => {
  for (const f of Object.values(app)) f.mockReset();
  zone.value = "Asia/Seoul";
});

describe("versionDate: the version's own time, else the document's date", () => {
  it("reads the stamp, the fill's flag, and falls back as before", () => {
    expect(versionDate(doc())).toEqual({ date: V3, bestEffort: false });
    expect(
      versionDate({
        date: "2026-11-01",
        published: "2026-11-01",
        published_best_effort: true,
      }),
    ).toEqual({ date: "2026-11-01", bestEffort: true });
    expect(versionDate({ date: "2026-11-01", published: null })).toEqual({
      date: "2026-11-01",
      bestEffort: false,
    });
    expect(versionDate({ date: "2026-11-01" })).toEqual({
      date: "2026-11-01",
      bestEffort: false,
    });
  });
});

describe("the document's and the chapter reader's Version history (one loader)", () => {
  it("each row carries its own date, the fill kept as data", async () => {
    app.getDocumentVersions.mockResolvedValue({
      versions: [
        version(1, { published: "2026-11-01", published_best_effort: true }),
        version(2, { published: V2 }),
      ],
    });
    const out = await loadLooseReader({
      token: undefined,
      doc: doc(),
      v: null,
      settings,
    });
    if (out.kind !== "reader") throw new Error(out.kind);
    const view = out.reader.view;
    expect(
      view.versions?.rows.map((r) => [r.n, r.date, !!r.bestEffort]),
    ).toEqual([
      [3, V3, false],
      [2, V2, false],
      [1, "2026-11-01", true],
    ]);
    // the head's `v3, published …` is the version's own; print keeps the document's date
    expect(view.published).toBe(V3);
    expect(view.date).toBe("2026-11-01");

    const seoul = versionItems(view.versions, { timeZone: "Asia/Seoul" });
    expect(seoul.map((i) => i.published)).toEqual([
      "Nov 17",
      "Nov 10",
      "Nov 1",
    ]);
    const utc = versionItems(view.versions, { timeZone: "UTC" });
    expect(utc[0].published).toBe("Nov 16");
    const html = renderToStaticMarkup(
      createElement(Versions, { versions: seoul }),
    );
    expect(html).toContain("Published Nov 17");
    expect(html).toContain("Published Nov 1<");
    expect(html).not.toContain("title=");
  });

  it("an older version read at ?v= heads with its own date", async () => {
    app.getDocumentVersion.mockResolvedValue({
      ...version(2, { published: V2 }),
      markdown: "# Sessions\n\nThen.\n",
    });
    app.getDocumentVersions.mockResolvedValue({ versions: [] });
    const out = await loadLooseReader({
      token: undefined,
      doc: doc(),
      v: 2,
      settings,
      strictVersion: true,
    });
    if (out.kind !== "reader") throw new Error(out.kind);
    expect(out.reader.view.published).toBe(V2);
  });

  it("a read without the stamp shows the document's date on every row, as before", async () => {
    app.getDocumentVersions.mockResolvedValue({
      versions: [version(2), version(1)],
    });
    const out = await loadLooseReader({
      token: undefined,
      doc: doc({ published: null, published_best_effort: false }),
      v: null,
      settings,
    });
    if (out.kind !== "reader") throw new Error(out.kind);
    expect(out.reader.view.versions?.rows.map((r) => r.date)).toEqual([
      "2026-11-01",
      "2026-11-01",
      "2026-11-01",
    ]);
    expect(out.reader.view.published).toBe("2026-11-01");
  });
});

const book = (over: Partial<KbBook> = {}): KbBook => ({
  project: "platform",
  slug: "guide",
  title: "Guide",
  kind: "codebase",
  subject: null,
  description: null,
  canonical_path: "/@june/platform/books/guide",
  chapters: [
    {
      key: "one",
      position: 1,
      title: null,
      source: null,
      variants: [
        {
          lang: "en",
          doc_id: 7,
          rel_path: "platform/2026-11-01-sessions.md",
          title: "Sessions",
          slug: "sessions",
          version: 3,
          format: "md",
          updated_at: "2026-11-16T23:30:00+00:00",
          translated_from: null,
        },
      ],
    },
  ],
  ...over,
});

describe("the book's Version history", () => {
  it("each row in the viewer's zone, the fill a plain date with the fact kept", async () => {
    app.getBook.mockResolvedValue(book());
    app.getDocument.mockResolvedValue(doc());
    app.getDocumentVersions.mockResolvedValue({
      versions: [
        version(2, { published: V2 }),
        version(1, { published: "2026-11-01", published_best_effort: true }),
      ],
    });
    const view = await loadBook("june", "platform", "guide", "");
    const rows = view.rows[0].groups[0].rows;
    expect(rows.map((r) => [r.n, r.published, !!r.bestEffort])).toEqual([
      [3, "Published Nov 17", false],
      [2, "Published Nov 10", false],
      [1, "Published Nov 1", true],
    ]);
    zone.value = "UTC";
    const utc = await loadBook("june", "platform", "guide", "");
    const first = utc.rows[0].groups[0].rows[0];
    expect(first.published).toBe("Published Nov 16");
  });
});

describe("a second title's language: the manifest's, the guess only when it is null", () => {
  it("one rule", () => {
    expect(secondTitleLang("길잡이", "ko")).toBe("ko");
    expect(secondTitleLang("案内", "ja")).toBe("ja");
    expect(secondTitleLang("길잡이", null)).toBe("ko");
    expect(secondTitleLang("A guide", undefined)).toBeUndefined();
    expect(subLang("案内", "ja")).toBe("ja");
    expect(subLang("길잡이")).toBe("ko");
  });

  it("the book's head, a shelf row and project home's row pass it through", () => {
    const head = (sub: string, lang?: string | null) =>
      headOf({
        title: "Guide",
        sub,
        subLang: lang,
        description: "",
        place: "",
        signedIn: false,
        done: 0,
        started: 0,
        total: 1,
      }).subLang;
    expect(head("案内", "ja")).toBe("ja");
    expect(head("길잡이", null)).toBe("ko");
    expect(head("A guide")).toBeUndefined();

    const listing: KbOrgLibrary = {
      org: { id: "t1", slug: "june", name: "Personal", label: "june" },
      member: true,
      projects: [{ name: "platform", visibility: "public" }],
      books: [
        {
          project: "platform",
          slug: "guide",
          title: "Guide",
          sub: "案内",
          sub_lang: "ja",
          kind: "codebase",
          subject: null,
          chapters: [],
        },
        {
          project: "platform",
          slug: "other",
          title: "Other",
          sub: "길잡이",
          sub_lang: null,
          kind: "codebase",
          subject: null,
          chapters: [],
        },
      ],
      documents: [],
    } as unknown as KbOrgLibrary;
    const shelf = shelvesOf(listing, null, { project: "platform" }).shelves[0];
    expect(shelf.books.map((b) => [b.key, b.subLang])).toEqual([
      ["platform/guide", "ja"],
      ["platform/other", "ko"],
    ]);
    expect(libraryRows(listing, "platform").map((r) => r.subLang)).toEqual([
      "ja",
      "ko",
    ]);
  });
});

describe("the web's native parser reads a stamped header (both forms)", () => {
  it("as it read the header before: no violation, the summary kept", async () => {
    const { validateChapter: check } = await import("@/lib/native");
    const head = (line: string) =>
      `---\ntitle: "N"\ndate: 2026-07-02\n${line}format: native\nsyntax: 1\nsummary: "Lede."\ntags:\n  - t\nsource:\n  project: p\n  repo: r\n---\n\nText.\n`;
    for (const line of [
      "",
      'published: "2026-11-17T09:30:12Z"\n',
      'published: {"at": "2026-07-02", "best_effort": true}\n',
    ]) {
      const out = check(head(line), "native");
      expect(out.parse.violations).toEqual([]);
      expect(out.tree.summary).toBe("Lede.");
    }
  });
});
