import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// An html document in its Original layout (P63-fk.S13; job 03, Library round 02: `## Build` § Page: document,
// the state Original layout: "the tag in the bar and the head, then the stand-in; no text, no end"): the signed
// frame around the html as it renders today, the chooser, the frame element, the print notice, the bookmarks'
// writes, the reading memory's feed and the kept bookmarks' rows.

const actions = vi.hoisted(() => ({
  saveReaderPosition: vi.fn(async () => ({ ok: true })),
  saveQuizAttempt: vi.fn(async () => ({ ok: true })),
  saveAnnotation: vi.fn(async () => ({ ok: true })),
  editAnnotation: vi.fn(async () => ({ ok: true })),
  removeAnnotation: vi.fn(async () => ({ ok: true })),
  saveBookmark: vi.fn(async () => ({ ok: true })),
  editBookmark: vi.fn(async () => ({ ok: true })),
  removeBookmark: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/reader/actions", () => actions);

const app = vi.hoisted(() => ({
  getDocumentVersion: vi.fn(),
  getDocumentVersions: vi.fn(),
  getDocumentRaw: vi.fn(),
  getDocumentVersionRaw: vi.fn(),
}));
vi.mock("@/lib/knowledge/app", async (orig) => ({
  ...(await orig<object>()),
  ...app,
}));
const kbReader = vi.hoisted(() => ({ getReaderDoc: vi.fn() }));
vi.mock("@/lib/knowledge/reader", async (orig) => ({
  ...(await orig<object>()),
  ...kbReader,
}));

import { renderDocument } from "@/components/reader/document-page";
import { READER } from "@/content";
import {
  DocumentOriginal,
  DocumentReader,
  OriginalBookmarks,
  OriginalFrame,
  ORIGINAL_SCROLL,
  docMarkOf,
  originalBookmarkWrite,
  originalScroll,
  originalTag,
  runBookmarkWire,
} from "@/hi2vi/reader/document";
import { ReaderHead } from "@/hi2vi/reader/reader-head";
import { labelWire, removeBookmarkWire } from "@/hi2vi/reader/marks/wire";
import { validateChapter } from "@/lib/native";
import type { KbVariantState } from "@/lib/knowledge/reader";
import type { KbDocument } from "@/lib/knowledge/types";
import {
  legacyMarks,
  loadLooseReader,
  type LoadedLegacy,
  type LegacyMark,
} from "@/lib/reader/load";
import type { ReaderView } from "@/lib/reader/types";
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

const web = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

function view(over: Partial<ReaderView> = {}): ReaderView {
  return {
    kind: "loose",
    member: true,
    title: "배포 전에 확인할 것들",
    lang: "ko",
    langs: [],
    version: 1,
    newest: 1,
    summary: null,
    date: "2026-11-06",
    project: "platform",
    staleSource: null,
    target: {
      kind: "document",
      id: 4,
      canonicalPath: "/@june/platform/deploy-checklist",
    },
    write: { org: "june", project: "platform", doc: "2026-11-06-deploy" },
    progress: {
      state: "unopened",
      finishedVersion: null,
      maxFraction: 0,
      resume: null,
    },
    versions: { ok: true, label: "한국어", rows: [] },
    book: null,
    headings: [],
    settings: { size: 3, theme: "system" },
    ...over,
  };
}

const mark: LegacyMark = {
  id: "b1",
  fraction: 0.4,
  anchor: "rollback",
  label: "",
  lang: "ko",
  version: 1,
};

function legacy(v: ReaderView, marks: LegacyMark[] = [mark]): LoadedLegacy {
  return {
    view: v,
    docId: 4,
    frame: {
      src: "/api/documents/4/raw",
      look: "auto",
      missing: false,
      bookmarks: marks.map((m) => ({ id: m.id, fraction: m.fraction })),
    },
    marks,
  };
}

function loaded(format: "md" | "native") {
  const text =
    format === "md"
      ? "# Sessions\n\n## One\n\nText one.\n\n## Two\n\nText two.\n"
      : "---\nformat: native\nsyntax: 1\ntitle: Sessions\n---\n\n## One {#one}\n\nText one.\n";
  return {
    view: view({ lang: "en", title: "Sessions" }),
    checked: validateChapter(text, format),
    docId: 7,
    assets: null,
    resolveRef: () => null,
    quiz: {},
    notes: null,
  };
}

const page = (l: LoadedLegacy, org: string | null = null) =>
  inApp(
    renderDocument(
      { kind: "legacy", legacy: l },
      { from: null, org },
    ) as ReactElement,
  );

// ---- the chooser (`renderDocument`) ------------------------------------------------------------------------

describe("the chooser sends html to the Original layout, Markdown and native to the document page", () => {
  it("html: DocumentOriginal, keyed by the document and its version", () => {
    const el = renderDocument(
      { kind: "legacy", legacy: legacy(view()) },
      { from: null, org: null },
    );
    expect(isValidElement(el) && el.type).toBe(DocumentOriginal);
    expect(isValidElement(el) && el.key).toBe("4:1");
  });
  for (const format of ["md", "native"] as const)
    it(`${format}: DocumentReader`, () => {
      const el = renderDocument(
        { kind: "reader", reader: loaded(format) },
        { from: null, org: "june" },
      );
      expect(isValidElement(el) && el.type).toBe(DocumentReader);
    });
  it("a visitor's way back is the address's org, else the document's own", () => {
    const visitor = view({ member: false, progress: null });
    const el = renderDocument(
      { kind: "legacy", legacy: legacy(visitor) },
      { from: null, org: null },
    );
    expect(isValidElement<{ org: string | null }>(el) && el.props.org).toBe(
      "june",
    );
  });
});

// ---- the frame: the signed Bar and head, no old chrome --------------------------------------------------------

describe("the Original layout's frame (the old bar is gone)", () => {
  it("draws the signed Bar and head with the tag Original layout, the stage, and no old chrome", () => {
    const html = page(legacy(view()));
    expect(html).toContain('class="app bare reader"');
    expect(html).toContain('<div class="bar-wrap is-sticky">');
    expect(html).toContain('<header class="top bar">');
    // the tag twice: in the bar (before the controls) and in the head (frame.md's N3)
    expect(
      html.match(/<span class="badge">Original layout<\/span>/g),
    ).toHaveLength(2);
    expect(html).toMatch(
      /<div class="top-end"><span class="badge">Original layout<\/span>/,
    );
    expect(html).toMatch(
      /<header class="read-head">[\s\S]*<p><span class="badge">Original layout<\/span><\/p><\/header>/,
    );
    expect(html).toContain('<div class="read-flow" data-original=""');
    expect(html).toContain("<span>Document in platform</span>");
    expect(html).toContain(">Notes</button>");
    expect(html).not.toMatch(/>Ask</);
    // no text column and no end; the foot is the pill alone (none here)
    expect(html).not.toContain("read-end");
    expect(html).not.toContain("foot-bar");
    expect(html).not.toContain('class="read-toc"');
    // one main, one #main-content
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/id="main-content"/g)).toHaveLength(1);
    // the legacy reader's own chrome is gone
    for (const old of [
      "lg-page",
      "rd-top",
      "rd-line",
      "lg-topbox",
      "lg-bottom",
      "lg-bar",
      "rd-resume",
      "lg-showctl",
      "lg-skip",
    ])
      expect(html, old).not.toContain(old);
    // no Print · new tab control (its words remain only in the print-only notice, which hides that line on paper)
    expect(html).not.toContain(`>${READER.legacy.print}</a>`);
    for (const word of [
      READER.legacy.skip,
      READER.legacy.noRestyle,
      READER.notes.bm.plain,
      READER.showControls,
    ])
      expect(html, word).not.toContain(word);
  });

  it("an older version: the bar says Older version, the head its notice, Read v3 and the tag", () => {
    const html = page(legacy(view({ version: 2, newest: 3 })));
    expect(html).toMatch(
      /<div class="top-end"><span class="badge">Older version<\/span>/,
    );
    expect(html).toContain(">Read v3</button>");
    expect(html).toContain("v2 of this document");
    expect(html).toContain('<p><span class="badge">Original layout</span></p>');
    expect(originalTag(2, 3)).toBe("Older version");
    expect(originalTag(3, 3)).toBe("Original layout");
  });

  it("while the frame loads: the Loading state's paragraphs over it, aria-busy and Loading…", () => {
    const html = page(legacy(view()));
    expect(html).toContain('<article class="reader-col" aria-busy="true">');
    expect(html).toContain('<div data-original-state="">');
    expect(html).toContain(
      '<span class="sr-only" role="status">Loading…</span>',
    );
  });

  it("the frame's file missing at load is Document not found, in the bar's frame", () => {
    const l = legacy(view());
    const html = page({ ...l, frame: { ...l.frame, missing: true } });
    expect(html).toContain("Document not found");
    expect(html).toContain(
      "This document doesn’t exist, or it isn’t part of your org.",
    );
    expect(html).not.toContain("data-original");
    expect(html).not.toContain("reader-col");
  });
});

// ---- the head: ReaderHead's own, with the tag ----------------------------------------------------------------

describe("the Original layout's head is ReaderHead with its tag", () => {
  for (const [what, version, newest] of [
    ["the newest", 1, 1],
    ["an older version", 2, 5],
  ] as const)
    it(`${what}`, () => {
      const props = {
        noun: "document" as const,
        title: "배포 전에 확인할 것들",
        lang: "ko",
        where: "Document in platform",
        version,
        newest,
        published: "Nov 6",
        sections: [],
      };
      const signed = renderToStaticMarkup(createElement(ReaderHead, props));
      const ours = renderToStaticMarkup(
        createElement(ReaderHead, { ...props, tag: "Original layout" }),
      );
      const tag = '<p><span class="badge">Original layout</span></p>';
      expect(ours.endsWith(`${tag}</header>`)).toBe(true);
      expect(ours.replace(tag, "")).toBe(signed);
    });

  it("is the head the page mounts (no copy of it of its own)", () => {
    const src = read("src/hi2vi/reader/document/original.tsx");
    expect(src).toMatch(/<ReaderHead[\s\S]*?tag=\{READER_ORIGINAL\.tag\}/);
    expect(src).not.toContain("OriginalHead");
  });
});

// ---- the frame element: today's, unchanged ------------------------------------------------------------------

describe("the html renders through the same frame element as today (a guard)", () => {
  it("its id, classes, relay, sandbox, name, referrer policy and scheme", () => {
    const light = renderToStaticMarkup(
      createElement(OriginalFrame, {
        src: "/api/documents/4/raw",
        title: "Deploy",
        look: "auto",
        dark: false,
        ring: false,
      }),
    );
    expect(light).toBe(
      '<iframe id="legacy-document" class="lg-docframe" src="/api/documents/4/raw" ' +
        'sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" ' +
        'title="Deploy, in its original layout" referrerPolicy="same-origin" ' +
        'style="color-scheme:light"></iframe>',
    );
    const dark = renderToStaticMarkup(
      createElement(OriginalFrame, {
        src: "/api/documents/4/versions/2/raw",
        title: "Deploy",
        look: "auto",
        dark: true,
        ring: true,
      }),
    );
    expect(dark).toContain('class="lg-docframe lg-docframe--dark"');
    expect(dark).toContain('data-ring="1"');
    expect(dark).toContain('style="color-scheme:dark"');
    // a light-only document keeps its light ground on a dark reader
    const lightOnly = renderToStaticMarkup(
      createElement(OriginalFrame, {
        src: "/x",
        title: "Deploy",
        look: "light",
        dark: true,
        ring: false,
      }),
    );
    expect(lightOnly).toContain('class="lg-docframe"');
  });

  it("the page hands it the relay, the title and the look it was given, keyed by the attempt", () => {
    const src = read("src/hi2vi/reader/document/original.tsx");
    const call = /<OriginalFrame\b[^>]*\/>/.exec(src)?.[0] ?? "";
    for (const prop of [
      "key={attempt}",
      "src={frame.src}",
      "title={view.title}",
      "look={frame.look}",
      "onLoad={onFrameLoad}",
    ])
      expect(call, prop).toContain(prop);
  });

  it("fills the window under the bar, the whole width, and stays the document's only scroller", () => {
    const css = read("src/hi2vi/styles/library/document.css");
    expect(css).toMatch(
      /\.read-flow\[data-original\] \{[^}]*width: 100cqw;[^}]*height: calc\(100dvh - var\(--original-bar\)\);[^}]*margin-inline: calc\(50% - 50cqw\);/,
    );
    expect(css).toMatch(
      /\.read-flow\[data-original\] > iframe \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/,
    );
    expect(css).not.toMatch(/overflow:\s*hidden/);
  });
});

