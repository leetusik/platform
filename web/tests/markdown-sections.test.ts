import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A Markdown document lists its sections (P63-fk.S27, S23's F1): its h2s and h3s get the native parse's
// own ids (`headingSlug` + `IdRegistry`, the same de-duplication), so `headingsOf` lists them, the head's
// "In this document" folds past six and a press scrolls by id. A Markdown bookmark stays a position (OQ20).

vi.mock("@/lib/reader/actions", () => ({
  saveReaderPosition: vi.fn(async () => ({ ok: true })),
  saveQuizAttempt: vi.fn(async () => ({ ok: true })),
  saveAnnotation: vi.fn(async () => ({ ok: true })),
  editAnnotation: vi.fn(async () => ({ ok: true })),
  removeAnnotation: vi.fn(async () => ({ ok: true })),
  saveBookmark: vi.fn(async () => ({ ok: true })),
  editBookmark: vi.fn(async () => ({ ok: true })),
  removeBookmark: vi.fn(async () => ({ ok: true })),
}));

const app = vi.hoisted(() => ({
  getDocumentVersion: vi.fn(),
  getDocumentVersions: vi.fn(),
}));
vi.mock("@/lib/knowledge/app", async (orig) => ({
  ...(await orig<object>()),
  ...app,
}));

import { renderDocument } from "@/components/reader/document-page";
import { ChapterBody } from "@/hi2vi/reader/body/body";
import type { KbDocument } from "@/lib/knowledge/types";
import { validateChapter } from "@/lib/native";
import {
  headingsOf,
  idMarkdownHeadings,
  loadLooseReader,
  type LoadedReader,
} from "@/lib/reader/load";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
} as unknown as AppRouterInstance;
const inApp = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: router }, el),
  );

