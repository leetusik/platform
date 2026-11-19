import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KbReaderBook } from "@/lib/knowledge/reader";
import type { KbBook, KbBookVariant, KbDocument } from "@/lib/knowledge/types";

// The book page's Continue reading (job 07 F242: "opens the chapter at its kept place"): the kept place is the saved
// block, so the link carries no `#`, and the reader resumes there with its pill and leaves the place as it was, as
// the Library's and the review end's Continue readings do. A `#<section>` would win over the resume
// (`landingFor`), land on the heading and save the heading as the new place. "Left off at <section>" stays.
// Driven through `loadBook` with the reads mocked; the fixtures are real chapters (`tests/fixtures`).

const app = vi.hoisted(() => ({
  getBook: vi.fn(),
  getDocument: vi.fn(),
  getDocumentVersions: vi.fn(),
}));
vi.mock("@/lib/knowledge/app", async (orig) => ({
  ...(await orig<object>()),
  ...app,
}));
const reader = vi.hoisted(() => ({
  getReaderBook: vi.fn(),
  getReaderBookNotes: vi.fn(),
}));
vi.mock("@/lib/knowledge/reader", async (orig) => ({
  ...(await orig<object>()),
  ...reader,
}));
vi.mock("@/lib/auth-guards", () => ({
  optionalIdentity: vi.fn(async () => ({
    token: "t",
    identity: {
      tenant: { id: "t1", slug: "june", name: "June's notes" },
      tenants: [],
    },
  })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));

const { loadBook } = await import("@/lib/book/load");
const { landingFor } = await import("@/lib/reader/position");

const fixture = (path: string) =>
  readFileSync(
    new URL(`../../tests/fixtures/${path}`, import.meta.url),
    "utf8",
  );

// A saved block before the chapter's first heading: a figure, then the chapter's sections.
const BEFORE_HEADING = `---
title: "Rate limits in practice"
format: native
syntax: 1
lang: en
summary: How a token bucket keeps a busy client from crowding out the others.
---
\`\`\`figure #bucket-tile
src: bucket-tile
alt: A teal tile standing in for a bucket that refills with tokens at a fixed rate
caption: The bucket, *as a placeholder tile*.
\`\`\`

## Why a bucket {#why-a-bucket}

A client that has been idle for a while saves up a few requests, and may spend them at once.
`;

const SOURCES: Record<number, string> = {
  11: fixture("book/write-lock.en.md"),
  12: fixture("book/write-lock.ko.md"),
  21: fixture("native/glossary.md"),
  31: BEFORE_HEADING,
};

const variant = (
  doc_id: number,
  lang: string,
  slug: string,
  title: string,
): KbBookVariant => ({
  lang,
  doc_id,
  rel_path: `platform/${slug}.md`,
  title,
  slug,
  version: 1,
  format: "native",
  updated_at: "2026-11-12T09:00:00+00:00",
  translated_from: lang === "en" ? null : { lang: "en", version: 1 },
});

const BOOK: KbBook = {
  project: "platform",
  slug: "guide",
  title: "The Marlow ledger, from the inside",
  kind: "codebase",
  subject: null,
  description: null,
  canonical_path: "/@june/platform/books/guide",
  chapters: [
    {
      key: "write-lock",
      position: 1,
      title: null,
      source: null,
      variants: [
        variant(11, "en", "write-lock", "The write lock"),
        variant(12, "ko", "write-lock-ko", "쓰기 잠금"),
      ],
    },
    {
      key: "rate-limits",
      position: 2,
      title: null,
      source: null,
      variants: [variant(21, "en", "rate-limits", "Rate limits")],
    },
    {
      key: "in-practice",
      position: 3,
      title: null,
      source: null,
      variants: [variant(31, "en", "in-practice", "Rate limits in practice")],
    },
  ],
} as KbBook;

/** The reader's book state: `key` started at `anchor` (in `lang`), the other chapters unopened; or nothing kept. */
function kept(
  at: {
    key: string;
    lang: string;
    anchor: string | null;
    fraction: number;
  } | null,
): KbReaderBook {
  return {
    progress: { finished: 0, started: at ? 1 : 0, total: 3 },
    chapters: BOOK.chapters.map((c) => {
      const mine = at && c.key === at.key;
      return {
        key: c.key,
        state: mine ? "started" : "unopened",
        finished_version: null,
        updated: false,
        position: mine
          ? {
              doc: `${c.key}-${at.lang}`,
              lang: at.lang,
              version: 1,
              anchor_id: at.anchor,
              fraction: at.fraction,
              max_fraction: at.fraction,
            }
          : null,
      };
    }),
    continue: at
      ? {
          chapter_key: at.key,
          doc: `${at.key}-${at.lang}`,
          lang: at.lang,
          anchor_id: at.anchor,
          fraction: at.fraction,
          state: "started",
          updated_at: "2026-11-17T08:00:00Z",
        }
      : null,
    counts: { chapters_with_place: at ? 1 : 0, marks: 0 },
  };
}

beforeEach(() => {
  for (const f of [...Object.values(app), ...Object.values(reader)])
    f.mockReset();
  app.getBook.mockResolvedValue(BOOK);
  app.getDocument.mockImplementation(
    async (_token: unknown, id: number) =>
      ({ id, format: "native", source: SOURCES[id] }) as unknown as KbDocument,
  );
  reader.getReaderBookNotes.mockResolvedValue({
    annotations: [],
    unanchored: [],
    bookmarks: [],
  });
});

/** How the reader lands on an address from the book page: a hash naming an element wins over the resume. */
function landing(href: string) {
  const hash = new URL(href, "https://hi2vi.invalid").hash.length > 1;
  return landingFor({ hash, note: false, resume: true, navigated: true });
}

async function cont(at: Parameters<typeof kept>[0], from = "/library") {
  reader.getReaderBook.mockResolvedValue(kept(at));
  const view = await loadBook("june", "platform", "guide", from);
  return { view, cont: view.cont };
}

describe("the book's Continue reading resumes the saved place (F242: at its kept place)", () => {
  it("a saved block under a heading with an id, screens below it: no hash, the reader resumes; Left off at it", async () => {
    const { view, cont: c } = await cont({
      key: "write-lock",
      lang: "en",
      anchor: "lock-flow",
      fraction: 0.57,
    });
    expect(c.mode).toBe("continue");
    expect(c.action).toBe("Continue reading");
    expect(c.href).not.toContain("#");
    // the chapter's own address, as its row in the contents carries it (with the way back)
    expect(c.href).toBe(view.rows[0].href);
    expect(c.href).toContain("from=%2Flibrary");
    expect(landing(c.href)).toBe("resume");
    expect(c.facts).toContain("Left off at How it works");
  });

  it("the same in a Korean chapter: its address keeps its language, never a section", async () => {
    const { cont: c } = await cont({
      key: "write-lock",
      lang: "ko",
      anchor: "lock-flow",
      fraction: 0.4,
    });
    expect(c.href).not.toContain("#");
    expect(
      new URL(c.href, "https://hi2vi.invalid").searchParams.get("lang"),
    ).toBe("ko");
    expect(landing(c.href)).toBe("resume");
    expect(c.facts).toContain("Left off at 동작 방식");
  });

  it("a saved block before the first heading: no hash, the share read instead of a section", async () => {
    const { cont: c } = await cont({
      key: "in-practice",
      lang: "en",
      anchor: "bucket-tile",
      fraction: 0.12,
    });
    expect(c.href).not.toContain("#");
    expect(landing(c.href)).toBe("resume");
    // no section to name: the share the reader got to
    expect(c.facts).toContain("Left off at 12%");
  });

  it("a glossary place: no hash, Left off at Glossary", async () => {
    const { cont: c } = await cont({
      key: "rate-limits",
      lang: "en",
      anchor: "glossary",
      fraction: 0.8,
    });
    expect(c.href).not.toContain("#");
    expect(landing(c.href)).toBe("resume");
    expect(c.facts).toContain("Left off at Glossary");
  });

  it("nothing kept: the first chapter from its top", async () => {
    const { view, cont: c } = await cont(null);
    expect(c.mode).toBe("start");
    expect(c.href).toBe(view.rows[0].href);
    expect(c.href).not.toContain("#");
  });
});
