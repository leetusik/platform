import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaxesParser } from "saxes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { READER } from "@/content";
import { MARK_ROW, SAVE } from "@/content/library-frame";
import { READER_MARKS } from "@/content/reader-marks";
import { markWord } from "@/hi2vi/library/mark-row-model";
import {
  barKind,
  besideNote,
  boxTitle,
  countLine,
  floatAt,
  LIBRARY_PAINT,
  placeUp,
  pressFor,
  railFits,
  railTops,
  rowOf,
} from "@/hi2vi/reader/marks/model";
import {
  MarkBox,
  MarksBar,
  NotesBody,
  PlaceBar,
  SheetCount,
  SlotLine,
  BesideButton,
  type MarkBoxProps,
} from "@/hi2vi/reader/marks/parts";
import { undoClock, type Timers } from "@/hi2vi/reader/marks/undo";
import {
  bookmarkWire,
  cleanLabel,
  highlightWire,
  labelWire,
  noteWire,
  removeBookmarkWire,
  removeWire,
  reviewWire,
  sectionNoteWire,
  snapshotOf,
} from "@/hi2vi/reader/marks/wire";
import { NativeChapter } from "@/lib/native";
import {
  capture,
  cps,
  pointAt,
  segments,
  snap,
  units,
  verified,
  type ANode,
} from "@/lib/reader/anchor";
import type { ListItem } from "@/lib/reader/note-list";
import { undoText, UNDO_MS } from "@/lib/reader/notes";
import { OLD_PAINT, paint, unpaint } from "@/lib/reader/paint";

// P63-fk.S11 — highlights, notes and bookmarks in the Library's reader (job 03, Library round 02, `## Build` § Page:
// annotations). What must not move: every write's payload (a guard of the old layer's, by mutation), the place a
// stored highlight lands on (the same passage on both looks), the undo line's ten seconds; and what the signed look
// promises: Text changed, the note's count line, a visitor writes nothing, a selection snaps to words and stops at its
// section's end, and no part of it is styled by the old reader's sheets.

const web = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(web, path), "utf8");
const NATIVE = fileURLToPath(
  new URL("../../tests/fixtures/native/", import.meta.url),
);

// --- a small DOM, enough for the anchoring and the paint (React's static markup is well-formed XML) ------------

class FNode implements ANode {
  childNodes: FNode[] = [];
  parentNode: FNode | null = null;
  attrs: Record<string, string> = {};
  tabIndex = -1;
  constructor(
    public nodeType: number,
    public nodeName: string,
    public nodeValue: string | null = null,
  ) {}
  getAttribute(n: string) {
    return n in this.attrs ? this.attrs[n] : null;
  }
  setAttribute(n: string, v: string) {
    this.attrs[n] = v;
  }
  get className() {
    return this.attrs.class ?? "";
  }
  set className(v: string) {
    this.attrs.class = v;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get parentElement(): FNode | null {
    return this.parentNode;
  }
  closest(sel: string): FNode | null {
    // only a tag name is asked for (`a`)
    let n: FNode | null = this.nodeType === 1 ? this : this.parentNode;
    while (n && n.nodeType === 1) {
      if (n.nodeName.toLowerCase() === sel) return n;
      n = n.parentNode;
    }
    return null;
  }
  insertBefore(node: FNode, ref: FNode) {
    node.parentNode?.removeChild(node);
    const i = this.childNodes.indexOf(ref);
    this.childNodes.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
  appendChild(node: FNode) {
    node.parentNode?.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }
  removeChild(node: FNode) {
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
    return node;
  }
  splitText(at: number) {
    const v = this.nodeValue ?? "";
    const right = new FNode(3, "#text", v.slice(at));
    this.nodeValue = v.slice(0, at);
    const p = this.parentNode!;
    p.childNodes.splice(p.childNodes.indexOf(this) + 1, 0, right);
    right.parentNode = p;
    return right;
  }
}

function parse(markup: string): FNode {
  const root = new FNode(1, "ROOT");
  const stack: FNode[] = [root];
  const p = new SaxesParser({ xmlns: false });
  p.on("opentag", (tag) => {
    const el = new FNode(1, tag.name.toUpperCase());
    for (const [k, v] of Object.entries(tag.attributes))
      el.attrs[k] = String(v);
    stack[stack.length - 1].appendChild(el);
    stack.push(el);
  });
  p.on("closetag", () => void stack.pop());
  p.on(
    "text",
    (t) => void stack[stack.length - 1].appendChild(new FNode(3, "#text", t)),
  );
  p.write(`<root>${markup}</root>`).close();
  return root.childNodes[0];
}

const all = (n: FNode): FNode[] =>
  n.nodeType === 1 ? [n, ...n.childNodes.flatMap(all)] : [];
const textOf = (n: FNode): string =>
  n.nodeType === 3 ? (n.nodeValue ?? "") : n.childNodes.map(textOf).join("");
const classes = (n: FNode) => n.className.split(/\s+/).filter(Boolean);

/** A chapter's body, as the reader renders it: the old look, or the Library's (`look="library"`). */
function body(source: string, look: "old" | "library"): FNode {
  return parse(
    renderToStaticMarkup(
      createElement(NativeChapter, {
        source,
        format: "native",
        assetUrl: () => "/a.png",
        look,
        hooks: true,
      }),
    ),
  );
}

/** Python's projection: `=== <id>\n<text>\n` per section. */
function projection(txt: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const marks = [...txt.matchAll(/^=== (\S+)\n/gm)];
  marks.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to =
      i + 1 < marks.length ? (marks[i + 1].index ?? 0) - 1 : txt.length - 1;
    out.set(m[1], cps(txt.slice(from, to)));
  });
  return out;
}

