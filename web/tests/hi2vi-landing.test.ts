import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LANDING, LANDING_LINKS } from "@/content/marketing";
import { Landing } from "@/hi2vi/landing/landing";

// The landing at `/` (job 06, round 01-landing, signed): what its words and links must and must
// not say, and how its sheet stays scoped. The suite has no DOM, so it reads the content module
// the page renders from and the page's own source files; the diagram's section (job 08) is read
// from the page rendered to static markup.

const WEB = join(__dirname, "..");
const SOURCES = [
  "src/hi2vi/landing",
  "src/app/(marketing)",
  "src/content/marketing",
].flatMap((dir) =>
  readdirSync(join(WEB, dir))
    .filter((f) => /\.(tsx?|css)$/.test(f))
    .map((f) => ({
      path: `${dir}/${f}`,
      text: readFileSync(join(WEB, dir, f), "utf8"),
    })),
);

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}

const WORDS = strings({ LANDING, LANDING_LINKS });

// Operator decision D5: the record's `[GITHUB URL]` placeholder.
const REPO = "https://github.com/leetusik/platform";
const PLUGIN = "https://github.com/leetusik/platform/tree/main/plugin";

describe("the landing's links", () => {
  it("never carry the placeholder [GITHUB URL]", () => {
    expect(WORDS.filter((w) => w.includes("[GITHUB URL]"))).toEqual([]);
    for (const { path, text } of SOURCES)
      expect(text.includes("[GITHUB URL]"), path).toBe(false);
  });

  it("send guides, the plugin and the footer's GitHub to decision D5's two addresses", () => {
    expect(LANDING.connect.guides.href).toBe(REPO);
    expect(LANDING.connect.plugin.href).toBe(PLUGIN);
    expect(LANDING.footer.github.href).toBe(REPO);
    expect(WORDS.filter((w) => w.includes("github.com")).sort()).toEqual(
      [REPO, REPO, PLUGIN].sort(),
    );
  });

  it("are written only in the content module, never in the page's code", () => {
    for (const { path, text } of SOURCES.filter(
      (s) => !s.path.startsWith("src/content/"),
    ))
      expect(/github\.com/.test(text), path).toBe(false);
  });
});

describe("the landing's words (F262)", () => {
  const banned = [
    /get started/i,
    /retrieval api/i,
    /\bpric(e|es|ing)\b/i,
    /\bper month\b|\/mo\b/i,
    /\$\s?\d|₩|€|£/,
    /\btiers?\b/i,
  ];

  it("say no price, no tier, no Get started and no retrieval API", () => {
    for (const re of banned) {
      expect(
        WORDS.filter((w) => re.test(w)),
        String(re),
      ).toEqual([]);
      for (const { path, text } of SOURCES.filter((s) =>
        s.path.endsWith(".tsx"),
      ))
        expect(re.test(text), `${path} ${re}`).toBe(false);
    }
  });

  it("call the sign-up action Create account", () => {
    expect(LANDING.header.createAccount).toBe("Create account");
    expect(LANDING.hero.createAccount).toBe("Create account");
    expect(LANDING_LINKS.createAccount).toBe("/signup");
    expect(LANDING_LINKS.signIn).toBe("/login");
  });
});

describe("the commands (the product's content, carried over)", () => {
  // Pinned from the retired content/marketing (HERO_TERMINAL's first line and ZSHENV_EXPORT_BASE)
  // before it was rewritten; the token is the record's visible fake (F261).
  it("keep the install command and the two variable names", () => {
    expect(LANDING.connect.install.command).toBe(
      "curl -fsSL https://hi2vi.com/install.sh | bash",
    );
    expect(LANDING.connect.env.command).toBe(
      'export KB_API_BASE_URL="https://hi2vi.com"\nexport KB_API_TOKEN="vk_…"',
    );
    expect(LANDING.connect.skill).toBe("/knowledge:explain");
  });
});

describe("the landing's sheet", () => {
  const css = readFileSync(
    join(WEB, "src/hi2vi/landing/landing.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  /** What is left of the sheet once its `@scope (.ui) to ([data-ui-legacy])` blocks and keyframes are cut out. */
  function outsideScope(text: string): string {
    let rest = "";
    let i = 0;
    while (i < text.length) {
      const at = text.slice(i);
      const m =
        /^@(scope \(\.ui\) to \(\[data-ui-legacy\]\)|keyframes [\w-]+)\s*\{/.exec(
          at,
        );
      if (m) {
        let depth = 0;
        let j = i + m[0].length - 1;
        for (; j < text.length; j++) {
          if (text[j] === "{") depth++;
          else if (text[j] === "}" && --depth === 0) break;
        }
        i = j + 1;
        continue;
      }
      rest += text[i];
      i++;
    }
    return rest;
  }

  it("holds every rule inside its @scope block (keyframes aside)", () => {
    expect(css).toMatch(/@scope \(\.ui\) to \(\[data-ui-legacy\]\)/);
    expect(outsideScope(css).trim()).toBe("");
  });

  it("names no hex colour", () => {
    expect(css.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });
});

describe("the diagram's section (job 08, round 01, `## Build` 3a-3b)", () => {
  // The page rendered to static markup: where the section sits and what its figure holds.
  const html = renderToStaticMarkup(createElement(Landing));
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const sections = [...main.matchAll(/<section\b[^>]*>/g)].map((m) => m[0]);
  const at = main.indexOf('aria-labelledby="lp-how"');
  const how = at < 0 ? "" : main.slice(at, main.indexOf("</section>", at));
  const figure = how.slice(how.indexOf("<figure"), how.indexOf("</figure>"));
  const words = LANDING.how;

  it("is the second section, after the hero, with its h2", () => {
    expect(sections[0]).toContain('aria-labelledby="lp-h1"');
    expect(sections[1]).toContain('aria-labelledby="lp-how"');
    expect(sections[2]).toContain('aria-labelledby="lp-ws"');
    expect(how).toContain(`<h2 class="lp-h2" id="lp-how">${words.title}</h2>`);
  });

  it("draws a figure with role img, labelled from the content module", () => {
    expect(figure).toMatch(/^<figure class="lp-map" role="img"/);
    expect(figure).toContain(`aria-label="${words.label}"`);
  });

  it("holds nothing to click or focus", () => {
    expect(figure).toContain("lp-map-chain");
    expect(figure).not.toMatch(/<a\b|<button\b|tabindex/i);
  });
});