const FORTY = `# Field manual\n\n${Array.from(
  { length: 40 },
  (_, i) => `## Section ${i + 1}\n\nText ${i + 1}.\n`,
).join("\n")}`;

const doc = (markdown: string): KbDocument =>
  ({
    id: 8,
    project: "handbook",
    rel_path: "field-manual.md",
    title: "Field manual",
    date: "2026-11-05",
    version: 1,
    format: "md",
    markdown,
    canonical_path: "/@june/handbook/field-manual",
  }) as KbDocument;

const settings = { size: 3, theme: "system" } as const;

async function loadMd(markdown: string): Promise<LoadedReader> {
  const out = await loadLooseReader({
    token: undefined,
    doc: doc(markdown),
    v: null,
    settings,
  });
  if (out.kind !== "reader") throw new Error("not the reader");
  return out.reader;
}

/** The ids the NATIVE parse gives the same headings (its own rule, read back, never re-written). */
function nativeIds(body: string): (string | null)[] {
  const { tree } = validateChapter(
    `---\nformat: native\nsyntax: 1\ntitle: T\n---\n\n${body}`,
    "native",
  );
  return tree.blocks.flatMap((b) => (b.type === "heading" ? [b.id] : []));
}

function mdIds(body: string): (string | null)[] {
  const checked = validateChapter(body, "md");
  idMarkdownHeadings(checked);
  return checked.tree.blocks.flatMap((b) =>
    b.type === "heading" ? [b.id] : [],
  );
}

beforeEach(() => {
  app.getDocumentVersions.mockReset();
  app.getDocumentVersions.mockResolvedValue({ versions: [] });
});

describe("a Markdown document of forty sections", () => {
  it("the loader lists forty sections, in order, with unique ids", async () => {
    const reader = await loadMd(FORTY);
    const h = reader.view.headings;
    expect(h).toHaveLength(40);
    expect(h.map((x) => x.text)).toEqual(
      Array.from({ length: 40 }, (_, i) => `Section ${i + 1}`),
    );
    expect(h.map((x) => x.id)).toEqual(
      Array.from({ length: 40 }, (_, i) => `section-${i + 1}`),
    );
    expect(new Set(h.map((x) => x.id)).size).toBe(40);
  });

  it("the page lists five, then Show all 40 sections; each listed id is a heading's id in the text", async () => {
    const reader = await loadMd(FORTY);
    const el = renderDocument(
      { kind: "reader", reader },
      { from: null, org: "june" },
    );
    if (!isValidElement(el)) throw new Error("no element");
    const html = inApp(el as ReactElement);
    expect(html).toContain("In this document");
    expect(html).toContain("Show all 40 sections");
    expect(html.match(/class="toc-link"/g)).toHaveLength(5);
    for (let i = 1; i <= 40; i += 1)
      expect(html).toContain(`<h2 id="section-${i}"`);
  });
});

describe("the ids are the native rule's", () => {
  const SAME = [
    "## Notes",
    "## Notes",
    "### 시작하기",
    "#### Notes",
    "## Sources",
    "## A — b & c!",
    "## 둘째",
  ].join("\n\n");

  it("two headings of the same text get different ids; a Korean heading the id the native rule gives", () => {
    expect(mdIds(SAME)).toEqual([
      "notes",
      "notes-2",
      "s-1",
      "notes-3",
      "sources-list",
      "s-2",
      "s-3",
    ]);
    expect(mdIds(SAME)).toEqual(nativeIds(SAME));
  });

  it("h1, h5 and h6 get none, and a blank heading gets none and no list entry", () => {
    const md =
      "# Title\n\n##\n\n## One\n\n##### Five\n\n###### Six\n\n### Two\n";
    expect(mdIds(md)).toEqual([null, null, "one", null, null, "two"]);
    const checked = validateChapter(md, "md");
    idMarkdownHeadings(checked);
    expect(headingsOf(checked)).toEqual([
      { id: "one", level: 2, text: "One" },
      { id: "two", level: 3, text: "Two" },
    ]);
  });

  it("a heading inside a quote or a list gets none (the native parse never ids one)", () => {
    expect(mdIds("> ## Quoted\n\n- ## Listed\n\n## Top\n")).toEqual(["top"]);
  });

  it("a native chapter is untouched", () => {
    const checked = validateChapter(
      "---\nformat: native\nsyntax: 1\ntitle: T\n---\n\n## One {#first}\n\n## One\n",
      "native",
    );
    const before = JSON.stringify(checked.tree);
    idMarkdownHeadings(checked);
    expect(JSON.stringify(checked.tree)).toBe(before);
  });
});

// A guard: how a kept place and a bookmark find their block. `use-reading.ts` lands a stored place on
// `[data-block="<block>"]` and samples the topmost `[data-block]` as the place it writes; a Markdown
// bookmark is a position (`fraction`), found by `getElementById` only when it is not one. So the set of
// `data-block` hooks in a Markdown body must stay what it was (none): the heading's `id` is the only new
// attribute.
describe("a Markdown body: only the headings' id is new", () => {
  const BODY =
    "# Field manual\n\nLead.\n\n## Before\n\nA paragraph.\n\n> A quote.\n\n## After\n\n- an item\n\n```\ncode\n```\n";

  const render = (ids: boolean) => {
    const checked = validateChapter(BODY, "md");
    if (ids) idMarkdownHeadings(checked);
    return body(checked);
  };

  it("the markup equals today's but for id on each h2", () => {
    const before = render(false);
    const after = render(true);
    expect(after).not.toBe(before);
    expect(after.replace(/ id="(before|after)"/g, "")).toBe(before);
  });

  it("no data-block hook is added, so a stored place and a stored bookmark find what they found", () => {
    const hooks = (html: string) => html.match(/data-block="[^"]*"/g) ?? [];
    expect(hooks(render(true))).toEqual(hooks(render(false)));
    expect(hooks(render(false))).toEqual([]);
  });
});

// A guard by mutation on the other side: a native heading keeps its `data-block` (the place hook a native
// reading place and section bookmark resolve by), so a native document's markup is what it was.
describe("a native body keeps its headings' place hooks", () => {
  it("each heading is <hN id data-block>, as before", () => {
    const html = body(
      validateChapter(
        "---\nformat: native\nsyntax: 1\ntitle: T\n---\n\n## One\n\nText.\n\n### Two {#second}\n\nMore.\n",
        "native",
      ),
    );
    expect(html).toContain('<h2 id="one" data-block="one">One</h2>');
    expect(html).toContain('<h3 id="second" data-block="second">Two</h3>');
  });
});

function body(checked: ReturnType<typeof validateChapter>): string {
  {
    return inApp(
      createElement(ChapterBody, {
        reader: {
          view: {
            kind: "loose",
            member: true,
            title: "Field manual",
            lang: "en",
            langs: [],
            version: 1,
            newest: 1,
            summary: null,
            date: "2026-11-05",
            project: "handbook",
            staleSource: null,
            target: { kind: "document", id: 8, canonicalPath: null },
            write: { org: "june", project: "handbook", doc: "field-manual" },
            progress: null,
            versions: { ok: true, label: "English", rows: [] },
            book: null,
            headings: checked.format === "md" ? headingsOf(checked) : [],
            settings,
          },
          checked,
          docId: 8,
          assets: null,
          resolveRef: () => null,
          quiz: {},
          notes: null,
        },
      } as never),
    );
  }
}
