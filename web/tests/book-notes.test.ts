import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkRow } from "@/hi2vi/library/mark-row";
import {
  deleteWire,
  notesBack,
  notesChapters,
  notesChoose,
  notesHead,
  notesOpening,
  notesPlace,
  notesRow,
  notesStore,
  readingOrder,
  sendOnLeaving,
  type NotesChapter,
  type NotesRow,
  type SendWire,
} from "@/hi2vi/reader/book-notes/model";
import type { Wire } from "@/hi2vi/reader/marks/wire";
import type { Timers } from "@/hi2vi/reader/marks/undo";
import type { ListItem } from "@/lib/reader/note-list";
import { readerHref } from "@/lib/reader-href";

// Notes in this book (job 03, Library round 02, `## Build` § Page: book-notes): the head's counts per choice, a
// delete that waits out its undo line, the sends on a change of the choice and on leaving, the way a mark made in
// another language opens, and the payloads of the existing delete and label actions. The look is the fidelity
// slice's, checked live.

const item = (over: Partial<ListItem>): ListItem => ({
  id: "x",
  kind: "hl",
  status: "anchored",
  lang: "en",
  version: 1,
  sec: "s1",
  secTitle: "Background",
  quote: "",
  note: "",
  label: "",
  snippet: "",
  card: "",
  review: false,
  approx: false,
  pos: false,
  frac: 0,
  code: false,
  snapshot: null,
  chapterTitle: null,
  chapterKey: null,
  order: 0,
  ...over,
});

const CHAPTERS: NotesChapter[] = [
  { key: "c1", n: 1, title: "One", lang: "en" },
  { key: "c2", n: 2, title: "Two", lang: "en" },
  { key: "c3", n: 3, title: "Three", lang: "en" },
];

const href = (key: string) => (place: Parameters<typeof readerHref>[1]) =>
  readerHref(
    { kind: "chapter", org: "o", project: "p", book: "b", chapter: key },
    place,
  );

const row = (key: string, over: Partial<ListItem>): NotesRow =>
  notesRow(
    item({ chapterKey: key, ...over }),
    { key, lang: "en" },
    href(key),
    over.sec ?? "s1",
  );

// five marks in three chapters: two bookmarks, three highlights and notes, one unanchored
const ROWS = readingOrder(
  [
    row("c1", { id: "h1", quote: "A passage", note: "A note" }),
    row("c1", { id: "b1", kind: "bm", label: "" }),
    row("c2", { id: "n1", kind: "bnote", note: "On a section" }),
    row("c2", { id: "p1", kind: "bm", pos: true, frac: 0.4 }),
    row("c3", { id: "g1", status: "orphan", quote: "Gone", sec: null }),
  ],
  CHAPTERS,
);
const NONE = { waiting: new Set<string>(), gone: new Set<string>() };

describe("the head, for each choice", () => {
  it("counts the marks of the choice and the chapters they sit in, and the unanchored ones", () => {
    expect(notesHead(ROWS, "all", NONE)).toEqual({
      count: "5 items in 3 chapters",
      unanchored: "1 unanchored",
      counts: { all: 5, bm: 2, hl: 3 },
    });
    expect(notesHead(ROWS, "bm", NONE)).toMatchObject({
      count: "2 bookmarks in 2 chapters",
      unanchored: null,
    });
    expect(notesHead(ROWS, "hl", NONE)).toMatchObject({
      count: "3 highlights and notes in 3 chapters",
      unanchored: "1 unanchored",
    });
    expect(notesHead(ROWS.slice(0, 1), "hl", NONE).count).toBe(
      "1 highlight or note in 1 chapter",
    );
    for (const [f, zero] of [
      ["all", "0 items"],
      ["bm", "0 bookmarks"],
      ["hl", "0 highlights and notes"],
    ] as const)
      expect(notesHead([], f, NONE).count).toBe(zero);
  });

  it("keeps an unanchored mark in its chapter, last, with no link", () => {
    const order = readingOrder(
      [
        row("c1", { id: "g", status: "orphan", sec: null }),
        row("c1", { id: "a" }),
      ],
      CHAPTERS,
    );
    expect(order.map((r) => r.id)).toEqual(["a", "g"]);
    expect(order[1].href).toBeNull();
  });

  it("stands only the chapters with a mark in the choice", () => {
    const shown = (f: "all" | "bm" | "hl") =>
      notesChapters(CHAPTERS, ROWS, f, { gone: new Set(), labels: {} }).map(
        (c) => c.key,
      );
    expect(shown("all")).toEqual(["c1", "c2", "c3"]);
    expect(shown("bm")).toEqual(["c1", "c2"]);
  });
});

