import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LIBRARY_PAGE } from "@/content/library-page";
import { Shelf } from "@/sikstack/library/lists/shelf";
import { continueRows } from "@/sikstack/library/lists/continue-model";
import { sectionPlace, type ContinueItem } from "@/lib/library/continue";
import { excerptOf, plainText } from "@/lib/library/excerpt";
import {
  readLibraryPlace,
  viewHref,
  type LibraryPlace,
} from "@/lib/library/list-place";
import { docsTable, shelvesOf, type DocsSource } from "@/lib/library/lists";
import { continueOf } from "@/lib/library/load-lists";
import type { KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbLibraryDocument, KbOrgLibrary } from "@/lib/knowledge/types";

// The Library at /library (job 03, Library round 02; frame.md F320 to F323, F325): the claims of
// P63-fk.S4, each on the pure model the page draws from.

const NOW = { now: Date.parse("2026-11-15T10:00:00Z"), timeZone: "UTC" };

function doc(
  i: number,
  project: string,
  more: Partial<KbLibraryDocument> = {},
) {
  const day = new Date(Date.UTC(2026, 10, 14) - i * 864e5)
    .toISOString()
    .slice(0, 10);
  return {
    id: 1000 - i,
    project,
    slug: `doc-${i}`,
    doc: `${day}-doc-${i}`,
    title: `Document ${i}`,
    date: day,
    format: "md" as const,
    lang: "en",
    version: 1,
    subject: i % 2 ? "Ops" : "Design",
    canonical_path: `/@june/${project}/doc-${i}`,
    ...more,
  };
}

/** 240 loose documents over two projects (132 in platform), one book, one empty project. */
function listing(count = 240): KbOrgLibrary {
  return {
    org: { id: "t1", slug: "june", name: "Personal", label: "june" },
    member: true,
    projects: [
      { name: "platform", visibility: "private" },
      { name: "vocky", visibility: "public" },
      { name: "changple", visibility: "private" },
    ],
    books: [
      {
        project: "platform",
        slug: "handbook",
        title: "The platform handbook",
        kind: "book",
        subject: "Ops",
        chapters: [
          {
            key: "c1",
            position: 1,
            title: "One",
            variants: [
              {
                lang: "en",
                doc: "2026-11-10-c1",
                doc_id: 1,
                title: "One",
                version: 1,
                format: "native",
              },
              {
                lang: "ko",
                doc: "2026-11-12-c1-ko",
                doc_id: 2,
                title: "하나",
                version: 1,
                format: "native",
              },
            ],
          },
        ],
      },
    ],
    documents: Array.from({ length: count }, (_, i) =>
      doc(i, i < 132 ? "platform" : "vocky"),
    ),
  };
}

const STATE: KbReaderLibrary = { books: [], docs: [] };
const NO_TAGS: DocsSource = { tags: new Map(), text: null };

describe("a view switch keeps the search, the filter and the page (F320)", () => {
  it("writes the other view at the same place", () => {
    const place: LibraryPlace = {
      view: "all",
      page: 3,
      q: "widget",
      filter: "platform",
    };
    const toProject = new URL(viewHref(place, "project"), "https://x.test");
    expect(toProject.pathname).toBe("/library");
    expect(toProject.searchParams.get("view")).toBeNull();
    expect(toProject.searchParams.get("page")).toBe("3");
    expect(toProject.searchParams.get("q")).toBe("widget");
    expect(toProject.searchParams.get("filter")).toBe("platform");
    const back = readLibraryPlace(
      Object.fromEntries(toProject.searchParams.entries()),
    );
    const toAll = new URL(viewHref(back, "all"), "https://x.test");
    expect(toAll.searchParams.get("view")).toBe("all");
    expect(readLibraryPlace(Object.fromEntries(toAll.searchParams))).toEqual(
      place,
    );
  });
});

describe("25 rows a page and the range line (F325)", () => {
  const range = (page: number) =>
    docsTable(listing(), NO_TAGS, { page, format: NOW });
  it("pages 240 documents at the first, a middle and the last page", () => {
    const first = range(1);
    expect(first.items).toHaveLength(25);
    expect(first.range).toBe("1–25 of 240");
    expect(first.pages).toBe(10);
    const middle = range(5);
    expect(middle.items).toHaveLength(25);
    expect(middle.range).toBe("101–125 of 240");
    expect(middle.items[0].title).toBe("Document 100");
    const last = range(10);
    expect(last.items).toHaveLength(15);
    expect(last.range).toBe("226–240 of 240");
    expect(range(99).page).toBe(10);
  });

  it("writes the count line's forms: none, one, many, searched", () => {
    expect(LIBRARY_PAGE.countLine(0, 0)).toBe("0 documents");
    expect(LIBRARY_PAGE.countLine(0, 1)).toBe("1 document");
    expect(LIBRARY_PAGE.countLine(1, 0)).toBe("1 book");
    expect(LIBRARY_PAGE.countLine(3, 240)).toBe("3 books, 240 documents");
    expect(shelvesOf(listing(), STATE, { format: NOW }).count).toBe(
      "1 book, 240 documents",
    );
    expect(docsTable(listing(), NO_TAGS, { format: NOW }).count).toBe(
      "240 documents",
    );
    expect(
      docsTable(listing(), NO_TAGS, { filter: "platform", format: NOW }).count,
    ).toBe("132 documents");
    const searched = docsTable(listing(), NO_TAGS, {
      q: "document 1",
      format: NOW,
    });
    // "Document 1", "Document 10" to "19", "100" to "199": 1 + 10 + 100.
    expect(searched.count).toBe("111 of 240 documents");
    const none = docsTable(listing(), NO_TAGS, { q: "webhook", format: NOW });
    expect([none.count, none.phase]).toEqual(["0 of 240 documents", "none"]);
    expect(docsTable(listing(0), NO_TAGS, { format: NOW }).phase).toBe("empty");
  });
});

