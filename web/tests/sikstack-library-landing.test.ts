import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Where an address lands in the reader's body (job 07's frame F242: a card's link opens the reader scrolled to
// its place, never under the bar). Every element of the body an address can land on carries an id (the hash,
// Review's Open at, Continue reading's section, a bookmark's or a list's section, the contents list, the
// glossary's way back all land with `scrollIntoView` on `#id`), so one rule in the Library's sheets gives every
// `[id]` inside the article (`.blocks-host`) the headings' margin, and no rule of those sheets gives a landing
// place any other.

const web = fileURLToPath(new URL("..", import.meta.url));
const library = join(web, "src/sikstack/styles/library");
const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  sheet: string;
  selectors: string[];
  margin: string | null;
  /** Every declaration of the rule, in order: [property, value]. */
  decls: [string, string][];
}

/** Every style rule of a stretch of CSS, descending into at-rules, with its `scroll-margin-top` (or null). */
function rules(css: string, sheet: string): Rule[] {
  const out: Rule[] = [];
  const text = stripComments(css);
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const prelude = text.slice(start, open).trim();
        const body = text.slice(open + 1, i);
        if (prelude.startsWith("@")) out.push(...rules(body, sheet));
        else {
          const decl =
            /(?:^|;)\s*scroll-margin(?:-top|-block)?\s*:\s*([^;]+)/.exec(body);
          out.push({
            sheet,
            selectors: split(prelude),
            // the shorthands' first value is the top
            margin: decl ? first(decl[1].trim()) : null,
            decls: split(body, ";").flatMap((d): [string, string][] => {
              const at = d.indexOf(":");
              return at > 0
                ? [[d.slice(0, at).trim(), d.slice(at + 1).trim()]]
                : [];
            }),
          });
        }
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) start = i + 1;
  }
  return out;
}

/** A list's items, split at top-level commas (or spaces, for a value; or `;`, for a rule's body). */
function split(list: string, at = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && (at === " " ? /\s/.test(c) : c === at)) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}
const first = (value: string) => split(value, " ")[0];

interface El {
  tag: string;
  classes: string[];
}

/** Does one compound selector (`tag.class[id]:where(a, b)`) match the element? Unknown parts never match. */
function compound(sel: string, el: El): boolean {
  let rest = sel;
  const tag = /^[a-z][a-z0-9]*/.exec(rest);
  if (tag) {
    if (tag[0] !== el.tag) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest) {
    let m: RegExpExecArray | null;
    if ((m = /^\.([a-z][a-z0-9-]*)/i.exec(rest))) {
      if (!el.classes.includes(m[1])) return false;
    } else if ((m = /^\[id\]/.exec(rest))) {
      // every landing place carries an id
    } else if ((m = /^:(?:where|is)\(([^()]*)\)/.exec(rest))) {
      if (!split(m[1]).some((s) => compound(s, el))) return false;
    } else return false;
    rest = rest.slice(m[0].length);
  }
  return true;
}

/** The body's chain, outermost first: the `.ui` root, the article, the text (`.read`). */
const HOST: El[] = [
  { tag: "div", classes: ["ui"] },
  { tag: "div", classes: ["blocks-host"] },
  { tag: "div", classes: ["read"] },
];

/** Does a descendant selector match the element, inside the body's chain? */
function matches(sel: string, el: El, chain: El[]): boolean {
  if (/[>+~]/.test(sel)) return false;
  const parts = split(sel, " ").filter((p) => p !== ":scope");
  const last = parts.pop();
  if (!last || !compound(last, el)) return false;
  let at = chain.length - 1;
  for (const part of parts.reverse()) {
    while (at >= 0 && !compound(part, chain[at])) at--;
    if (at < 0) return false;
    at--;
  }
  return true;
}

/** The places an address lands on, each as the body's renderer draws it (with an id). */
const PLACES: [string, El][] = [
  ["a heading (h2)", { tag: "h2", classes: [] }],
  ["a heading (h3)", { tag: "h3", classes: [] }],
  ["the quiz block", { tag: "section", classes: ["read", "blocks-quiz"] }],
  ["a quiz item", { tag: "li", classes: ["blocks-q"] }],
  ["a glossary entry", { tag: "li", classes: ["blocks-gl-entry"] }],
  ["a paragraph", { tag: "p", classes: [] }],
  ["a figure", { tag: "figure", classes: ["read", "blocks-fig"] }],
  ["a formula", { tag: "figure", classes: ["read", "blocks-fm"] }],
  ["a drawing", { tag: "figure", classes: ["read", "blocks-dg"] }],
  ["a table or code box", { tag: "div", classes: ["blocks-scroll"] }],
  ["a list", { tag: "ol", classes: [] }],
  ["a term's use", { tag: "a", classes: ["blocks-term"] }],
];

const SHEETS = readdirSync(library).filter(
  (f) => f.endsWith(".css") && f !== "boundary.css",
);
const ALL = SHEETS.flatMap((s) => rules(read(join(library, s)), s));

/** The headings' margin: the bar's height and a gap (frame.css's `.read :where(h2)`). */
const HEADING = ALL.find(
  (r) => r.sheet === "frame.css" && r.selectors.includes(".read :where(h2)"),
)?.margin;

