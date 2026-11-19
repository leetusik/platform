import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaxesParser } from "saxes";
import { describe, expect, it } from "vitest";

import { READER_BLOCKS } from "@/content/reader-blocks";
import { MissingMedia } from "@/hi2vi/reader/body";
import { LIBRARY_PAINT } from "@/hi2vi/reader/marks/model";
import { NativeChapter, type NativeChapterProps } from "@/lib/native";
import {
  BODY_HOOKS,
  figureColumns,
  rowOf,
  scrollState,
} from "@/lib/native/look";
import { segments, units, verified, type ANode } from "@/lib/reader/anchor";
import { cps } from "@/lib/reader/anchor";

// P63-fk.S9 — the body of a text in the Library's look (job 03, Library round 02: frame.md F60, `## Build` § Page:
// blocks) beside the old one, and what must not move between them: the anchoring every persisted highlight and note
// lands by, the markup every other caller of the renderer gets, and the old sheets kept off the new text.

const web = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(web, path), "utf8");
const NATIVE = fileURLToPath(
  new URL("../../tests/fixtures/native/", import.meta.url),
);
const ANCHORS = fileURLToPath(
  new URL("../../tests/fixtures/anchors/", import.meta.url),
);

/** Every accepted fixture the native and anchor tests read: `[name, source]`. */
const FIXTURES: [string, string][] = [
  ...readdirSync(NATIVE)
    .filter(
      (n) => n.endsWith(".md") && !existsSync(`${NATIVE}${n.slice(0, -3)}.err`),
    )
    .map((n): [string, string] => [
      `native/${n}`,
      readFileSync(NATIVE + n, "utf8"),
    ]),
  ...readdirSync(ANCHORS)
    .filter((n) => n.endsWith(".md"))
    .map((n): [string, string] => [
      `anchors/${n}`,
      readFileSync(ANCHORS + n, "utf8"),
    ]),
];

function html(props: Partial<NativeChapterProps> & { source: string }): string {
  return renderToStaticMarkup(
    createElement(NativeChapter, {
      format: "native",
      assetUrl: () => "/a.png",
      ...props,
    }),
  );
}

// --- a small DOM from the renderer's markup (React's static markup is well-formed XML) --------------------------

interface El extends ANode {
  childNodes: El[];
  parentNode: El | null;
  attrs: Record<string, string>;
}

function mk(
  type: number,
  name: string,
  parent: El | null,
  attrs: Record<string, string>,
  value: string | null = null,
): El {
  return {
    nodeType: type,
    nodeName: name,
    nodeValue: value,
    parentNode: parent,
    childNodes: [],
    attrs,
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
  };
}

function parse(markup: string): El {
  const root = mk(1, "ROOT", null, {});
  const stack: El[] = [root];
  const p = new SaxesParser({ xmlns: false });
  p.on("opentag", (tag) => {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(tag.attributes)) attrs[k] = String(v);
    const el = mk(1, tag.name.toUpperCase(), stack[stack.length - 1], attrs);
    stack[stack.length - 1].childNodes.push(el);
    stack.push(el);
  });
  p.on("closetag", () => void stack.pop());
  p.on("text", (t) => {
    const parent = stack[stack.length - 1];
    parent.childNodes.push(mk(3, "#text", parent, {}, t));
  });
  p.write(`<root>${markup}</root>`).close();
  return root.childNodes[0];
}

/** Every element under `root`, in document order; `skip` prunes a subtree. */
function elements(root: El, skip: (e: El) => boolean = () => false): El[] {
  const out: El[] = [];
  const walk = (n: El) => {
    if (n.nodeType !== 1 || skip(n)) return;
    out.push(n);
    n.childNodes.forEach(walk);
  };
  walk(root);
  return out;
}

const classes = (e: El) => (e.attrs.class ?? "").split(/\s+/).filter(Boolean);
const textOf = (e: El): string =>
  e.nodeType === 3 ? (e.nodeValue ?? "") : e.childNodes.map(textOf).join("");
const inIsland = (e: El) => "data-island" in e.attrs;

/** What anchoring reads of a body: each stamped container, its place, and the text it counts, piece by piece. */
function stream(root: El) {
  return segments(root).map((g) => ({
    sec: g.sec,
    base: g.base,
    kind: g.kind,
    units: units(g.el).map((u) => [
      u.kind,
      u.at,
      u.len,
      u.kind === "text" ? u.node.nodeValue : null,
    ]),
  }));
}