/** Timers the test runs by hand. */
function handTimers() {
  let now = 0;
  const due: { at: number; fn: () => void; live: boolean }[] = [];
  const timers: Timers = {
    set: (fn, ms) => {
      const t = { at: now + ms, fn, live: true };
      due.push(t);
      return t;
    },
    clear: (h) => {
      (h as { live: boolean }).live = false;
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of due.filter((d) => d.live && d.at <= now)) {
      t.live = false;
      t.fn();
    }
  };
  return { timers, advance };
}

function setup(ok = true) {
  const sent: Wire[] = [];
  const send: SendWire = async (w) => {
    sent.push(w);
    return { ok };
  };
  const { timers, advance } = handTimers();
  const store = notesStore(send, timers);
  return { store, sent, advance };
}

describe("a delete with undo (F65, F91)", () => {
  const h1 = ROWS.find((r) => r.id === "h1")!;
  const b1 = ROWS.find((r) => r.id === "b1")!;

  it("leaves every count at once, and Undo restores them; nothing is sent in the ten seconds after", () => {
    const { store, sent, advance } = setup();
    store.remove(h1);
    expect(notesHead(ROWS, "all", store.get())).toMatchObject({
      count: "4 items in 3 chapters",
      counts: { all: 4, bm: 2, hl: 2 },
    });
    // the row stays, as its undo line
    expect(
      notesChapters(CHAPTERS, ROWS, "all", store.get())[0].rows.map(
        (r) => r.id,
      ),
    ).toContain("h1");
    advance(3_000);
    store.undo("h1");
    expect(notesHead(ROWS, "all", store.get()).counts).toEqual({
      all: 5,
      bm: 2,
      hl: 3,
    });
    advance(10_000);
    expect(sent).toEqual([]);
  });

  it("is sent after ten seconds, and the row leaves, its chapter with its last row", async () => {
    const { store, sent, advance } = setup();
    const g1 = ROWS.find((r) => r.id === "g1")!;
    store.remove(g1);
    advance(9_999);
    expect(sent).toEqual([]);
    advance(1);
    expect(sent).toEqual([{ op: "remove", input: { id: "g1" } }]);
    await store.gone("g1");
    expect(
      notesChapters(CHAPTERS, ROWS, "all", store.get()).map((c) => c.key),
    ).toEqual(["c1", "c2"]);
  });

  it("puts a mark whose delete failed back, with MarkRow's line, and the counts return", async () => {
    const { store, advance } = setup(false);
    store.remove(h1);
    advance(10_000);
    await expect(store.gone("h1")).rejects.toThrow();
    expect(store.get().failed.has("h1")).toBe(true);
    expect(notesHead(ROWS, "all", store.get()).counts.all).toBe(5);
  });

  it("sends every delete still waiting when the choice changes", () => {
    const { store, sent } = setup();
    store.remove(h1);
    store.remove(b1);
    expect(notesChoose(store, "bm")).toBe("bm");
    expect(sent).toEqual([
      { op: "remove", input: { id: "h1" } },
      { op: "bm-remove", input: { id: "b1" } },
    ]);
  });

  it("sends every delete still waiting on leaving: hidden, pagehide, or the page going away", () => {
    for (const leave of ["hidden", "pagehide", "unmount"] as const) {
      const { store, sent } = setup();
      const doc = Object.assign(new EventTarget(), {
        visibilityState: "visible" as DocumentVisibilityState,
      });
      const win = new EventTarget();
      const stop = sendOnLeaving(
        store,
        doc as unknown as Document,
        win as unknown as Window,
      );
      store.remove(h1);
      doc.dispatchEvent(new Event("visibilitychange")); // still visible: nothing
      expect(sent).toEqual([]);
      if (leave === "hidden") {
        doc.visibilityState = "hidden";
        doc.dispatchEvent(new Event("visibilitychange"));
      } else if (leave === "pagehide") win.dispatchEvent(new Event("pagehide"));
      else stop();
      expect(sent, leave).toEqual([{ op: "remove", input: { id: "h1" } }]);
    }
  });
});

