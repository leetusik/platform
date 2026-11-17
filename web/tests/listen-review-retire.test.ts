import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// P64-3y: the old Listen and Review views retired once job 07's rebuilt pages stopped loading them. A retired
// path that comes back, or an import of one, fails here; so does a retired sheet rule. What stays (the one
// `<audio>` and its engine, the undrawn-form card's fallback, the legacy html reader's sheets) is held too.

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const RETIRED = [
  "src/components/listen/listen-page.tsx",
  "src/components/listen/dock.tsx",
  "src/components/listen/listen-control.tsx",
  "src/components/listen/listen-note.tsx",
  "src/components/listen/player.tsx",
  "src/components/listen/icons.tsx",
  "src/components/book/listen-host.tsx",
  "src/components/book/book-listen.tsx",
  "src/components/review/review-app.tsx",
  "src/components/review/review-static.tsx",
  "src/components/review/queue-head.tsx",
  "src/components/review/settings.tsx",
  "src/components/review/skeleton.tsx",
  "src/components/review/end.tsx",
];

/** Kept, each for a reason the slice's record gives: the engine's one `<audio>`, and the undrawn-form card. */
const KEPT = [
  "src/components/listen/listen-root.tsx",
  "src/components/listen/listen-host.tsx",
  "src/components/review/card.tsx",
  "src/components/review/inline.tsx",
  "src/lib/review/foot.ts",
  "src/hi2vi/review/old-view.tsx",
  "src/app/review.css",
  "src/app/reader.css",
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const SOURCES = walk(SRC).filter((f) => /\.(tsx?|css)$/.test(f));

/** Every module or sheet a source file names (`import … from`, `import "…"`, `import("…")`, `@import "…"`). */
const specifiers = (text: string): string[] =>
  [
    ...text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*|@import\s+(?:url\()?)["']([^"']+)["']/g,
    ),
  ].map((m) => m[1]);

/** A specifier as a repo path without its extension, or null for a package. */
const target = (file: string, spec: string): string | null => {
  const abs = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(file), spec)
      : null;
  return abs ? relative(WEB, abs).replace(/\.(tsx?|css)$/, "") : null;
};

const importersOf = (path: string): string[] => {
  const want = path.replace(/\.(tsx?|css)$/, "");
  return SOURCES.filter((f) =>
    specifiers(readFileSync(f, "utf8")).some((s) => target(f, s) === want),
  ).map((f) => relative(WEB, f));
};

describe("the old Listen and Review views (P64-3y)", () => {
  it("are gone, and nothing imports one", () => {
    expect(RETIRED.filter((p) => existsSync(join(WEB, p)))).toEqual([]);
    expect(
      RETIRED.flatMap((p) => importersOf(p).map((by) => `${by} → ${p}`)),
    ).toEqual([]);
  });

  it("leave what is still loaded: the one <audio>, the undrawn-form card and its sheets", () => {
    expect(KEPT.filter((p) => !existsSync(join(WEB, p)))).toEqual([]);
    expect(importersOf("src/components/listen/listen-root.tsx")).toEqual([
      "src/app/layout.tsx",
    ]);
    expect(importersOf("src/components/review/card.tsx")).toEqual([
      "src/hi2vi/review/review-frame.tsx",
    ]);
    expect(importersOf("src/app/review.css")).toEqual([
      "src/hi2vi/review/old-view.tsx",
    ]);
    // the legacy html reader keeps its sheet and its Display panel
    const legacy = importersOf("src/app/reader.css");
    expect(legacy).toContain("src/components/reader/legacy-reader.tsx");
    expect(
      specifiers(read("src/components/reader/legacy-reader.tsx")).some(
        (s) =>
          target(join(SRC, "components/reader/legacy-reader.tsx"), s) ===
          "src/components/reader/display-panel",
      ),
    ).toBe(true);
  });

  it("take their rules with them: no old Listen rule in the reader's sheet, no undrawn review rule", () => {
    const css = read("src/app/reader.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.match(/\.(lx-|pl-|rx-listen)[\w-]*/g) ?? []).toEqual([]);
    expect(css).not.toMatch(/--lx-/);
    expect(css).toMatch(/\.rd-root\b/);
    // every review class the old sheet still styles is drawn by a source that is still loaded
    const review = read("src/app/review.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const drawn = SOURCES.filter((f) => /\.tsx?$/.test(f))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const names = [...new Set(review.match(/\.rv-[\w-]+/g) ?? [])].map((c) =>
      c.slice(1),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(
      names.filter((c) => !new RegExp(`["'\` ]${c}["'\` ]`).test(drawn)),
    ).toEqual([]);
  });
});
