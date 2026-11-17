import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { docsTable, type DocsOptions } from "@/lib/library/lists";
import { loadDocsSource } from "@/lib/library/load-lists";
import type { KbOrgLibrary } from "@/lib/knowledge/types";
import { projectLibraryView, visitorSource } from "@/lib/project-library/model";

// P63 — All documents (and a project's library) reads what one page needs: the upstream reads
// behind one render are a small constant whatever the library's size, and no read pays for a query
// embedding. Driven through the loader's fetch seam against a stubbed backend that answers the way
// `server/search.py` does: in hybrid mode `/app/search`'s `total` is every embedded document and each
// call embeds the query once (the paid call, counted here, never made).

const TOKEN = "0GkQ3vJ8bYd1wZs5RfN7tXcA2eLmPqU9hVjK4oIyB6M";
const NOW = { now: Date.parse("2026-11-15T10:00:00Z"), timeZone: "UTC" };
const BEFORE = "lorem ipsum dolor sit amet consectetur adipiscing ";
const AFTER =
  " elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua";

interface Doc {
  id: number;
  project: string;
  title: string;
  tags: string[];
  text: string;
  date: string;
}

interface Backend {
  docs: Doc[];
  mode: "hybrid" | "bm25";
  calls: string[];
  embeddings: number;
}

const has = (s: string, q: string) => s.toLowerCase().includes(q.toLowerCase());

function day(i: number): string {
  return new Date(Date.UTC(2026, 10, 14) - Math.floor(i / 7) * 864e5)
    .toISOString()
    .slice(0, 10);
}

/** `n` documents over two projects; `text(i)` and `tags(i)` say what each holds. */
function corpus(
  n: number,
  text: (i: number) => boolean = () => false,
  tags: (i: number) => string[] = (i) => [`t${i % 9}`],
): Doc[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 10_000 + i,
    project: i % 3 === 0 ? "vocky" : "platform",
    title: `Document ${i}`,
    tags: tags(i),
    text: text(i) ? `${BEFORE}needle${AFTER}` : `${BEFORE}hay${AFTER}`,
    date: day(i),
  }));
}

function listingOf(docs: Doc[]): KbOrgLibrary {
  return {
    org: { id: "t1", slug: "june", name: "Personal", label: "june" },
    member: true,
    projects: [
      { name: "platform", visibility: "private" },
      { name: "vocky", visibility: "public" },
    ],
    books: [],
    documents: docs.map((d) => ({
      id: d.id,
      project: d.project,
      slug: `doc-${d.id}`,
      doc: `${d.date}-doc-${d.id}`,
      title: d.title,
      date: d.date,
      format: "md" as const,
      lang: "en",
      version: 1,
      subject: null,
      tags: d.tags,
      canonical_path: `/@june/${d.project}/doc-${d.id}`,
    })),
  };
}

const marked = (d: Doc, q: string) => {
  const i = d.text.toLowerCase().indexOf(q.toLowerCase());
  return `…${d.text.slice(0, i)}<mark>${d.text.slice(i, i + q.length)}</mark>${d.text.slice(i + q.length)}…`;
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** The stubbed backend: the routes the table may read, each call recorded. */
function serve(b: Backend) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    b.calls.push(url.pathname);
    if (url.pathname === "/app/documents") {
      return json({
        total: b.docs.length,
        items: b.docs
          .slice(offset, offset + limit)
          .map((d) => ({ id: d.id, tags: d.tags })),
      });
    }
    if (url.pathname === "/app/search") {
      // search.py: every keyword hit (title, tags or text), and in hybrid mode the fused union with
      // every embedded document (vector-only hits carry a leading-text snippet, nothing marked).
      const kw = b.docs.filter(
        (d) =>
          has(d.title, q) || d.tags.some((t) => has(t, q)) || has(d.text, q),
      );
      const ranked =
        b.mode === "hybrid"
          ? [...kw, ...b.docs.filter((d) => !kw.includes(d))]
          : kw;
      if (b.mode === "hybrid") b.embeddings += 1;
      return json({
        query: q,
        mode: b.mode,
        total: ranked.length,
        limit,
        offset,
        results: ranked.slice(offset, offset + limit).map((d) => ({
          id: d.id,
          snippet: has(d.text, q) ? marked(d, q) : d.text,
        })),
      });
    }
    if (url.pathname === "/app/search/text") {
      const ids = b.docs.filter((d) => has(d.text, q)).map((d) => d.id);
      return json({ query: q, total: ids.length, ids });
    }
    if (url.pathname === "/app/search/snippets") {
      const want = new Set(url.searchParams.getAll("ids").map(Number));
      const snippets: Record<string, string> = {};
      for (const d of b.docs)
        if (want.has(d.id) && has(d.text, q)) snippets[d.id] = marked(d, q);
      return json({ query: q, snippets });
    }
    return new Response(JSON.stringify({ detail: "Not Found" }), {
      status: 404,
    });
  };
}

let backend: Backend;

function use(docs: Doc[], mode: Backend["mode"] = "hybrid"): KbOrgLibrary {
  backend = { docs, mode, calls: [], embeddings: 0 };
  vi.mocked(fetch).mockImplementation(serve(backend) as typeof fetch);
  return listingOf(docs);
}

/** One render of All documents (or of a project's table: `filter`). */
async function render(listing: KbOrgLibrary, options: DocsOptions) {
  const source = await loadDocsSource(TOKEN, listing, options);
  return docsTable(listing, source, { ...options, format: NOW });
}