const CASES = readdirSync(NATIVE)
  .filter(
    (n) =>
      n.endsWith(".md") &&
      !existsSync(`${NATIVE}${n.slice(0, -3)}.err`) &&
      existsSync(`${NATIVE}${n.slice(0, -3)}.txt`),
  )
  .map((n) => n.slice(0, -3))
  .sort();

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return (n: number) => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) % Math.max(1, n);
  };
}

// --- the claims ----------------------------------------------------------------------------------------------------

describe("every write keeps the payload the old layer sent (a guard: persisted marks keep their data and APIs)", () => {
  const write = { org: "june", project: "platform", doc: "2026-11-02-c6" };
  const quote = {
    exact: "it can be made private again",
    prefix: "public, and ",
    suffix: " at any time.",
    start: 40,
    end: 68,
  };
  const snap0 = snapshotOf(quote.exact, "Orgs", "Orgs and projects");

  it("a highlight: the anchor, its quote, the note or null, and what it was made on", () => {
    expect(
      highlightWire({
        write,
        id: "h1",
        version: 3,
        sec: "orgs",
        quote,
        note: "",
        snapshot: snap0,
      }),
    ).toEqual({
      op: "save",
      input: {
        org: "june",
        project: "platform",
        doc: "2026-11-02-c6",
        id: "h1",
        version: 3,
        block_id: "orgs",
        quote,
        note: null,
        snapshot: {
          text: "it can be made private again",
          block_title: "Orgs",
          chapter_title: "Orgs and projects",
        },
      },
    });
    expect(
      highlightWire({
        write,
        id: "h1",
        version: 3,
        sec: "orgs",
        quote,
        note: "Ask first.",
        snapshot: snap0,
      }).input,
    ).toMatchObject({ note: "Ask first." });
  });

  it("a note on a section, a note changed, Review this, a delete", () => {
    expect(
      sectionNoteWire({
        write,
        id: "n1",
        version: 3,
        sec: "orgs",
        note: "Deliberate.",
        snapshot: snapshotOf("Orgs", "Orgs", "Orgs and projects"),
      }),
    ).toEqual({
      op: "save",
      input: {
        ...write,
        id: "n1",
        version: 3,
        block_id: "orgs",
        note: "Deliberate.",
        snapshot: {
          text: "Orgs",
          block_title: "Orgs",
          chapter_title: "Orgs and projects",
        },
      },
    });
    expect(noteWire("h1", "x")).toEqual({
      op: "edit",
      input: { id: "h1", note: "x" },
    });
    expect(noteWire("h1", "")).toEqual({
      op: "edit",
      input: { id: "h1", note: null },
    });
    expect(reviewWire("h1", true)).toEqual({
      op: "edit",
      input: { id: "h1", review: true },
    });
    expect(removeWire("h1")).toEqual({ op: "remove", input: { id: "h1" } });
  });

  it("a bookmark (a section's or a position), its label, its removal", () => {
    expect(
      bookmarkWire({
        write,
        id: "b1",
        version: 3,
        anchor: { block_id: "orgs" },
        snippet: "Orgs",
      }),
    ).toEqual({
      op: "bm-save",
      input: {
        ...write,
        id: "b1",
        version: 3,
        anchor: { block_id: "orgs" },
        snippet: "Orgs",
      },
    });
    expect(
      bookmarkWire({
        write,
        id: "b2",
        version: 3,
        anchor: { fraction: 0.42 },
        snippet: "",
      }).input,
    ).toMatchObject({ anchor: { fraction: 0.42 } });
    expect(cleanLabel("  why ".padEnd(200, "x"))).toHaveLength(120);
    expect(labelWire("b1", cleanLabel("  why  "))).toEqual({
      op: "bm-edit",
      input: { id: "b1", label: "why" },
    });
    expect(labelWire("b1", cleanLabel("   "))).toEqual({
      op: "bm-edit",
      input: { id: "b1", label: null },
    });
    expect(removeBookmarkWire("b1")).toEqual({
      op: "bm-remove",
      input: { id: "b1" },
    });
  });

  it("what a write keeps of its text is cut at the server's caps, in code points", () => {
    const s = snapshotOf("😀".repeat(5100), "x".repeat(600), "y".repeat(501));
    expect(Array.from(s.text)).toHaveLength(5000);
    expect(s.block_title).toHaveLength(500);
    expect(s.chapter_title).toHaveLength(500);
  });

  it("the layer builds no payload of its own: both looks send through these builders", () => {
    const layer = read("src/components/reader/annotations.tsx");
    expect(layer).not.toMatch(
      /op:\s*"(save|edit|remove|bm-save|bm-edit|bm-remove)"/,
    );
    for (const f of [
      "highlightWire(",
      "sectionNoteWire(",
      "noteWire(",
      "reviewWire(",
      "bookmarkWire(",
      "labelWire(",
    ])
      expect(layer, f).toContain(f);
  });
});

