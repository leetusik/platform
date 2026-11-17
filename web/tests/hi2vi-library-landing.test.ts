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
const library = join(web, "src/hi2vi/styles/library");
const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  sheet: string;
  selectors: string[];
  margin: string | null;
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
          });
        }
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) start = i + 1;
  }
  return out;
}

/** A list's items, split at top-level commas (or spaces, for a value). */
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
    expect(HEADING).toBe("calc(var(--top-h) + var(--space-5))");
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
    const body = read(join(web, "src/hi2vi/reader/body/body.tsx"));
    expect(body).toMatch(/<div className="blocks-host"[\s\S]*<ChapterView/);
    const quiz = read(join(web, "src/hi2vi/reader/aids/quiz.tsx"));
    expect(quiz).toMatch(/className="read blocks-quiz"\s+id=\{id\}/);
    expect(quiz).toMatch(/<li className="blocks-q" id=\{domId\}>/);
  });
});
