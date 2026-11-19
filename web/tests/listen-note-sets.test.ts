import { describe, expect, it } from "vitest";

import type { ListenKey } from "@/lib/listen/machine";
import { noteKey } from "@/lib/listen/machine";
import type { Listen, ListenEntry } from "@/lib/listen/types";
import { dockView, noteView, playerView } from "@/lib/listen/view";

// P64-3y.F1 — the note's table by where the Listen stands, and the sets every figure counts (job 07 frame.md
// F204, F232; `pages/frame/fixture.js` `LR.note` / `LR.dock`; `Listen.dc.html`'s `keyFor`, `noteFigs` and the
// presets "Chapter 7 preparing", "Chapter 8 waits for 7", "Next chapter still preparing", "Finished, last
// chapter"). Entries are shaped as the server sends them: a book Listen's own chapters, from its start chapter
// to the book's end (`server/listen_api.py` `_resolve`), never the chapters before it.

interface Ch {
  key: string;
  title: string;
  lang?: string;
}

const GUIDE: Ch[] = [
  {
    key: "reading-aids",
    title: "Reading aids: formulas, terms and the glossary",
  },
  {
    key: "write-lock",
    title: "The write lock, and why a draft waits its turn",
  },
  { key: "every-block", title: "Every block the reader knows, once each" },
];

const HANDBOOK: Ch[] = [
  "Why the platform is one product",
  "Projects, orgs and who can read what",
  "How a document is stored",
  "Search: from a query to a passage",
  "Sessions and sign-in",
  "Capture: from a widget to a message",
  "Deduplication and the owner’s alert",
  "Publishing a public project",
  "The reader and its memory",
  "Listen: how a text becomes audio",
  "Review: the cards and their schedule",
  "프로젝트와 조직: 누가 무엇을 읽는가",
  "The plugin and the self-host scaffold",
  "What the code cannot say",
].map((title, i) => ({
  key: `c${i + 1}`,
  title,
  lang: i === 11 ? "ko" : "en",
}));

const made = (chapter: string, len: number): ListenEntry => ({
  chapter,
  state: "made",
  len,
  part: null,
  left: null,
});
const making = (
  chapter: string,
  n: number,
  of: number,
  left: number | null,
): ListenEntry => ({
  chapter,
  state: "making",
  len: null,
  part: { n, of },
  left,
});
const none = (chapter: string): ListenEntry => ({
  chapter,
  state: "none",
  len: null,
  part: null,
  left: null,
});
const unavailable = (chapter: string): ListenEntry => ({
  chapter,
  state: "unavailable",
  len: null,
  part: null,
  left: null,
});

/** A book Listen from `from`, at `ch`, of `chapters`, with the server's own entries. */
function book(
  chapters: Ch[],
  state: ListenKey,
  p: {
    from: string;
    ch?: string;
    entries: ListenEntry[];
    lang?: string;
    more?: Partial<Listen>;
  },
): Listen {
  const pending = p.entries.find(
    (e) => e.state !== "made" && e.state !== "unavailable",
  );
  const all = p.entries.filter((e) => e.state !== "unavailable");
  return {
    unit: "p64-fid/handbook/books/guide",
    key: {
      org: "p64-fid",
      project: "handbook",
      book: "guide",
      from_chapter: p.from,
      ...(p.lang ? { lang: p.lang } : {}),
    },
    kind: "book",
    title: chapters.find((c) => c.key === (p.ch ?? p.from))?.title ?? "",
    titleLang: p.lang ?? "en",
    lang: p.lang ?? "en",
    href: `/@p64-fid/handbook/books/guide/${p.ch ?? p.from}`,
    book: {
      title: "The reading guide",
      href: "/@p64-fid/handbook/books/guide",
      chapters: chapters.map((c, i) => ({
        key: c.key,
        n: i + 1,
        title: c.title,
        lang: c.lang ?? "en",
        href: `/@p64-fid/handbook/books/guide/${c.key}`,
      })),
    },
    from: p.from,
    ch: p.ch ?? p.from,
    chPos: 0,
    chLen: null,
    chSoFar: false,
    // B1's `part.chapter`: the pending chapter's, once its unit has parts.
    making: pending?.part ? pending.chapter : null,
    entries: p.entries,
    spans: [],
    state,
    back: null,
    old: false,
    updating: false,
    soFar: !!pending,
    len: null,
    pos: 0,
    // B1's `part`: the pending chapter's part; `made`: summed over the Listen's chapters.
    part: pending?.part ?? null,
    parts: all.length * 9,
    partsMade: all.filter((e) => e.state === "made").length * 9,
    left: pending?.left ?? null,
    seen: null,
    loaded: 0,
    stoppedAt: null,
    speed: 1,
    follow: true,
    play: null,
    segs: [],
    seg: -1,
    ...p.more,
  };
}