beforeAll(() => {
  process.env.KB_API_BASE_URL = "http://kb.test:8766";
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The most reads one searched render makes: the text's matches, and the page's excerpts. */
const READS = 2;

describe("a searched render reads a constant, and pays for no embedding", () => {
  it("hybrid, 600 embedded documents, one text match", async () => {
    const listing = use(corpus(600, (i) => i === 437));
    const table = await render(listing, { q: "needle" });
    expect(backend.calls.length).toBeLessThanOrEqual(READS);
    expect(backend.embeddings).toBe(0);
    expect(table.count).toBe("1 of 600 documents");
    expect(table.items.map((d) => d.id)).toEqual([10_437]);
    expect(table.items[0].match).toEqual({
      where: "text",
      excerpt: {
        before: `…${BEFORE.slice(-48)}`,
        hit: "needle",
        after: `${AFTER.slice(0, 72)}…`,
      },
    });
  });

  it("hybrid, 230 embedded documents (50 < N < 500), the same constant", async () => {
    const listing = use(corpus(230, (i) => i % 40 === 0));
    const table = await render(listing, { q: "needle", page: 1 });
    expect(backend.calls.length).toBeLessThanOrEqual(READS);
    expect(backend.embeddings).toBe(0);
    expect(table.count).toBe("6 of 230 documents");
    expect(table.items.every((d) => d.match?.where === "text")).toBe(true);
  });

  it("the project library's search: the same path, the same constant", async () => {
    const listing = use(corpus(600, (i) => i === 437 || i === 439));
    const project = "platform"; // 437 and 439 are both platform's (i % 3 !== 0)
    const options = { q: "needle", filter: project, page: 1 };
    const source = await loadDocsSource(TOKEN, listing, options);
    const view = projectLibraryView(
      listing,
      { books: [], docs: [] },
      project,
      { viewer: "member", id: "p-1" },
      { page: 1, q: "needle" },
      source,
      NOW,
    );
    expect(backend.calls.length).toBeLessThanOrEqual(READS);
    expect(backend.embeddings).toBe(0);
    expect(view.docs.count).toBe("2 of 400 documents");
    expect(view.docs.items.map((d) => d.match?.where)).toEqual([
      "text",
      "text",
    ]);
  });
});

describe("keyword mode past 500 text matches", () => {
  it("counts every match and reaches each by the pager", async () => {
    const listing = use(
      corpus(700, (i) => i < 620),
      "bm25",
    );
    const first = await render(listing, { q: "needle" });
    expect(first.count).toBe("620 of 700 documents");
    expect(first.pages).toBe(25);
    backend.calls = [];
    const last = await render(listing, { q: "needle", page: 25 });
    expect(backend.calls.length).toBeLessThanOrEqual(READS);
    expect(last.range).toBe("601–620 of 620");
    expect(last.items).toHaveLength(20);
    expect(
      last.items.every(
        (d) => d.match?.where === "text" && d.match.excerpt?.hit === "needle",
      ),
    ).toBe(true);
  });
});

describe("a render without a search", () => {
  it("makes no read beside the listing, and every row carries its tags", async () => {
    const listing = use(corpus(600));
    const table = await render(listing, { page: 3 });
    expect(backend.calls).toEqual([]);
    expect(table.items).toHaveLength(25);
    expect(table.items.every((d) => d.tags.length === 1)).toBe(true);
  });

  it("past 5,000 documents: tags present, and a tag search finds them", async () => {
    const n = 5200;
    const listing = use(
      corpus(
        n,
        () => false,
        (i) => (i === 5100 ? ["rare-tag"] : [`t${i % 9}`]),
      ),
    );
    // Newest first, seven a day, the higher id first: document 5100 is row 5099 of 5200, on page 204.
    const late = await render(listing, { page: 204 });
    expect(late.items.find((d) => d.id === 15_100)?.tags).toEqual(["rare-tag"]);
    backend.calls = [];
    const found = await render(listing, { q: "rare-tag" });
    expect(found.count).toBe("1 of 5,200 documents");
    expect(found.items.map((d) => [d.id, d.match?.where])).toEqual([
      [15_100, "tag"],
    ]);
    expect(backend.calls.length).toBeLessThanOrEqual(READS);
  });
});

describe("still as before", () => {
  it("keyword mode, fewer than 50 matches: the rows, the count and the excerpts", async () => {
    const listing = use(
      corpus(100, (i) => i % 4 === 0),
      "bm25",
    );
    const table = await render(listing, { q: "needle" });
    expect(table.count).toBe("25 of 100 documents");
    expect(table.items).toHaveLength(25);
    expect(table.items.every((d) => d.match?.where === "text")).toBe(true);
    expect(backend.calls.length).toBeLessThanOrEqual(READS);
  });

  it("a title match wins over the text, and reads only the text's matches", async () => {
    const listing = use(corpus(60), "bm25");
    const table = await render(listing, { q: "Document 59" });
    expect(table.items.map((d) => [d.id, d.match?.where])).toEqual([
      [10_059, "title"],
    ]);
    expect(backend.calls).toEqual(["/app/search/text"]);
  });

  it("a visitor's project library takes its tags from the listing and reads nothing", async () => {
    const listing = use(corpus(30));
    const view = projectLibraryView(
      listing,
      null,
      "platform",
      { viewer: "visitor", org: "june" },
      { page: 1, q: "needle" },
      visitorSource(listing),
      NOW,
    );
    expect(backend.calls).toEqual([]);
    expect(view.docs.count).toBe("20 documents");
    // the newest platform row is document 5 (same day as 1 to 6, the higher id first)
    expect(view.docs.items[0].tags).toEqual(["t5"]);
  });
});