// ---- ⌘P: the notice sheet ---------------------------------------------------------------------------------------

describe("⌘P still prints the notice sheet", () => {
  it("the notice is in the page, in the old root its paper rules key on, and nothing else prints", () => {
    const html = page(legacy(view()));
    // the element: `.rd-root .pp-notice`, in the reader's column (`.reader` > … > article)
    expect(html).toMatch(
      /<article class="reader-col"[^>]*><div style="display:contents" data-ui-legacy=""><div class="rd-root" style="display:contents"><section class="pp-notice pp-only">/,
    );
    expect(html).toMatch(
      /<p class="pp-notice__addr">[^<]*<wbr\/>api\/<wbr\/>documents\/<wbr\/>4\/<wbr\/>raw<\/p>/,
    );
    // its last line points at the legacy reader's Print · new tab, which this page has not: it does not print
    // here (the line before `.pp-notice__printed`, inside `.ui`)
    expect(html).toMatch(
      /<p class="pp-notice__p">On screen, the bar under the document has Print · new tab, which opens that page for you\.<\/p><p class="pp-notice__printed">/,
    );
    // the rules: paper shows the notice (kb-print part 3) and hides it on screen
    const paper = read("src/app/kb-print.css");
    expect(paper).toContain(".pp-only { display: none; }");
    expect(paper).toMatch(
      /html \.rd-root \.pp-notice \{ display: flex; flex-direction: column;/,
    );
    expect(paper).toMatch(
      /@media print \{[^]*html \.ui \.rd-root \.pp-notice > \.pp-notice__p:has\(\+ \.pp-notice__printed\) \{ display: none; \}\s*\}/,
    );
    expect(html.startsWith('<div class="ui"')).toBe(true);
    // …and the new markup hides the rest on paper: the frame here, the bar, head and foot in reader.css
    const doc = read("src/hi2vi/styles/library/document.css");
    expect(doc).toMatch(
      /@media print \{\s*\.reader \.read-flow\[data-original\] \{\s*display: none;/,
    );
    const reader = read("src/hi2vi/styles/library/reader.css");
    expect(reader).toMatch(
      /@media print \{\s*\.reader \.bar-wrap,\s*\.reader \.read-head,\s*\.reader \.read-end,\s*\.reader \.reader-foot \{\s*display: none;/,
    );
    expect(html).toContain('class="app bare reader"');
  });
});

// ---- bookmarks: the legacy reader's writes ------------------------------------------------------------------------

describe("a bookmark's writes are the legacy reader's, byte for byte (a guard)", () => {
  const write = { org: "june", project: "platform", doc: "2026-11-06-deploy" };
  beforeEach(() => {
    actions.removeBookmark.mockClear();
    actions.editBookmark.mockClear();
  });
  it("made at a place with an anchor, and without one", () => {
    expect(
      JSON.stringify(
        originalBookmarkWrite({
          write,
          id: "u1",
          version: 2,
          place: { fraction: 0.25, anchor: "rollback" },
        }),
      ),
    ).toBe(
      JSON.stringify({
        org: "june",
        project: "platform",
        doc: "2026-11-06-deploy",
        id: "u1",
        version: 2,
        anchor: { fraction: 0.25, anchor: "rollback" },
        snippet: "",
      }),
    );
    expect(
      JSON.stringify(
        originalBookmarkWrite({
          write,
          id: "u2",
          version: 1,
          place: { fraction: 0, anchor: null },
        }),
      ),
    ).toBe(
      '{"org":"june","project":"platform","doc":"2026-11-06-deploy","id":"u2","version":1,"anchor":{"fraction":0},"snippet":""}',
    );
  });
  it("a removal is removeBookmark({id}), as before; a label the existing edit", async () => {
    await runBookmarkWire(removeBookmarkWire("b1"));
    expect(actions.removeBookmark).toHaveBeenCalledWith({ id: "b1" });
    await runBookmarkWire(labelWire("b1", "rollback"));
    expect(actions.editBookmark).toHaveBeenCalledWith({
      id: "b1",
      label: "rollback",
    });
  });
  it("the Notes sheet lists the kept bookmarks as positions, and offers Bookmark this position", () => {
    const html = renderToStaticMarkup(
      createElement(OriginalBookmarks, {
        open: false,
        initial: [mark, { ...mark, id: "b2", fraction: 0.1, label: "롤백" }],
        member: true,
        write,
        version: 1,
        lang: "ko",
        place: () => ({ fraction: 0, anchor: null }),
        signInHref: "/login",
        onOpen: () => {},
      }),
    );
    expect(html).toContain(
      '<span class="meta" role="status">2 bookmarks</span>',
    );
    expect(html).toContain("Bookmark this position");
    expect(html).toContain("About 40% through");
    expect(html.indexOf("롤백")).toBeLessThan(
      html.indexOf("About 40% through"),
    );
    expect(docMarkOf(mark)).toEqual({
      id: "b1",
      block: null,
      at: null,
      fraction: 0.4,
      label: "",
      pos: true,
      lang: "ko",
      version: 1,
    });
  });
});

// ---- the reading memory's feed -------------------------------------------------------------------------------------

describe("the bridge's scroll feeds the unchanged reading memory, the pill and the head's leaving", () => {
  it("the reading memory hears exactly {fraction, anchor}", () => {
    const step = originalScroll(
      ORIGINAL_SCROLL,
      { fraction: 0.5, y: 900, anchor: "rollback" },
      false,
    );
    expect(JSON.stringify(step.sample)).toBe(
      '{"fraction":0.5,"anchor":"rollback"}',
    );
  });
  it("a resume puts the pill up; the reader's first scroll drops it and gives the document the window", () => {
    const landed = originalScroll(
      { ...ORIGINAL_SCROLL, landing: "pill" },
      { fraction: 0.72, y: 7000, anchor: null },
      true,
    );
    expect(landed.next).toEqual({ y: 7000, landing: null, pill: true });
    expect(landed.down).toBe(false);
    // still inside the restore's quiet window: nothing moves
    const settling = originalScroll(
      landed.next,
      { fraction: 0.73, y: 7010, anchor: null },
      true,
    );
    expect(settling.next.pill).toBe(true);
    expect(settling.down).toBe(false);
    const scrolled = originalScroll(
      settling.next,
      { fraction: 0.74, y: 7100, anchor: null },
      false,
    );
    expect(scrolled.next.pill).toBe(false);
    expect(scrolled.down).toBe(true);
    const up = originalScroll(
      scrolled.next,
      { fraction: 0.7, y: 6900, anchor: null },
      false,
    );
    expect(up.down).toBe(false);
  });
  it("a link's own place (#anchor) lands quietly, with no pill", () => {
    const landed = originalScroll(
      { ...ORIGINAL_SCROLL, landing: "quiet" },
      { fraction: 0.3, y: 3000, anchor: "rollback" },
      true,
    );
    expect(landed.next.pill).toBe(false);
  });
});

// ---- the kept bookmarks' rows (the legacy branch of `load.ts`) -----------------------------------------------------

describe("an html document's bookmarks, as the legacy branch reads them", () => {
  const state = {
    position: null,
    resume: null,
    chapter: { state: "started", finished_version: null, updated: false },
    bookmarks: [
      {
        id: "b1",
        doc: "2026-11-06-deploy",
        lang: "ko",
        version: 1,
        anchor: { fraction: 0.38, anchor: "rollback" },
        label: "롤백",
        snippet: "",
        created_at: "",
        updated_at: "",
        pos: true,
        place: {
          block_id: null,
          exact: true,
          fraction: 0.4,
          section_index: null,
        },
      },
      {
        id: "b2",
        doc: "2026-11-06-deploy",
        lang: "ko",
        version: 2,
        anchor: { fraction: 0.1 },
        label: null,
        snippet: "",
        created_at: "",
        updated_at: "",
      },
      {
        id: "b3",
        doc: "2026-11-06-deploy",
        lang: "ko",
        version: 1,
        anchor: { fraction: 1.5 },
        label: null,
        snippet: "",
        created_at: "",
        updated_at: "",
      },
    ],
  } as unknown as KbVariantState;

  it("keeps legacyBookmarks' rule (the server's place first, nothing outside 0..1) and what a row shows", () => {
    expect(legacyMarks(state)).toEqual([
      {
        id: "b1",
        fraction: 0.4,
        anchor: "rollback",
        label: "롤백",
        lang: "ko",
        version: 1,
      },
      {
        id: "b2",
        fraction: 0.1,
        anchor: null,
        label: "",
        lang: "ko",
        version: 2,
      },
    ]);
    expect(legacyMarks(null)).toEqual([]);
  });

  it("loadLooseReader hands a member's html document both the frame's bookmarks and the rows", async () => {
    app.getDocumentVersions.mockResolvedValue({ versions: [] });
    app.getDocumentRaw.mockResolvedValue(
      new Response('<html lang="ko"><body>x</body></html>'),
    );
    kbReader.getReaderDoc.mockResolvedValue(state);
    const out = await loadLooseReader({
      token: "t",
      doc: {
        id: 4,
        project: "platform",
        rel_path: "2026-11-06-deploy.html",
        title: "배포 전에 확인할 것들",
        date: "2026-11-06",
        version: 1,
        format: "html",
        canonical_path: "/@june/platform/deploy",
      } as KbDocument,
      v: null,
      settings: { size: 3, theme: "system" },
    });
    expect(out.kind).toBe("legacy");
    if (out.kind !== "legacy") return;
    expect(out.legacy.frame.bookmarks).toEqual([
      { id: "b1", fraction: 0.4 },
      { id: "b2", fraction: 0.1 },
    ]);
    expect(out.legacy.marks?.map((m) => [m.id, m.fraction])).toEqual(
      out.legacy.frame.bookmarks.map((b) => [b.id, b.fraction]),
    );
    expect(out.legacy.marks?.[0].label).toBe("롤백");
  });
});