/** A document Listen (`night-shift`): 4 parts of 3:35. */
function doc(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return {
    ...book(GUIDE, state, { from: "reading-aids", entries: [] }),
    unit: "p64-fid/handbook/2026-11-17-night-shift",
    key: { org: "p64-fid", project: "handbook", doc: "2026-11-17-night-shift" },
    kind: "doc",
    title: "The night shift, and what it hands over at seven",
    href: "/@p64-fid/handbook/2026-11-17-night-shift",
    book: null,
    from: null,
    ch: null,
    making: null,
    entries: [],
    soFar: false,
    len: 860,
    part: null,
    parts: 4,
    partsMade: 4,
    left: null,
    ...more,
  };
}

const note = (l: Listen) => noteView(l, noteKey(l.state, l.old));

describe("F1 — the note on the chapter being made reads its parts; a later chapter waiting reads the book's step", () => {
  it("the chapter being made, its first part preparing: Part 1 of 9 and Audio prepared (S11's every-block)", () => {
    const l = book(GUIDE, "making", {
      from: "every-block",
      entries: [making("every-block", 1, 9, 290)],
    });
    const v = note(l);
    expect(v.text).toBe("Part 1 of 9. You can play once this part is ready.");
    expect(v.line).toBe(0);
    expect(v.lineLabel).toBe("Audio prepared");
  });

  it("the chapter being made, a later part: Part 2 of 9 · under 5 min left. Audio prepared 11% (the board's Chapter 7 preparing)", () => {
    const l = book(HANDBOOK, "making", {
      from: "c7",
      entries: [
        making("c7", 2, 9, 290),
        ...HANDBOOK.slice(7).map((c) => none(c.key)),
      ],
    });
    const v = note(l);
    expect(v.word).toBe("Preparing…");
    expect(v.text).toBe("Part 2 of 9 · under 5 min left.");
    expect(v.line).toBe(11);
    expect(v.lineLabel).toBe("Audio prepared");
  });

  it("a later chapter that waits for the one being made: Chapter 7 of 14 · Chapters prepared 43% (the board's Chapter 8 waits for 7)", () => {
    const l = book(HANDBOOK, "making", {
      from: "c1",
      ch: "c8",
      entries: [
        ...HANDBOOK.slice(0, 6).map((c, i) => made(c.key, 430 + i * 60)),
        making("c7", 2, 9, 290),
        ...HANDBOOK.slice(7).map((c) => none(c.key)),
      ],
    });
    const v = note(l);
    expect(v.text).toBe("Chapter 7 of 14 · under 5 min left.");
    expect(v.line).toBe(43);
    expect(v.lineLabel).toBe("Chapters prepared");
  });

  it("the time left is the chapter being made's own, not the Listen's sum", () => {
    const l = book(HANDBOOK, "making", {
      from: "c1",
      ch: "c8",
      entries: [
        ...HANDBOOK.slice(0, 6).map((c) => made(c.key, 500)),
        making("c7", 2, 9, 290),
        making("c8", 1, 9, 2400),
        ...HANDBOOK.slice(8).map((c) => none(c.key)),
      ],
      more: { left: 2690 },
    });
    expect(note(l).text).toBe("Chapter 7 of 14 · under 5 min left.");
  });

  it("a document keeps its own parts (making-first, making-part, ready)", () => {
    expect(
      note(doc("making", { part: { n: 1, of: 4 }, partsMade: 0, len: null }))
        .text,
    ).toBe("Part 1 of 4. You can play once this part is ready.");
    const two = note(
      doc("making", {
        part: { n: 2, of: 9 },
        parts: 9,
        partsMade: 1,
        left: 290,
        len: null,
      }),
    );
    expect([two.text, two.line, two.lineLabel]).toEqual([
      "Part 2 of 9 · under 5 min left.",
      11,
      "Audio prepared",
    ]);
    const ready = note(doc("ready", { len: 215, partsMade: 1, soFar: true }));
    expect([ready.line, ready.lineLabel]).toEqual([25, "Audio prepared"]);
  });

  it("ready on the chapter being made: its parts made, Audio prepared", () => {
    const l = book(GUIDE, "ready", {
      from: "every-block",
      entries: [making("every-block", 3, 9, 900)],
      more: { len: 60 },
    });
    const v = note(l);
    expect([v.word, v.line, v.lineLabel]).toEqual([
      "Ready",
      22,
      "Audio prepared",
    ]);
  });

  it("the book page and the chapter read the one note (the key is the Listen's, not the page's)", () => {
    const l = book(GUIDE, "making", {
      from: "every-block",
      entries: [making("every-block", 2, 9, 290)],
    });
    expect(playerView(l).text).toBe("Part 2 of 9 · under 5 min left.");
    expect(dockView(l).rest).toBe("part 2 of 9");
  });
});