describe("the excerpt of a match in the text (F322)", () => {
  const long = `${"a".repeat(60)} <mark>widget</mark> ${"b".repeat(90)}`;
  it("is cut 48 characters before the match and 72 after, with ellipses", () => {
    const cut = excerptOf(long, "widget");
    expect(cut).not.toBeNull();
    expect(cut!.hit).toBe("widget");
    expect(cut!.before).toBe(`…${"a".repeat(47)} `);
    expect(cut!.after).toBe(` ${"b".repeat(71)}…`);
  });

  it("carries no heading marks", () => {
    const cut = excerptOf(
      "…## Capture\nThe <mark>widget</mark> posts…",
      "widget",
    );
    expect(cut).toEqual({
      before: "…Capture The ",
      hit: "widget",
      after: " posts…",
    });
    expect(plainText("## Orgs\n### Roles\nA **member**")).toBe(
      "Orgs Roles A member",
    );
  });

  it("is the table's only for a match in the text, and holds the page to 64ch", () => {
    const tags = new Map([[1000, ["widget-api"]]]);
    const text = new Map([
      [999, "The <mark>widget</mark> is one script"],
      [998, "matched by meaning, nothing marked"],
    ]);
    const table = docsTable(
      listing(),
      { tags, text },
      {
        q: "widget",
        format: NOW,
      },
    );
    expect(table.items.map((d) => [d.id, d.match?.where])).toEqual([
      [1000, "tag"],
      [999, "text"],
    ]);
  });
});

describe("a delete (F322)", () => {
  const items: ContinueItem[] = [
    {
      key: "d:june/platform/2026-11-14-doc-0",
      kind: "doc",
      next: false,
      legacy: false,
      project: "platform",
      bookTitle: "",
      showProject: false,
      n: 0,
      total: 0,
      finishedN: 0,
      title: "Document 0",
      lang: "en",
      langName: "",
      section: "",
      sectionLang: null,
      org: "june",
      docId: 1000,
      pct: 20,
      href: "/documents/1000",
    },
    {
      key: "d:june/platform/2026-11-13-doc-1",
      kind: "doc",
      next: false,
      legacy: false,
      project: "platform",
      bookTitle: "",
      showProject: false,
      n: 0,
      total: 0,
      finishedN: 0,
      title: "Document 1",
      lang: "en",
      langName: "",
      section: "The window",
      sectionLang: null,
      org: "june",
      docId: 999,
      pct: 72,
      href: "/documents/999",
    },
  ];

  it("drops every count by one and leaves Continue reading standing", () => {
    const before = listing();
    const after = {
      ...before,
      documents: before.documents.filter((d) => d.id !== 1000),
    };
    expect(shelvesOf(after, STATE, { format: NOW }).docs).toBe(
      shelvesOf(before, STATE, { format: NOW }).docs - 1,
    );
    const platform = (l: KbOrgLibrary) =>
      shelvesOf(l, STATE, { format: NOW }).shelves[0];
    expect([platform(before).count, platform(after).count]).toEqual([
      "1 book, 132 documents",
      "1 book, 131 documents",
    ]);
    expect(docsTable(after, NO_TAGS, { format: NOW }).count).toBe(
      "239 documents",
    );
    expect(docsTable(after, NO_TAGS, { format: NOW }).range).toBe(
      "1–25 of 239",
    );
    // The deleted document leaves Continue reading; the part stands with the rest.
    expect(continueOf(items, before).map((it) => it.docId)).toEqual([
      1000, 999,
    ]);
    expect(continueOf(items, after).map((it) => it.docId)).toEqual([999]);
    expect(continueRows(continueOf(items, after))[0].place).toEqual({
      before: "Left off at ",
      section: "The window",
      sectionLang: "en",
      after: ", 72%",
    });
  });
});

describe("By project has no subject grouping (F320)", () => {
  it("is one section a project with something to read, whatever the subjects", () => {
    const model = shelvesOf(listing(), STATE, { format: NOW });
    expect(model.shelves.map((s) => s.project)).toEqual(["platform", "vocky"]);
    expect(model.empty).toBe(1);
    expect(model.shelves[0].docs).toHaveLength(5);
    expect(model.shelves[0].books[0]).toMatchObject({
      chapters: "1 chapter",
      langs: "English, 한국어",
      date: "Nov 12",
      state: { word: "Not started", cls: "status status-idle" },
    });
    // `?by=subject` is not the library's any more: the place has no grouping.
    expect(readLibraryPlace({ by: "subject" })).toEqual({
      view: "project",
      page: 1,
      q: "",
      filter: null,
    });
    const html = renderToStaticMarkup(
      createElement(Shelf, {
        shelf: model.shelves[0],
        tag: true,
        moreHref: "/projects/p1/library",
      }),
    );
    expect(html).not.toMatch(/Ops|Design|subject/i);
    expect(html).toContain("All 132 documents");
    expect(html).toContain(">Private<");
  });
});

describe("a place name's own name and language (D156-gc d)", () => {
  const GLOSSARY = readFileSync(
    new URL("../../tests/fixtures/native/glossary.md", import.meta.url),
    "utf8",
  );
  it("names the Glossary, in the reader's words, when the reader left off in it", () => {
    expect(sectionPlace(GLOSSARY, "glossary", "ko")).toEqual({
      title: "Glossary",
      lang: "en",
    });
    expect(sectionPlace(GLOSSARY, "glossary", "en")).toEqual({
      title: "Glossary",
      lang: null,
    });
  });
});