describe("a stored highlight lands on the same passage of the Library's body as of the old one", () => {
  const doc = { createElement: (n: string) => new FNode(1, n.toUpperCase()) };
  beforeEach(() => vi.stubGlobal("document", doc));
  afterEach(() => vi.unstubAllGlobals());

  /** Paint stored ranges and read back, per highlight, the characters its marks hold, and the marks' classes. */
  function painted(
    root: FNode,
    py: Map<string, string[]>,
    ranges: { id: string; sec: string; s: number; e: number; note: boolean }[],
    look: "old" | "library",
  ) {
    const body = all(root).find((n) => "data-reader-body" in n.attrs)!;
    const done = paint(body as unknown as HTMLElement, py, {
      ranges,
      pending: null,
      active: ranges[0]?.id ?? null,
      desc: { one: "d1", note: "d2", many: "d3" },
      ...(look === "library" ? { classes: LIBRARY_PAINT } : {}),
    });
    const marks = all(body).filter((n) => n.nodeName === "MARK");
    const text = new Map<string, string>();
    for (const m of marks)
      for (const id of (m.attrs["data-an"] ?? "").split(" "))
        text.set(id, (text.get(id) ?? "") + textOf(m));
    const cls = new Set(marks.flatMap(classes));
    const keys = marks.map((m) => m.attrs["data-an-key"] ?? "").join("|");
    unpaint(done as never);
    return { text, cls, keys, after: textOf(body) };
  }

  let checkedExact = 0;
  for (const name of CASES) {
    it(`${name}: the same characters, the same stops, the signed classes; the text whole again after`, () => {
      const source = readFileSync(`${NATIVE}${name}.md`, "utf8");
      const py = projection(readFileSync(`${NATIVE}${name}.txt`, "utf8"));
      const next = rng(name.length * 31337 + 5);
      const ranges: {
        id: string;
        sec: string;
        s: number;
        e: number;
        note: boolean;
      }[] = [];
      for (const [sec, text] of py) {
        if (text.length < 4) continue;
        for (let n = 0; n < 6; n += 1) {
          let s = next(text.length);
          let e = next(text.length + 1);
          if (e < s) [s, e] = [e, s];
          const sn = snap(text, s, e);
          if (sn.e > sn.s)
            ranges.push({
              id: `${sec}-${n}`,
              sec,
              s: sn.s,
              e: sn.e,
              note: n === 1,
            });
        }
      }
      const oldRoot = body(source, "old");
      const libRoot = body(source, "library");
      const before = textOf(libRoot);
      const old = painted(oldRoot, py, ranges, "old");
      const lib = painted(libRoot, py, ranges, "library");
      expect([...lib.text]).toEqual([...old.text]);
      expect(lib.keys).toEqual(old.keys);
      for (const c of lib.cls)
        expect(Object.values(LIBRARY_PAINT), c).toContain(c);
      if (ranges.length) expect(lib.cls.has("an-m")).toBe(true);
      for (const c of old.cls) expect(Object.values(OLD_PAINT), c).toContain(c);
      // and each holds exactly its stored characters (but what the page never paints: a line join, a stand-in)
      const atoms = new Set(
        segments(libRoot)
          .filter((g) => units(g.el).some((u) => u.kind === "atom"))
          .map((g) => g.sec),
      );
      let exact = 0;
      for (const r of ranges) {
        if (atoms.has(r.sec)) continue;
        const want = py
          .get(r.sec)!
          .slice(r.s, r.e)
          .join("")
          .replace(/\s+/g, "");
        expect((lib.text.get(r.id) ?? "").replace(/\s+/g, ""), r.id).toBe(want);
        exact += 1;
      }
      checkedExact += exact;
      expect(textOf(libRoot)).toBe(before);
    });
  }
  it("checked enough highlights character for character", () =>
    expect(checkedExact).toBeGreaterThan(50));
});