describe("F2 — every share counts one set: the Listen's own chapters", () => {
  it("next chapter waiting, a Listen from chapter 2 with chapter 2 made of its 2: Chapters prepared 50% (S11 read 33%)", () => {
    const l = book(GUIDE, "next-waiting", {
      from: "write-lock",
      entries: [made("write-lock", 245), making("every-block", 1, 9, 290)],
      more: { chPos: 244 },
    });
    const v = note(l);
    expect(v.text).toBe(
      "Chapter 3 is still preparing, under 5 min. It plays by itself when it’s ready.",
    );
    expect(v.line).toBe(50);
    expect(v.lineLabel).toBe("Chapters prepared");
    expect(dockView(l).rest).toBe("Chapter 3");
  });

  it("a Listen of the whole book reads the board's figure (6 of 14 made: 43%)", () => {
    const l = book(HANDBOOK, "next-waiting", {
      from: "c1",
      ch: "c6",
      entries: [
        ...HANDBOOK.slice(0, 6).map((c) => made(c.key, 500)),
        making("c7", 2, 9, 290),
        ...HANDBOOK.slice(7).map((c) => none(c.key)),
      ],
    });
    expect(note(l).line).toBe(43);
  });

  it("a language some chapters lack counts only the chapters it has (made and all)", () => {
    const l = book(GUIDE, "next-waiting", {
      from: "reading-aids",
      lang: "ko",
      entries: [
        made("reading-aids", 312),
        making("write-lock", 2, 6, 200),
        unavailable("every-block"),
      ],
    });
    expect(note(l).line).toBe(50);
    expect(note({ ...l, state: "finished" }).text).toBe(
      "You’ve listened to all 2 chapters.",
    );
  });

  it("the held next-chapter note counts the same set as the live one", () => {
    const l = book(GUIDE, "playing", {
      from: "write-lock",
      entries: [made("write-lock", 245), making("every-block", 1, 9, 290)],
    });
    expect(noteView(l, "next-waiting").line).toBe(50);
  });
});

describe("F5 — a Listen of one chapter finishes as a text with no chapters", () => {
  it("the primer's one chapter: You’ve listened to the end. The dock: Finished, no rest", () => {
    const l = book(
      [{ key: "only", title: "A short primer on reading slowly" }],
      "finished",
      {
        from: "only",
        entries: [made("only", 215)],
      },
    );
    expect(note(l).text).toBe("You’ve listened to the end.");
    expect(dockView(l).word).toBe("Finished");
    expect(dockView(l).rest).toBe("");
    expect(playerView(l).text).toBe("You’ve listened to the end.");
  });

  it("a Listen from a book's last chapter is one chapter too", () => {
    const l = book(GUIDE, "finished", {
      from: "every-block",
      entries: [made("every-block", 400)],
    });
    expect(note(l).text).toBe("You’ve listened to the end.");
    expect(dockView(l).rest).toBe("");
  });

  it("two chapters and more keep the record's plural", () => {
    const l = book(GUIDE, "finished", {
      from: "write-lock",
      entries: [made("write-lock", 245), made("every-block", 400)],
    });
    expect(note(l).text).toBe("You’ve listened to all 2 chapters.");
    expect(dockView(l).rest).toBe("all 2 chapters");
  });
});