/** The passage-like containers anchoring skips into (the `data-an-passage` hook), by their text. */
const passages = (root: El) =>
  elements(root)
    .filter((e) => "data-an-passage" in e.attrs)
    .map((e) => textOf(e));

// --- the sheets ---------------------------------------------------------------------------------------------------

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every style rule's selectors with its declarations, at any depth (`@media`, `@scope` descended into). */
function rules(css: string): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
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
          const body = text.slice(open + 1, i);
          if (prelude.startsWith("@")) walk(body);
          else
            out.push({
              selectors: prelude.split(/,(?![^(]*\))/).map((s) => s.trim()),
              body,
            });
          start = i + 1;
        }
      } else if (text[i] === ";" && depth === 0) start = i + 1;
    }
  };
  walk(strip(css));
  return out;
}

const classNames = (sel: string) =>
  [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const OLD_SHEETS = [
  "src/app/reader.css",
  "src/app/reader-aids.css",
  "src/app/kb-docview.css",
];
const oldSelectors = OLD_SHEETS.flatMap((f) =>
  rules(read(f)).flatMap((r) => r.selectors),
);

// --- the claims ---------------------------------------------------------------------------------------------------

describe("a sideways box (frame.md F60's fit recipe)", () => {
  it("is a Tab stop, and says so, only while its content is wider than it", () => {
    expect(scrollState({ scrollWidth: 900, clientWidth: 600 })).toEqual({
      scrolls: true,
      tabIndex: 0,
    });
    expect(scrollState({ scrollWidth: 600, clientWidth: 600 })).toEqual({
      scrolls: false,
      tabIndex: -1,
    });
    // a pixel of rounding is not a scroll
    expect(scrollState({ scrollWidth: 601, clientWidth: 600 })).toEqual({
      scrolls: false,
      tabIndex: -1,
    });
  });

  it("depends on the widths of now only: loaded wide, narrowed and widened, it is back in its first state (D154-by)", () => {
    const wide = { scrollWidth: 640, clientWidth: 680 };
    const narrow = { scrollWidth: 640, clientWidth: 350 };
    const first = scrollState(wide);
    const seq = [wide, narrow, wide, narrow, narrow, wide].map(scrollState);
    expect(first).toEqual({ scrolls: false, tabIndex: -1 });
    expect(seq[1]).toEqual({ scrolls: true, tabIndex: 0 });
    expect(seq.at(-1)).toEqual(first);
    // and no rule keyed on the state changes the box or its content: only the sentence after it shows
    const keyed = [
      "src/hi2vi/styles/library/frame.css",
      "src/hi2vi/styles/library/blocks.css",
    ].flatMap((f) =>
      rules(read(f)).flatMap((r) =>
        r.selectors.filter((s) => s.includes("data-scrolls")),
      ),
    );
    expect(keyed.length).toBeGreaterThan(0);
    for (const s of keyed) expect(s, s).toMatch(/\+\s*\.scroll-hint$/);
  });

  it("is followed by its sentence, hidden but while it scrolls", () => {
    const frame = rules(read("src/hi2vi/styles/library/frame.css"));
    const hint = frame.find((r) => r.selectors.includes(".scroll-hint"));
    expect(hint?.body).toMatch(/display:\s*none/);
    const shown = frame.find((r) =>
      r.selectors.includes('.scroll-box[data-scrolls="true"] + .scroll-hint'),
    );
    expect(shown?.body).toMatch(/display:\s*block/);
    for (const [name, source] of FIXTURES) {
      const root = parse(html({ source, look: "library", hooks: true }));
      for (const box of elements(root).filter((e) =>
        classes(e).includes("scroll-box"),
      )) {
        const sibs = box.parentNode!.childNodes.filter((n) => n.nodeType === 1);
        const next = sibs[sibs.indexOf(box) + 1];
        expect(next && classes(next), name).toEqual(["scroll-hint"]);
        expect(textOf(next)).toBe(READER_BLOCKS.scrollHint);
        // before the measure (the server's markup) it is no Tab stop
        expect("tabindex" in box.attrs, name).toBe(false);
        expect(box.attrs.role).toBe("region");
      }
    }
  });
});

describe("an external link's label wraps with its words (D258-t8)", () => {
  const source =
    "---\nformat: native\nsyntax: 1\n---\n## Links {#links}\n\nRead [the whole report on the subject](https://example.com/report) today.\n";
  const nowrapClasses = (files: string[]) =>
    new Set(
      files.flatMap((f) =>
        rules(read(f))
          .filter((r) => /white-space:\s*nowrap/.test(r.body))
          .flatMap((r) => r.selectors.flatMap(classNames)),
      ),
    );
  const label = (look: "old" | "library") => {
    const root = parse(html({ source, look, hooks: true }));
    const a = elements(root).find((e) => e.attrs["data-link"] === "external")!;
    const span = a.childNodes.find(
      (n) => n.nodeType === 1 && "data-an-skip" in n.attrs,
    )!;
    return { a, span };
  };

  it("the old label is held on one line by the old sheet (the cause)", () => {
    const { span } = label("old");
    const held = nowrapClasses(["src/app/reader.css"]);
    expect(classes(span).some((c) => held.has(c))).toBe(true);
  });

  it("the Library's link and its label carry no class a no-wrap rule names", () => {
    const { a, span } = label("library");
    const held = nowrapClasses([
      "src/hi2vi/styles/tokens.css",
      "src/hi2vi/styles/bundle.css",
      "src/hi2vi/styles/library/frame.css",
      "src/hi2vi/styles/library/blocks.css",
      ...OLD_SHEETS,
    ]);
    expect(classes(a)).toEqual(["link"]);
    expect(classes(span)).toEqual([]);
    for (const c of [...classes(a), ...classes(span)])
      expect(held.has(c), c).toBe(false);
  });
});

describe("a missing figure keeps its ratio and its words", () => {
  const source =
    "---\nformat: native\nsyntax: 1\n---\n## Fig {#fig}\n\n```figure #fig-a\nsrc: gone.png\nalt: The search page with three results.\ncaption: Three results for one query.\ncredit: platform staging\n```\n";

  it("an image the version does not hold: the place, its ratio, Image not available and the description; caption and credit stay", () => {
    const root = parse(
      html({ source, look: "library", hooks: true, assetUrl: () => null }),
    );
    const fig = elements(root).find((e) => e.attrs.id === "fig-a")!;
    const miss = elements(fig).find((e) =>
      classes(e).includes("blocks-fig-miss"),
    )!;
    expect(classes(miss)).toEqual(["blocks-fig-media", "blocks-fig-miss"]);
    expect(miss.attrs.style).toMatch(/--fig-w:\s*\d+/);
    expect(miss.attrs.style).toMatch(/--fig-h:\s*\d+/);
    expect(textOf(miss)).toBe(
      `${READER_BLOCKS.figure.missing}The search page with three results.`,
    );
    expect("data-an-skip" in miss.attrs).toBe(true);
    expect(textOf(fig)).toContain("Three results for one query.");
    expect(textOf(fig)).toContain(
      `${READER_BLOCKS.figure.credit}platform staging`,
    );
  });

  it("an image that fails to load keeps the asset map's ratio", () => {
    const el = parse(
      renderToStaticMarkup(
        createElement(MissingMedia, { w: 1440, h: 900 }, "alt"),
      ),
    );
    const m = elements(el).find((e) => classes(e).includes("blocks-fig-miss"))!;
    expect(m.attrs.style).toMatch(/--fig-w:\s*1440/);
    expect(m.attrs.style).toMatch(/--fig-h:\s*900/);
  });

  it("the sheet keeps the ratio and lets the words grow the place", () => {
    const blocks = rules(read("src/hi2vi/styles/library/blocks.css"));
    const media = blocks.find((r) => r.selectors.includes(".blocks-fig-media"));
    expect(media?.body).toMatch(
      /aspect-ratio:\s*var\(--fig-w\)\s*\/\s*var\(--fig-h\)/,
    );
    const miss = blocks.find((r) => r.selectors.includes(".blocks-fig-miss"));
    expect(miss?.body).toMatch(/min-height:\s*auto/);
    expect(miss?.body).not.toMatch(/(^|[;\s])height:/);
  });
});

describe("the anchoring is the same on both looks (core: persisted highlights and notes)", () => {
  it("finds the fixtures", () =>
    expect(FIXTURES.length).toBeGreaterThanOrEqual(15));

  for (const [name, source] of FIXTURES) {
    for (const format of ["native", "md"] as const) {
      it(`${name} (${format}): the same stamped containers, offsets and counted text, and the same passages`, () => {
        const old = parse(html({ source, format, hooks: true }));
        const lib = parse(
          html({ source, format, look: "library", hooks: true }),
        );
        expect(stream(lib)).toEqual(stream(old));
        expect(passages(lib)).toEqual(passages(old));
      });
    }
  }

  it("the Library's containers show exactly the shared projection's text (Python's), as the old ones do", () => {
    let checked = 0;
    for (const n of readdirSync(NATIVE).filter((f) => f.endsWith(".txt"))) {
      const md = `${NATIVE}${n.slice(0, -4)}.md`;
      if (!existsSync(md) || existsSync(`${NATIVE}${n.slice(0, -4)}.err`))
        continue;
      const txt = readFileSync(NATIVE + n, "utf8");
      const py = new Map<string, string[]>();
      const marks = [...txt.matchAll(/^=== (\S+)\n/gm)];
      marks.forEach((m, i) => {
        const from = (m.index ?? 0) + m[0].length;
        const to =
          i + 1 < marks.length ? (marks[i + 1].index ?? 0) - 1 : txt.length - 1;
        py.set(m[1], cps(txt.slice(from, to)));
      });
      const segs = segments(
        parse(
          html({
            source: readFileSync(md, "utf8"),
            look: "library",
            hooks: true,
          }),
        ),
      );
      expect(verified(segs, py), n).toHaveLength(segs.length);
      checked += segs.length;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("a code line and a callout's title carry the passage hook in both looks", () => {
    const [, callouts] = FIXTURES.find(([n]) => n === "native/callouts.md")!;
    for (const look of ["old", "library"] as const)
      expect(
        passages(parse(html({ source: callouts, look, hooks: true }))),
        look,
      ).toContain("The key idea");
  });
});

describe("every other caller keeps the markup it had", () => {
  for (const [name, source] of FIXTURES) {
    it(`${name}: the default draws no hook, and the reader's hooks add attributes only`, () => {
      const plain = html({ source });
      for (const h of BODY_HOOKS) expect(plain, h).not.toContain(`${h}=`);
      const hooked = html({ source, hooks: true });
      const unhooked = hooked.replace(
        new RegExp(` (?:${BODY_HOOKS.join("|")})=""`, "g"),
        "",
      );
      expect(unhooked).toBe(plain);
    });
  }
});

describe("the Library's body is out of the old sheets' reach", () => {
  // Names the Library's markup shares with an old sheet, and why no old rule reaches it through them: each old
  // selector naming one also names a class the body never carries (checked below).
  const SHARED = new Set([
    "is-wide", // the signed wide figure's state (`BlocksFigure`); old: `.kb-ch .ra-keep.is-wide`, `.dg.is-wide` …
    "tml-left", // Temml's own MathML classes; old: only under `.kb-ch` or `.ra-mb`
    "tml-right",
    "tml-jot",
    "tml-sml-pad",
    "tml-med-pad",
    "tml-lrg-pad",
    "tml-small",
    "tml-prime",
  ]);

  it("no element outside its islands carries a class the old sheets style, and no old rule can match one", () => {
    const old = new Set(oldSelectors.flatMap(classNames));
    const carried = new Set<string>();
    for (const [, source] of FIXTURES)
      for (const format of ["native", "md"] as const) {
        const root = parse(
          html({ source, format, look: "library", hooks: true }),
        );
        for (const e of elements(root, inIsland))
          classes(e).forEach((c) => carried.add(c));
      }
    expect(carried.has("read")).toBe(true);
    const styled = [...carried].filter((c) => old.has(c) && !SHARED.has(c));
    expect(styled).toEqual([]);
    const reaching = oldSelectors.filter((s) => {
      const names = classNames(s);
      return names.length > 0 && names.every((c) => carried.has(c));
    });
    expect(reaching).toEqual([]);
  });

  it("the marks painted into it are out of reach too (P63-fk.S11): the paint's classes, with the body's", () => {
    // `an-m` and `an-pending` are the signed paint's names, shared with the old sheets: every old rule naming one
    // also names the old root (`rd-root`, `kb-ch`, …), which the body never carries. The parts drawn beside the
    // text (`marks-*`) are held out of every old sheet in ./reader-marks.test.ts.
    const paintShared = new Set(["an-m", "an-pending"]);
    const carried = new Set<string>(Object.values(LIBRARY_PAINT));
    for (const [, source] of FIXTURES) {
      const root = parse(html({ source, look: "library", hooks: true }));
      for (const e of elements(root, inIsland))
        classes(e).forEach((c) => carried.add(c));
    }
    const old = new Set(oldSelectors.flatMap(classNames));
    expect(
      Object.values(LIBRARY_PAINT).filter(
        (c) => old.has(c) && !paintShared.has(c),
      ),
    ).toEqual([]);
    const reaching = oldSelectors.filter((s) => {
      const names = classNames(s);
      return names.length > 0 && names.every((c) => carried.has(c));
    });
    expect(reaching).toEqual([]);
  });

  it("the reading aids are the Library's own, out of their islands (P63-fk.S10): terms' windows, glossary, quiz", () => {
    const [, glossary] = FIXTURES.find(([n]) => n === "native/glossary.md")!;
    const root = parse(
      html({ source: glossary, look: "library", hooks: true }),
    );
    const outside = new Set(elements(root, inIsland).flatMap(classes));
    for (const c of [
      "blocks-term",
      "blocks-term-box",
      "blocks-gl-entry",
      "blocks-quiz",
      "blocks-q",
    ])
      expect(outside.has(c), c).toBe(true);
    // what stays in an island is paper's (the printed quiz and its key), never the screen's old aids
    const inside = new Set(
      elements(root)
        .filter(inIsland)
        .flatMap((i) => elements(i))
        .flatMap(classes),
    );
    for (const old of ["ra-win", "ra-gl", "ra-float", "qz", "qz-item"])
      expect(inside.has(old), old).toBe(false);
  });

  it("the old-look parts sit in islands, in the old root", () => {
    const [, quiz] = FIXTURES.find(([n]) => n === "native/quiz.md")!;
    const root = parse(html({ source: quiz, look: "library", hooks: true }));
    const islands = elements(root).filter(inIsland);
    expect(islands.length).toBeGreaterThan(0);
    for (const i of islands) {
      const all = elements(i);
      expect(all.some((e) => "data-ui-legacy" in e.attrs)).toBe(true);
      expect(all.some((e) => classes(e).includes("rd-root"))).toBe(true);
      expect(
        all.some(
          (e) => "data-island-body" in e.attrs && classes(e).includes("kb-ch"),
        ),
      ).toBe(true);
    }
  });
});

describe("the body's own blocks", () => {
  it("a table sets a column of figures right, any other left", () => {
    expect(
      figureColumns(3, [
        ["Hits", "1,204", "12%"],
        ["Misses", "−3", "4.5 %"],
      ]),
    ).toEqual([false, true, true]);
    expect(figureColumns(2, [])).toEqual([false, false]);
  });

  it("a flow in one row is the signed drawing; a branch, a group or a labelled line keeps its own", () => {
    const n = (id: string, label: string, sub?: string) => ({ id, label, sub });
    const chain = {
      nodes: [
        n("a", "Query", "as typed"),
        n("b", "Terms"),
        n("c", "Results", "in order"),
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };
    expect(rowOf(chain)).toEqual([
      { label: "Query", sub: "as typed" },
      { label: "Terms", sub: null },
      { label: "Results", sub: "in order" },
    ]);
    expect(
      rowOf({
        ...chain,
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "c" },
        ],
      }),
    ).toBeNull();
    expect(
      rowOf({
        ...chain,
        edges: [
          { from: "a", to: "b", label: "cut" },
          { from: "b", to: "c" },
        ],
      }),
    ).toBeNull();
    expect(
      rowOf({ ...chain, groups: [{ id: "g", label: "G", nodes: ["a"] }] }),
    ).toBeNull();
    expect(rowOf({ ...chain, direction: "down" })).toBeNull();
    expect(READER_BLOCKS.drawing.item("Query", "as typed", "Terms")).toBe(
      "Query (as typed). Goes to Terms.",
    );
    expect(READER_BLOCKS.drawing.item("Results", "in order", null)).toBe(
      "Results (in order), an end state.",
    );
  });
});