describe("the selection on the Library's body: words snapped, cut at a section's end, a heading, refused", () => {
  const name = "prose";
  const py = projection(readFileSync(`${NATIVE}${name}.txt`, "utf8"));
  const root = body(readFileSync(`${NATIVE}${name}.md`, "utf8"), "library");
  const segs = verified(segments(root), py);

  it("finds the Library's stamped containers", () => {
    expect(segs.length).toBe(segments(root).length);
    expect(segs.length).toBeGreaterThan(2);
  });

  it("a passage pressed inside its words is snapped to whole words", () => {
    let checked = 0;
    for (const g of segs) {
      const text = py.get(g.sec)!;
      const len = units(g.el).reduce((n, u) => Math.max(n, u.at + u.len), 0);
      if (len < 12) continue;
      const a = pointAt(g, g.base + 2)!;
      const b = pointAt(g, g.base + len - 2)!;
      const got = capture(
        root,
        {
          startContainer: a.node,
          startOffset: a.offset,
          endContainer: b.node,
          endOffset: b.offset,
        },
        py,
      );
      const want = snap(text, g.base + 2, g.base + len - 2);
      expect(got && got.mode === "passage" ? [got.s, got.e] : got).toEqual([
        want.s,
        want.e,
      ]);
      // whole words, by the text itself: no word runs on past either end, and it holds what was pressed
      if (got && got.mode === "passage" && got.e > got.s) {
        const word = (i: number) =>
          i >= 0 && i < text.length && /^[\p{L}\p{N}_'’-]$/u.test(text[i]);
        expect(word(got.s - 1) && word(got.s), `${g.sec} start`).toBe(false);
        expect(word(got.e - 1) && word(got.e), `${g.sec} end`).toBe(false);
        // only spaces are dropped from what was pressed, and a word pressed inside is taken from its start
        expect(
          text
            .slice(g.base + 2, got.s)
            .join("")
            .trim(),
        ).toBe("");
        if (word(g.base + 1) && word(g.base + 2))
          expect(got.s).toBeLessThan(g.base + 2);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a passage that runs into the next section stops at the end of its own (Cut)", () => {
    const first = segs[0];
    const other = segs.find((g) => g.sec !== first.sec)!;
    const a = pointAt(first, first.base)!;
    const b = pointAt(other, other.base + 1)!;
    const got = capture(
      root,
      {
        startContainer: a.node,
        startOffset: a.offset,
        endContainer: b.node,
        endOffset: b.offset,
      },
      py,
    );
    const text = py.get(first.sec)!;
    const want = snap(text, first.base, text.length);
    expect(
      got && got.mode === "passage"
        ? [got.sec, got.s, got.e, got.clipped]
        : got,
    ).toEqual([first.sec, want.s, want.e, true]);
    expect(barKind(got as never)).toBe("cut");
  });

  it("a heading is a note on its section; text before the first section is refused", () => {
    const h = all(root).find(
      (n) => n.nodeName === "H2" && !!n.attrs["data-block"],
    )!;
    const t = h.childNodes[0];
    const got = capture(
      root,
      { startContainer: t, startOffset: 1, endContainer: t, endOffset: 3 },
      py,
    );
    expect(got).toEqual({ mode: "block", sec: h.attrs["data-block"] });
    expect(barKind(got as never)).toBe("block");
    expect(barKind({ mode: "refuse" })).toBe("refused");
    expect(barKind({ mode: "none" })).toBe("plain");
  });
});

describe("a deletion is an undo line for ten seconds, then sent; Undo within them sends nothing (F65, F91)", () => {
  function fake(): Timers & { advance: (ms: number) => void } {
    let now = 0;
    let seq = 0;
    const due = new Map<number, { at: number; fn: () => void }>();
    return {
      set: (fn, ms) => {
        seq += 1;
        due.set(seq, { at: now + ms, fn });
        return seq;
      },
      clear: (h) => void due.delete(h as number),
      advance(ms) {
        now += ms;
        for (const [k, t] of [...due].sort((a, b) => a[1].at - b[1].at))
          if (t.at <= now) {
            due.delete(k);
            t.fn();
          }
      },
    };
  }

  it("is sent when the ten seconds run out, not before, and once", () => {
    const t = fake();
    const clock = undoClock(UNDO_MS, t);
    const sent: string[] = [];
    clock.start("h1", () => sent.push("h1"), true);
    t.advance(9_999);
    expect(sent).toEqual([]);
    t.advance(1);
    expect(sent).toEqual(["h1"]);
    clock.fire("h1");
    clock.flush();
    t.advance(20_000);
    expect(sent).toEqual(["h1"]);
    expect(UNDO_MS).toBe(10_000);
  });

  it("Undo within the ten seconds sends nothing, ever", () => {
    const t = fake();
    const clock = undoClock(UNDO_MS, t);
    const sent: string[] = [];
    clock.start("h1", () => sent.push("h1"), true);
    t.advance(9_000);
    expect(clock.undo("h1")).toBe(true);
    t.advance(60_000);
    clock.flush();
    expect(sent).toEqual([]);
    // too late once sent
    clock.start("h2", () => sent.push("h2"), true);
    t.advance(10_000);
    expect(clock.undo("h2")).toBe(false);
  });

  it("leaving the page sends what waits; the undo line's next delete sends the one before; rows wait side by side", () => {
    const t = fake();
    const clock = undoClock(UNDO_MS, t);
    const sent: string[] = [];
    clock.start("row:a", () => sent.push("a"));
    clock.start("row:b", () => sent.push("b"));
    t.advance(5_000);
    expect(sent).toEqual([]);
    clock.start("h1", () => sent.push("h1"), true);
    expect(sent).toEqual(["a", "b"]);
    clock.start("h2", () => sent.push("h2"), true);
    expect(sent).toEqual(["a", "b", "h1"]);
    clock.flush();
    expect(sent).toEqual(["a", "b", "h1", "h2"]);
  });

  it("the undo line says what went, in the frame's words (F65)", () => {
    expect(undoText({ note: "", card: false })).toBe(
      MARK_ROW.undoLine.highlight,
    );
    expect(undoText({ note: "x", card: false })).toBe(
      MARK_ROW.undoLine.highlightNote,
    );
    expect(undoText({ note: "", card: true })).toBe(
      MARK_ROW.undoLine.highlightReview,
    );
    expect(undoText({ note: "x", card: true })).toBe(
      MARK_ROW.undoLine.highlightNoteReview,
    );
    expect(READER.notes.undo.noteOnly).toBe(MARK_ROW.undoLine.note);
    expect(READER.notes.bm.removed).toBe(MARK_ROW.undoLine.bookmark);
  });
});

describe("a changed passage reads Text changed", () => {
  const changed: ListItem = {
    id: "h9",
    kind: "hl",
    status: "block",
    lang: "en",
    version: 1,
    sec: "orgs",
    secTitle: "Orgs",
    quote: "there are no roles",
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
    chapterTitle: "Orgs and projects",
    chapterKey: null,
    order: 0,
  };
  it("in its box, beside the text and in the Notes sheet's row", () => {
    expect(boxTitle("changed")).toBe("Text changed");
    expect(besideNote("changed", { words: "1 highlight", n: 1 })).toEqual({
      kind: "Text changed",
      text: "1 highlight no longer matches the text",
      lang: "en",
    });
    expect(besideNote("changed", { words: "2 highlights", n: 2 }).text).toBe(
      "2 highlights no longer match the text",
    );
    const row = rowOf(changed, "en");
    expect(row.mark.state).toBe("changed");
    expect(markWord(row.mark)).toBe("Text changed");
    expect(READER_MARKS.box.changedLead(false, "English v1")).toBe(
      "You made this on English v1. This version no longer says it, so it is not painted here.",
    );
  });
});

const boxProps = (over: Partial<MarkBoxProps> = {}): MarkBoxProps => ({
  kind: "highlight",
  title: "Highlight",
  aria: "Highlight",
  where: "Orgs",
  whereLang: "en",
  editing: true,
  draft: "",
  send: "rest",
  fieldId: "f",
  hintId: "h",
  boxRef: createRef(),
  fieldRef: createRef(),
  labelRef: createRef(),
  onClose: () => {},
  onEdit: () => {},
  onCancel: () => {},
  onDraft: () => {},
  onSave: () => {},
  onDeleteNote: () => {},
  onDelete: () => {},
  onReview: () => {},
  onSaveLabel: () => {},
  onDeleteItem: () => {},
  onPick: () => {},
  onKeyDown: () => {},
  ...over,
});
const box = (over: Partial<MarkBoxProps> = {}) =>
  parse(renderToStaticMarkup(createElement(MarkBox, boxProps(over))));

describe("the note's count line never moves the buttons", () => {
  /** The field's part of the box, as a sequence of what it holds, without the count's own words. */
  const shape = (root: FNode) =>
    all(root).map((n) =>
      [n.nodeName, classes(n).join("."), n.attrs.role ?? ""].join(":"),
    );

  it("is always there, holding its longest sentence, empty under 1,800 characters", () => {
    for (const n of [0, 1799, 1850, 2000]) {
      const root = box({ draft: "x".repeat(n) });
      const count = all(root).find((e) =>
        classes(e).includes("marks-box-count"),
      );
      expect(count, String(n)).toBeDefined();
      expect(count!.attrs.hidden, String(n)).toBeUndefined();
      const [size, live] = count!.childNodes;
      expect(classes(size)).toEqual(["marks-box-count-size"]);
      expect(textOf(size)).toBe("2,000 / 2,000, the most a note holds");
      expect(live.attrs["aria-live"]).toBe("polite");
      expect(textOf(live)).toBe(countLine(n).text);
    }
    expect(countLine(1799).text).toBe("");
    expect(countLine(1850).text).toBe("1,850 / 2,000");
    expect(countLine(2000)).toEqual({
      text: "2,000 / 2,000, the most a note holds",
      full: true,
    });
    // the same parts, in the same order, at every length: only the count's words change
    expect(shape(box({ draft: "x".repeat(1850) }))).toEqual(
      shape(box({ draft: "" })),
    );
  });

  it("the sheet stacks the count over its longest sentence, which holds the line's height", () => {
    const css = read("src/hi2vi/styles/library/annotations.css");
    expect(css).toMatch(/\.marks-box-count \{\s*display: grid;/);
    expect(css).toMatch(/\.marks-box-count > \* \{\s*grid-area: 1 \/ 1;/);
    expect(css).toMatch(/\.marks-box-count-size \{\s*visibility: hidden;/);
    expect(css).not.toMatch(/\.marks-box-count[^{]*\{[^}]*display:\s*none/);
  });

  it("Saving… takes Save note's width, and not saved keeps the words and says so above the hint", () => {
    const saving = box({ draft: "Ask first.", send: "saving" });
    const save = all(saving).find((n) => n.attrs.type === "submit")!;
    expect(save.attrs["data-busy"]).toBe("true");
    expect(textOf(save)).toBe("Save noteSaving…");
    const failed = box({ draft: "Ask first.", send: "failed" });
    const field = all(failed).find((n) => n.nodeName === "TEXTAREA")!;
    expect(field.attrs["aria-invalid"]).toBe("true");
    expect(textOf(field)).toBe("Ask first.");
    const parts = field.parentNode!.childNodes.map((n) => classes(n).join("."));
    expect(parts).toEqual([
      "label",
      "input.marks-box-field",
      "field-error",
      "hint",
      "hint.marks-box-count",
    ]);
  });
});

describe("a visitor's Highlight offers Sign in to save and writes nothing", () => {
  it("the press: Sign in to save for a visitor, the write for a member", () => {
    expect(pressFor(false, "highlight")).toEqual({ save: "highlights" });
    expect(pressFor(false, "note")).toEqual({ save: "highlights" });
    expect(pressFor(false, "bookmark")).toEqual({ save: "bookmarks" });
    expect(pressFor(true, "highlight")).toEqual({ write: true });
  });

  it("the layer asks before it writes: Highlight and Add note return at a visitor before any write", () => {
    const layer = read("src/components/reader/annotations.tsx");
    const highlight = layer.slice(
      layer.indexOf("const highlight = useCallback("),
      layer.indexOf("const noteSel = useCallback("),
    );
    const asks = highlight.indexOf('pressFor(now.current.member, "highlight")');
    expect(asks).toBeGreaterThan(0);
    expect(highlight.indexOf("return;", asks)).toBeLessThan(
      highlight.indexOf("createHighlight(s"),
    );
  });

  it("the Notes sheet holds Sign in to save, and no mark", () => {
    const html = renderToStaticMarkup(
      createElement(NotesBody, {
        visitor: true,
        text: "chapter",
        here: [],
        other: [],
        lost: [],
        waiting: new Set<string>(),
        allHref: "/x",
        signInHref: "/login",
        onOpen: () => {},
        onLabel: () => {},
        onDelete: () => {},
        onUndo: () => {},
        onGone: async () => {},
        onNotNow: () => {},
        onAll: () => {},
      }),
    );
    expect(html).toContain(SAVE.sentence.highlights);
    expect(html).not.toContain("mark-list");
    expect(html).not.toContain(READER_MARKS.sheet.all);
  });
});

describe("a place is named with its own name and language (D156-gc a, b)", () => {
  const item = (over: Partial<ListItem>): ListItem => ({
    id: "b1",
    kind: "bm",
    status: "anchored",
    lang: "en",
    version: 1,
    sec: "orgs",
    secTitle: "Orgs",
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
    chapterTitle: "c",
    chapterKey: null,
    order: 0,
    ...over,
  });
  it("a Korean bookmark's place on an English text is the English section, in English", () => {
    const r = rowOf(item({ lang: "ko", status: "other" }), "en");
    expect([r.place, r.placeLang]).toEqual(["Orgs", "en"]);
  });
  it("a section that names its own language (the Glossary) keeps it, whatever the mark's", () => {
    const r = rowOf(item({ secTitle: "용어집", secLang: "ko" }), "en");
    expect([r.place, r.placeLang]).toEqual(["용어집", "ko"]);
    const k = rowOf(item({ secTitle: "조직" }), "ko");
    expect(k.placeLang).toBe("ko");
  });
  it("a position, and an unanchored mark, say where in the frame's words", () => {
    expect(rowOf(item({ pos: true, frac: 0.4 }), "en").place).toBe(
      "About 40% through",
    );
    expect(
      rowOf(item({ kind: "hl", status: "orphan", secTitle: "Roles" }), "en")
        .place,
    ).toBe("Was in “Roles”");
  });
});

describe("where the parts sit (`Annotations.dc.html`)", () => {
  it("a floating part: 8 px under the last line, from where it starts, never out of the column", () => {
    expect(
      floatAt({
        lineLeft: 120,
        lineBottom: 300,
        colLeft: 0,
        colWidth: 600,
        width: 200,
      }),
    ).toEqual({ left: 120, top: 308 });
    expect(
      floatAt({
        lineLeft: 500,
        lineBottom: 0,
        colLeft: 0,
        colWidth: 600,
        width: 416,
      }).left,
    ).toBe(184);
    expect(
      floatAt({
        lineLeft: 10,
        lineBottom: 0,
        colLeft: 0,
        colWidth: 300,
        width: 416,
      }).left,
    ).toBe(0);
  });
  it("the margin from 64em of the app with 10em beside the column, each group 8 px clear of the one above", () => {
    expect(
      railFits({ appWidth: 1440, em: 16, mainWidth: 1440, colWidth: 680 }),
    ).toEqual({
      rail: true,
      width: 220,
    });
    expect(
      railFits({ appWidth: 1000, em: 16, mainWidth: 1000, colWidth: 680 }).rail,
    ).toBe(false);
    expect(
      railFits({ appWidth: 1100, em: 16, mainWidth: 1100, colWidth: 680 }).rail,
    ).toBe(true);
    expect(
      railTops([
        { line: 0, height: 60 },
        { line: 20, height: 40 },
        { line: 200, height: 10 },
      ]),
    ).toEqual([0, 68, 200]);
  });
  it("the place bar yields to everything else in the slot, and leaves with the bars", () => {
    const base = {
      barsHidden: false,
      sheet: false,
      pill: false,
      selection: false,
      box: false,
      line: false,
      save: false,
      end: false,
      plain: false,
      section: "orgs",
    };
    expect(placeUp(base)).toBe(true);
    for (const k of [
      "barsHidden",
      "sheet",
      "pill",
      "selection",
      "box",
      "line",
      "save",
      "end",
    ] as const)
      expect(placeUp({ ...base, [k]: true }), k).toBe(false);
    expect(placeUp({ ...base, section: null })).toBe(false);
    expect(placeUp({ ...base, section: null, plain: true })).toBe(true);
  });
});

describe("the marks are the Library's own: no old sheet styles them (P63-fk.S11)", () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  function selectorsOf(css: string): string[] {
    const out: string[] = [];
    const walk = (text: string) => {
      let depth = 0;
      let start = 0;
      let open = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "{") {
          if (depth === 0) open = i;
          depth++;
        } else if (text[i] === "}") {
          depth--;
          if (depth === 0) {
            const prelude = text.slice(start, open).trim();
            if (prelude.startsWith("@")) walk(text.slice(open + 1, i));
            else
              out.push(...prelude.split(/,(?![^(]*\))/).map((s) => s.trim()));
            start = i + 1;
          }
        } else if (text[i] === ";" && depth === 0) start = i + 1;
      }
    };
    walk(strip(css));
    return out;
  }
  const names = (sel: string) =>
    [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  // every old sheet the reader's page can load (reader.css, reader-aids.css, kb-docview.css as reader-body.test.ts
  // reads them; kb-print.css and review.css also name a mark)
  const OLD = [
    "src/app/reader.css",
    "src/app/reader-aids.css",
    "src/app/kb-docview.css",
    "src/app/kb-print.css",
    "src/app/review.css",
  ].flatMap((f) => selectorsOf(read(f)));
  /** Signed names an old sheet also names, and why no old rule reaches them: each such rule names a class too. */
  const SHARED = new Set(["an-m", "an-pending"]);

  const noop = () => {};
  const parts = [
    ...(["passage", "cut", "block", "refused", "plain"] as const).map((kind) =>
      createElement(MarksBar, {
        kind,
        section: "Orgs",
        bookmarked: kind === "block",
      }),
    ),
    ...(
      [
        "highlight",
        "new",
        "section",
        "bookmark",
        "changed",
        "other",
        "choose",
      ] as const
    ).flatMap((kind) =>
      [false, true].map((editing) =>
        createElement(
          MarkBox,
          boxProps({
            kind,
            editing,
            note: "Ask first.",
            label: kind === "bookmark" ? "why" : undefined,
            card: true,
            reviewLine: "x",
            goes: "y",
            delWord: "Delete",
            lists: [
              {
                key: "1",
                lead: "l",
                items: [
                  {
                    id: "a",
                    quote: "q",
                    lang: "en",
                    note: "n",
                    noteLang: "en",
                  },
                ],
                read: { href: "/r", name: "v1", lang: "en" },
              },
            ],
            picks: [
              {
                id: "a",
                quote: "q",
                lang: "en",
                paint: "an-m has-note",
                word: "w",
              },
            ],
          }),
        ),
      ),
    ),
    createElement(PlaceBar, {
      kind: "section",
      label: "Orgs",
      lang: "en",
      bookmarked: true,
      onNote: noop,
      onBookmark: noop,
    }),
    createElement(PlaceBar, {
      kind: "position",
      label: "",
      lang: "en",
      bookmarked: false,
      onNote: noop,
      onBookmark: noop,
    }),
    createElement(SlotLine, {
      text: "Highlight deleted.",
      action: { label: "Undo", onClick: noop },
    }),
    createElement(SheetCount, { count: "9 items" }),
    createElement(BesideButton, {
      note: besideNote("other", {
        words: "1 highlight",
        endonym: { name: "한국어", lang: "ko" },
      }),
      current: true,
      onOpen: noop,
    }),
    createElement(NotesBody, {
      visitor: false,
      text: "chapter",
      here: [
        rowOf(
          {
            ...({} as ListItem),
            id: "x",
            kind: "hl",
            status: "anchored",
            lang: "en",
            version: 1,
            sec: "s",
            secTitle: "S",
            quote: "q",
            note: "n",
            label: "",
            snippet: "",
            card: "active",
            review: true,
            approx: false,
            pos: false,
            frac: 0,
            code: false,
            snapshot: null,
            chapterTitle: "c",
            chapterKey: null,
            order: 0,
          },
          "en",
        ),
      ],
      other: [],
      lost: [],
      waiting: new Set<string>(),
      allHref: "/all",
      signInHref: "/login",
      onOpen: noop,
      onLabel: noop,
      onDelete: noop,
      onUndo: noop,
      onGone: async () => {},
      onNotNow: noop,
      onAll: noop,
    }),
  ];
  const carried = new Set(
    parts.flatMap((p) => all(parse(renderToStaticMarkup(p))).flatMap(classes)),
  );

  it("carry no class an old sheet styles, and no old rule can match them", () => {
    expect(carried.has("marks-box")).toBe(true);
    const old = new Set(OLD.flatMap(names));
    expect([...carried].filter((c) => old.has(c) && !SHARED.has(c))).toEqual(
      [],
    );
    const reaching = OLD.filter((s) => {
      const n = names(s);
      return n.length > 0 && n.every((c) => carried.has(c));
    });
    expect(reaching).toEqual([]);
  });

  it("the paint's two shared names are reached by no old rule outside the old root", () => {
    for (const s of OLD.filter((x) => names(x).some((c) => SHARED.has(c))))
      expect(
        names(s).some((c) => !SHARED.has(c) && !carried.has(c)),
        s,
      ).toBe(true);
  });

  it("the signed paint's states are the sheet's, and the bridge in blocks.css is gone", () => {
    const css = read("src/hi2vi/styles/library/annotations.css");
    for (const sel of [
      ".an-m.is-2",
      ".an-m.has-note",
      ".an-m.is-open",
      ".an-pending",
    ])
      expect(css, sel).toContain(sel);
    expect(LIBRARY_PAINT).toEqual({
      mark: "an-m",
      two: "is-2",
      note: "has-note",
      open: "is-open",
      pending: "an-pending",
    });
    expect(OLD_PAINT).toEqual({
      mark: "an-m",
      two: "an-m--2",
      note: "an-m--note",
      open: "is-active",
      pending: "an-pending",
    });
    expect(strip(read("src/hi2vi/styles/library/blocks.css"))).not.toMatch(
      /an-m|an-pending/,
    );
  });

  it("the Library's layer sits in no old root", () => {
    const b = read("src/hi2vi/reader/body/body.tsx");
    expect(b).toMatch(/<AnnotationLayer[\s\S]*?look="library"/);
    const i = b.indexOf("<AnnotationLayer");
    const before = b.slice(0, i);
    expect(before.lastIndexOf("<OldRoot")).toBeLessThan(
      before.lastIndexOf("</OldRoot>"),
    );
  });
});