describe("an address in the reader's body", () => {
  it("has the headings' margin to land below the bar", () => {
    expect(HEADING).toBe("calc(var(--reader-top-h) + var(--space-5))");
  });

  it("lands every place it can name below the bar, by one rule for the class", () => {
    const short: string[] = [];
    for (const [name, el] of PLACES) {
      const got = ALL.filter(
        (r) => r.margin && r.selectors.some((s) => matches(s, el, HOST)),
      ).map((r) => r.margin);
      if (got.length === 0 || got.some((m) => m !== HEADING))
        short.push(`${name}: ${got.join(" | ") || "none"}`);
    }
    expect(short).toEqual([]);
    const one = ALL.filter((r) => r.selectors.includes(".blocks-host [id]"));
    expect(one.map((r) => [r.sheet, r.margin])).toEqual([
      ["blocks.css", HEADING],
    ]);
  });

  it("is given no other margin by any rule of the Library's sheets", () => {
    const other = ALL.filter((r) => r.margin && r.margin !== HEADING).map(
      (r) => `${r.sheet}: ${r.selectors.join(", ")} (${r.margin})`,
    );
    expect(other).toEqual([]);
  });

  it("carries an id on each place the renderer draws inside the article", () => {
    const body = read(join(web, "src/sikstack/reader/body/body.tsx"));
    expect(body).toMatch(/<div className="blocks-host"[\s\S]*<ChapterView/);
    const quiz = read(join(web, "src/sikstack/reader/aids/quiz.tsx"));
    expect(quiz).toMatch(/className="read blocks-quiz"\s+id=\{id\}/);
    expect(quiz).toMatch(/<li className="blocks-q" id=\{domId\}>/);
  });
});

// P64-3y.F4 — the bar wraps to two rows (99 px) below about 820 px and to three for a visitor's chapter in two
// languages (03-library F89), so "below the bar" is the reader's bar's real height, in one place of its own:
// `--reader-top-h` on `.app.reader`, the one-row `--top-h` by default and the measured height once the frame has
// measured the bar (`sikstack/reader/frame-measure.ts`). `--top-h` stays the system's one-row height: the foot bar's,
// the sheets' heads', the landing page's.
describe("the reader's top bar's height", () => {
  const WITH = [
    ...ALL,
    ...rules(read(join(library, "boundary.css")), "boundary.css"),
  ];
  const declaring = (name: string) =>
    WITH.flatMap((r) =>
      r.decls
        .filter(([p]) => p === name)
        .map(([, v]) => `${r.sheet}: ${r.selectors.join(", ")} = ${v}`),
    );

  it("is declared once, on the reader's root, as the one-row bar until measured", () => {
    expect(declaring("--reader-top-h")).toEqual([
      "reader.css: .app.reader = var(--top-h)",
      "boundary.css: .ui [data-ui-legacy] = var(--sikstack-legacy-reader-top-h)",
    ]);
    expect(declaring("--top-h")).toEqual([]);
  });

  it("is what every rule meaning 'below the reader's top bar' reads, never the one-row --top-h", () => {
    const below = ALL.flatMap((r) =>
      r.decls
        .filter(([p]) =>
          /^(top|max-height|scroll-margin(-top|-block)?)$/.test(p),
        )
        .filter(([, v]) => /--(reader-)?top-h\b/.test(v))
        .map(
          ([p, v]) => `${r.sheet}: ${r.selectors.join(", ")} { ${p}: ${v} }`,
        ),
    );
    expect(below.filter((d) => /var\(--top-h\)/.test(d))).toEqual([]);
    // the landing margins (every one is the headings', above) and the side panel's sticky top
    expect(below).toEqual(
      expect.arrayContaining([
        "frame.css: .read :where(h2) { scroll-margin-top: calc(var(--reader-top-h) + var(--space-5)) }",
        "blocks.css: .blocks-host [id] { scroll-margin-top: calc(var(--reader-top-h) + var(--space-5)) }",
        "frame.css: .reader-frame.has-side > .reader-side { top: calc(var(--reader-top-h) + var(--line-h)) }",
      ]),
    );
  });

  it("is measured from the bar and written on the reader's root by both reading pages", () => {
    const measure = read(join(web, "src/sikstack/reader/frame-measure.ts"));
    expect(measure).toMatch(/READER_TOP_H = "--reader-top-h"/);
    expect(measure).toMatch(/readerTopH\(bar\.clientHeight\)/);
    expect(measure).toMatch(/new ResizeObserver\(write\)/);
    for (const page of [
      "src/sikstack/reader/chapter-reader.tsx",
      "src/sikstack/reader/document/document-reader.tsx",
    ]) {
      const src = read(join(web, page));
      expect(src, page).toMatch(/const topH = useReaderTopBar\(rootRef\)/);
      // before the reader's memory and the landings (their effects run after this layout effect)
      expect(src.indexOf("useReaderTopBar(rootRef)"), page).toBeLessThan(
        src.indexOf("useReading("),
      );
      expect(src, page).toMatch(/topH \}/);
    }
  });

  it("lifts the slot's holders by the frame's measure while the dock is up", () => {
    const lift = ALL.filter((r) =>
      r.decls.some(
        ([p, v]) => p === "translate" && /--reader-slot-lift/.test(v),
      ),
    ).map((r) => `${r.sheet}: ${r.selectors.join(", ")}`);
    expect(lift).toEqual([
      "reader.css: .app.reader > .marks-slot, .app.reader > .reader-foot > .pill",
    ]);
  });
});