describe("the existing actions' payloads, unchanged", () => {
  it("deletes a highlight or a note by `removeAnnotation`, a bookmark or a position by `removeBookmark`", () => {
    const id = (i: string) => ROWS.find((r) => r.id === i)!.mark;
    expect(deleteWire(id("h1"))).toEqual({ op: "remove", input: { id: "h1" } });
    expect(deleteWire(id("n1"))).toEqual({ op: "remove", input: { id: "n1" } });
    expect(deleteWire(id("b1"))).toEqual({
      op: "bm-remove",
      input: { id: "b1" },
    });
    expect(deleteWire(id("p1"))).toEqual({
      op: "bm-remove",
      input: { id: "p1" },
    });
  });

  it("saves a label trimmed to 120 characters, clears it with null, and sends nothing unchanged", async () => {
    const { store, sent } = setup();
    const b1 = ROWS.find((r) => r.id === "b1")!;
    await store.label(b1, `  ${"x".repeat(130)}  `);
    await store.label(b1, "x".repeat(120));
    await store.label(b1, "   ");
    expect(sent).toEqual([
      { op: "bm-edit", input: { id: "b1", label: "x".repeat(120) } },
      { op: "bm-edit", input: { id: "b1", label: null } },
    ]);
    expect(store.get().labels.b1).toBe("");
  });

  it("puts a label back that was not saved", async () => {
    const { store } = setup(false);
    const b1 = ROWS.find((r) => r.id === "b1")!;
    await store.label(b1, "Request ids");
    expect(store.get().labels.b1).toBe("");
  });
});

describe("opening a mark", () => {
  it("opens a mark made in Korean in the Korean text, at the mark; the chapter's own language needs no lang", () => {
    const ko = row("c1", { id: "k1", lang: "ko", quote: "비공개" });
    expect(ko.mark.state).toBe("other");
    expect(ko.href).toBe("/@o/p/books/b/c1?lang=ko&note=k1#s1");
    expect(row("c1", { id: "e1" }).href).toBe("/@o/p/books/b/c1?note=e1#s1");
  });
});

describe("the way back", () => {
  it("names the book, or the chapter it was opened from", () => {
    expect(
      notesBack({ bookTitle: "Handbook", bookHref: "/b", chapter: null }),
    ).toEqual({ label: "Handbook", short: "Book", href: "/b" });
    expect(
      notesBack({
        bookTitle: "Handbook",
        bookHref: "/b",
        chapter: { title: "Projects", href: "/c" },
      }),
    ).toEqual({ label: "Projects", short: "Chapter", href: "/c" });
  });

  it("reads Book or Chapter while loading, from the address alone", () => {
    expect(notesPlace("/@o/p/notes/b?from=book")).toEqual({
      label: "Book",
      short: "Book",
      href: "/@o/p/books/b",
    });
    expect(notesPlace("/@o/p/notes/b?ch=c3&lang=ko&v=2&at=s4")).toEqual({
      label: "Chapter",
      short: "Chapter",
      href: "/@o/p/books/b/c3?lang=ko&v=2#s4",
    });
    expect(notesPlace("/@o/p/notes/b?ch=BAD")).toMatchObject({
      label: "Book",
    });
    expect(notesOpening(() => undefined).from).toBe("chapter");
  });
});

describe("a mark's row (MarkRow)", () => {
  it("tags an unlabelled bookmark's lead name with the row's language", () => {
    const html = renderToStaticMarkup(
      createElement(MarkRow, {
        mark: {
          id: "b",
          kind: "bookmark",
          lang: "ko",
          version: 1,
          state: "ok",
          review: null,
        },
        place: "검색 색인",
        placeLang: "ko",
      }),
    );
    expect(html).toContain('<span class="strong" lang="ko">검색 색인</span>');
  });
});
