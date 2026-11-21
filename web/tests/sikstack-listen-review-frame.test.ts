import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Ico, Meter, Say } from "@/sikstack/ui";

// Listen and Review's shared frame parts, promoted into the sikstack system (job 07, round 01: frame.md F202 to
// F205, F238, F239; frame.css sections 1 to 5). Each rule is the signed declaration under its system name
// (P58-yw class-names: `.status-wait` is `.status-busy`, `.track` is `.meter`, F239 is `.badge.is-wrap`); the
// system's one-line `.badge` is unchanged; the two job sheets are scoped like the system and loaded once,
// through the barrel.

const web = fileURLToPath(new URL("..", import.meta.url));
const styles = join(web, "src/sikstack/styles");
const read = (path: string) => readFileSync(path, "utf8");
const SCOPE = "@scope (.ui) to ([data-ui-legacy])";
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

interface Block {
  prelude: string;
  body: string;
}

/** The statements of a stretch of CSS at brace depth 0: `{ prelude, body }` for each block. */
function blocks(css: string): Block[] {
  const text = stripComments(css);
  const out: Block[] = [];
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
        out.push({
          prelude: text.slice(start, open).trim(),
          body: text.slice(open + 1, i),
        });
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      out.push({ prelude: text.slice(start, i).trim(), body: "" });
      start = i + 1;
    }
  }
  expect(depth).toBe(0);
  expect(text.slice(start).trim()).toBe("");
  return out;
}

/** Every style rule inside a block, descending into `@container` and `@media`. */
function styleRules(css: string): Block[] {
  return blocks(css).flatMap((b) =>
    b.prelude.startsWith("@") ? styleRules(b.body) : [b],
  );
}

/** A rule's declarations, one space after each colon and none around the semicolons. */
const decls = (body: string) =>
  body
    .split(";")
    .map((d) =>
      d
        .trim()
        .replace(/\s*:\s*/, ": ")
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .join("; ");

const classesOf = (css: string) =>
  new Set(
    [...stripComments(css).matchAll(/\.([a-z][a-z0-9-]*)/gi)].map((m) => m[1]),
  );

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const bundle = read(join(styles, "bundle.css"));
const scoped = () => {
  const inScope = blocks(bundle).filter((b) => b.prelude === SCOPE);
  expect(inScope).toHaveLength(1);
  return inScope[0].body;
};
/** The bundle's rules on one exact selector list (outside `@media` and `@container`). */
const rulesOn = (prelude: string) =>
  blocks(scoped())
    .filter((b) => b.prelude === prelude)
    .map((b) => decls(b.body));

/** job 07's frame.css, sections 2 to 5, under the system's names: each rule's signed declarations. */
const PROMOTED: [string, string][] = [
  // 2: the held cell (F218)
  [".hold", "display: grid; min-width: 0"],
  [".hold > *", "grid-area: 1 / 1; min-width: 0"],
  [".hold > .is-held", "visibility: hidden"],
  // 3: marks inside controls (F202)
  [
    ".ico",
    "position: relative; display: inline-block; flex: none; width: var(--ico); height: var(--ico)",
  ],
  [".ico::before, .ico::after", 'content: ""; position: absolute'],
  [
    ".ico-play::before",
    "top: 2px; left: 4px; border-style: solid; border-width: 6px 0 6px 10px; border-color: transparent transparent transparent currentColor",
  ],
  [
    ".ico-pause::before, .ico-pause::after",
    "top: 2px; width: 4px; height: 12px; border-radius: 1px; background: currentColor",
  ],
  [".ico-pause::before", "left: 3px"],
  [".ico-pause::after", "right: 3px"],
  [
    ".ico-prev::before, .ico-next::before",
    "top: 2px; width: 2px; height: 12px; background: currentColor",
  ],
  [
    ".ico-prev::after, .ico-next::after",
    "top: 2px; border-style: solid; border-color: transparent",
  ],
  [".ico-prev::before", "left: 3px"],
  [
    ".ico-prev::after",
    "left: 5px; border-width: 6px 8px 6px 0; border-right-color: currentColor",
  ],
  [".ico-next::before", "right: 3px"],
  [
    ".ico-next::after",
    "right: 5px; border-width: 6px 0 6px 8px; border-left-color: currentColor",
  ],
  [
    ".ico-again::before",
    "inset: 2px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%",
  ],
  [
    ".ico-again::after",
    "top: 1px; left: 8px; border-style: solid; border-width: 3.5px 0 3.5px 5px; border-color: transparent transparent transparent currentColor",
  ],
  [
    ".ico-up::before",
    "top: 6px; left: 4px; width: 7px; height: 7px; border-top: 1.5px solid currentColor; border-left: 1.5px solid currentColor; transform: rotate(45deg)",
  ],
  [".btn-ico", "width: var(--control-h); padding: 0"],
  // 4: the state word and its rest (F203, F204)
  [
    ".say",
    "display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); min-width: 0",
  ],
  [".say > .status", "font-weight: 500"],
  [
    ".say-rest",
    "min-width: 0; color: var(--ink-2); font-variant-numeric: tabular-nums",
  ],
  [
    ".status-busy::before",
    "border-color: var(--edge); border-top-color: var(--ink); background: transparent; animation: say-turn 1s linear infinite",
  ],
  [
    ".status-fail::before",
    'content: "!"; display: flex; align-items: center; justify-content: center; width: var(--space-4); height: var(--space-4); border: 0; background: var(--danger); color: var(--on-accent); font-size: var(--fs-meta); font-weight: 600; line-height: 1',
  ],
  // 5: the thin line (F205)
  [
    ".meter",
    "display: block; flex: none; min-width: 4em; height: var(--line-h); overflow: hidden; border-radius: var(--radius-xs); background: var(--line)",
  ],
  [".meter > i", "display: block; height: 100%; background: var(--accent)"],
  [
    ".meter-row",
    "display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); width: 100%; min-width: 0; max-width: 60ch",
  ],
  [".meter-row > .meter", "flex: 1 1 6em"],
  // F239, as the system's modifier (class-names: the two carried gaps)
  [".badge.is-wrap", "flex: 0 1 auto; min-width: 0; white-space: normal"],
];

describe("the frame parts promoted into the system's bundle", () => {
  it("are each the signed declaration under its system name, once", () => {
    for (const [prelude, expected] of PROMOTED)
      expect(rulesOn(prelude), prelude).toEqual([expected]);
  });

  it("carry the frame's five layout tokens on the root (frame.css section 1)", () => {
    const tokens = blocks(scoped())
      .filter((b) => b.prelude === ":scope")
      .map((b) => decls(b.body))
      .filter((d) => d.includes("--focus-w"));
    expect(tokens).toEqual([
      "--focus-w: 36rem; --dock-w: 34rem; --ico: 16px; --seek-track: 4px; --seek-thumb: 20px",
    ]);
  });

  it("turn the busy ring with say-turn, and hold it still where motion is reduced", () => {
    const outside = blocks(bundle).filter((b) => b.prelude !== SCOPE);
    const turn = outside.filter((b) => b.prelude === "@keyframes say-turn");
    expect(
      turn.map((b) => decls(b.body.replace(/^\s*to\s*\{|\}\s*$/g, ""))),
    ).toEqual(["transform: rotate(360deg)"]);
    const reduced = blocks(scoped())
      .filter((b) => b.prelude === "@media (prefers-reduced-motion: reduce)")
      .flatMap((b) => blocks(b.body))
      .filter((b) => b.prelude === ".status-busy::before")
      .map((b) => decls(b.body));
    expect(reduced).toEqual(["animation: none"]);
  });

  it("leave the system's .badge one line: nowrap and flex none", () => {
    expect(rulesOn(".badge")).toEqual([
      "display: inline-flex; flex: none; align-items: center; min-height: var(--mark-h); padding: 0 var(--mark-pad); border: 1px solid var(--edge); border-radius: var(--radius-s); color: var(--ink-2); font-size: var(--fs-meta); font-weight: 500; line-height: calc(18 / 12); white-space: nowrap",
    ]);
    // no other rule reaches a bare .badge's wrapping or its flex
    const loose = styleRules(scoped()).filter(
      (r) =>
        /(^|,\s*)[^,]*\.badge(?![\w-]|\.is-wrap)[^,]*$/.test(r.prelude) &&
        /white-space|flex\s*:/.test(r.body) &&
        r.prelude !== ".badge",
    );
    expect(loose.map((r) => r.prelude)).toEqual([]);
  });
});

describe("the job's names", () => {
  it("never appear in a sheet: .status-wait is .status-busy, .track is .meter", () => {
    for (const file of filesUnder(styles).filter((f) => f.endsWith(".css"))) {
      const css = stripComments(read(file));
      expect(css, file).not.toMatch(/\.status-wait\b/);
      expect(css, file).not.toMatch(/\.track(?![\w-])|\.track-row\b/);
    }
  });
});

describe("the two job sheets", () => {
  const SHEETS = ["listen/listen.css", "review/review.css"];

  it("scope every rule to .ui, stopped at the old-page boundary, and redefine no system name", () => {
    const system = new Set([
      ...classesOf(read(join(styles, "tokens.css"))),
      ...classesOf(bundle),
    ]);
    for (const name of SHEETS) {
      const top = blocks(read(join(styles, name)));
      expect(
        top.map((b) => b.prelude),
        name,
      ).toEqual([SCOPE]);
      for (const rule of styleRules(top[0].body)) {
        const own = [...classesOf(rule.prelude)].filter((c) => !system.has(c));
        expect(own.length, `${name}: ${rule.prelude}`).toBeGreaterThan(0);
      }
    }
  });

  it("start Listen's swap cell at its mark (F238), in the Listen sheet", () => {
    const listen = blocks(read(join(styles, "listen/listen.css")))[0];
    expect(
      styleRules(listen.body)
        .filter((r) => r.prelude === ".listen-ctl .swap")
        .map((r) => decls(r.body)),
    ).toEqual(["justify-items: start"]);
    // the system's swap cell still centres
    expect(rulesOn(".swap")).toEqual([
      "display: inline-grid; justify-items: center",
    ]);
  });

  it("are each imported once, through the barrel, after the system and before the Library's boundary", () => {
    const imports = [
      ...read(join(styles, "index.css")).matchAll(/@import "([^"]+)";/g),
    ].map((m) => m[1]);
    expect(new Set(imports).size).toBe(imports.length);
    const sheets = filesUnder(styles)
      .filter((f) => f.endsWith(".css") && !f.endsWith("/index.css"))
      .map((f) => `./${relative(styles, f)}`)
      .sort();
    expect([...imports].sort()).toEqual(sheets);
    for (const name of SHEETS) {
      const at = imports.indexOf(`./${name}`);
      expect(at, name).toBeGreaterThan(imports.indexOf("./boundary.css"));
      expect(at, name).toBeLessThan(imports.indexOf("./library/boundary.css"));
    }
    // no page or component imports a job sheet of its own
    for (const file of filesUnder(join(web, "src")).filter((f) =>
      /\.(tsx?|css)$/.test(f),
    ))
      expect(read(file), file).not.toMatch(
        /import\s+["'][^"']*styles\/(listen|review)\//,
      );
  });
});

describe("the parts", () => {
  const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
    renderToStaticMarkup(el);

  it("Ico draws a mark the reader does not hear", () => {
    expect(html(createElement(Ico, { name: "pause" }))).toBe(
      '<span aria-hidden="true" class="ico ico-pause"></span>',
    );
    expect(html(createElement(Ico, { name: "up", className: "dock-up" }))).toBe(
      '<span aria-hidden="true" class="ico ico-up dock-up"></span>',
    );
  });

  it("Say puts the word in its status shape, then its rest", () => {
    expect(
      html(
        createElement(Say, {
          state: "busy",
          word: "Preparing…",
          rest: "· part 2 of 9",
        }),
      ),
    ).toBe(
      '<p class="say"><span class="status status-busy">Preparing…</span><span class="say-rest">· part 2 of 9</span></p>',
    );
    expect(
      html(
        createElement(Say, { as: "span", state: "fail", word: "Signed out" }),
      ),
    ).toBe(
      '<span class="say"><span class="status status-fail">Signed out</span></span>',
    );
    expect(
      html(
        createElement(Say, {
          state: "done",
          word: "Saved",
          rest: "Good · next review in 3 days",
        }),
      ),
    ).toBe(
      '<p class="say"><span class="status status-done">Saved</span><span class="say-rest">Good · next review in 3 days</span></p>',
    );
    expect(html(createElement(Say, { word: "Paused" }))).toBe(
      '<p class="say"><span class="status">Paused</span></p>',
    );
  });

  it("Meter draws the bare line hidden, and the line with its words as a progressbar", () => {
    expect(html(createElement(Meter, { value: 81 }))).toBe(
      '<span class="meter" aria-hidden="true"><i style="width:81%"></i></span>',
    );
    expect(
      html(createElement(Meter, { value: 25, label: "Audio prepared" })),
    ).toBe(
      '<div class="meter-row" role="progressbar" aria-label="Audio prepared" aria-valuemin="0" aria-valuemax="100" aria-valuenow="25"><span class="meta">Audio prepared</span><span class="meter" aria-hidden="true"><i style="width:25%"></i></span><span class="meta">25%</span></div>',
    );
    // a value outside 0 to 100, or not a number, is drawn at its nearest end (nothing made: 0%)
    expect(html(createElement(Meter, { value: 142.6 }))).toContain(
      "width:100%",
    );
    expect(html(createElement(Meter, { value: Number.NaN }))).toContain(
      "width:0%",
    );
    expect(
      html(createElement(Meter, { value: 42.6, label: "Chapters prepared" })),
    ).toContain('aria-valuenow="43"');
  });
});
