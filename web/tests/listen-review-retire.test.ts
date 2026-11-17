import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { whenText } from "@/lib/review/model";

// P64-3y: the old Listen and Review views retired once job 07's rebuilt pages stopped loading them. A retired
// path that comes back, or an import of one, fails here; so does a retired sheet rule. What stays (the one
// `<audio>` and its engine, the undrawn-form card's fallback, the legacy html reader's sheets) is held too.
// P64-3y.F7: so does a prop, field, rule or comment only the retired views read (the tail below).

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

/** A source without its comments (block comments, and lines that are a comment alone). */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The field names an exported interface declares (nested object types count too; only absence is asked). */
const fieldsOf = (rel: string, name: string): string[] => {
  const m = code(rel).match(
    new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!m) throw new Error(`${name} is not in ${rel}`);
  return [...m[1].matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((x) => x[1]);
};

describe("the retired views' tail (P64-3y.F7): nothing only they read comes back", () => {
  it("ReaderHead takes no `listen` (the old control's place), and no sheet or part draws `.read-listen`", () => {
    const props = fieldsOf(
      "src/hi2vi/reader/reader-head.tsx",
      "ReaderHeadProps",
    );
    expect(props).toContain("audio");
    expect(props).not.toContain("listen");
    expect(
      SOURCES.filter((f) => /read-listen/.test(code(relative(WEB, f)))).map(
        (f) => relative(WEB, f),
      ),
    ).toEqual([]);
  });

  it("the old root carries no Listen: no `docked`, no `after` and no `slot` to render it", () => {
    const value = fieldsOf("src/hi2vi/reader/old-root.tsx", "OldBodyValue");
    expect(value).toEqual(expect.arrayContaining(["settings", "topH"]));
    expect(value.filter((f) => f === "docked" || f === "after")).toEqual([]);
    expect(code("src/hi2vi/reader/old-root.tsx")).not.toMatch(
      /\b(docked|after|slot)\b/,
    );
    expect(
      SOURCES.filter(
        (f) =>
          /<OldRoot[^>]*\bslot\b|\bdocked\s*[,:}]|\bafter:\s*null/.test(
            code(relative(WEB, f)),
          ) &&
          /reader\/(chapter-reader|document\/document-reader|body\/)/.test(f),
      ).map((f) => relative(WEB, f)),
    ).toEqual([]);
  });

  it("what stays is named with its reader: the frame re-renders on the Listen store, so `useSlotLift` measures the dock coming and going", () => {
    for (const rel of [
      "src/hi2vi/reader/chapter-reader.tsx",
      "src/hi2vi/reader/document/document-reader.tsx",
    ]) {
      const src = code(rel);
      expect(src).toMatch(/\buseListen\(\);/);
      expect(src).toMatch(/\buseSlotLift\(rootRef\)/);
    }
  });

  it("the dock's view carries only what job 07's dock draws: no old `lead`, `busy`, `revoked`, `open` or `signIn`", () => {
    const dock = fieldsOf("src/lib/listen/view.ts", "DockView");
    expect(dock).toEqual(
      expect.arrayContaining(["act", "shape", "pct", "word", "rest", "say"]),
    );
    expect(
      dock.filter((f) =>
        ["lead", "busy", "revoked", "open", "signIn"].includes(f),
      ),
    ).toEqual([]);
    expect(code("src/lib/listen/view.ts")).not.toMatch(/export type Lead\b/);
  });

  it("the continue read carries no old end's `lede`; Review's end builds its line from the figures", () => {
    const cont = fieldsOf("src/lib/review/actions.ts", "ContinueView");
    expect(cont).toEqual(expect.arrayContaining(["book", "chapter", "pct"]));
    expect(cont).not.toContain("lede");
  });

  it("the next due date is month first, the only way it is written (no day-first default)", () => {
    expect(code("src/lib/review/model.ts")).not.toMatch(/monthFirst/);
    expect(
      whenText("2026-10-23T01:45:00Z", "2026-10-20T09:30:00Z", "Asia/Kolkata"),
    ).toBe("on Oct 23 at 07:15");
  });

  it("no comment of the tail's files points at a retired view or says `/review` waits outside the Shell for a rebuild", () => {
    const files = [
      "src/hi2vi/reader/reader-head.tsx",
      "src/hi2vi/reader/old-root.tsx",
      "src/hi2vi/styles/library/reader.css",
      "src/lib/listen/view.ts",
      "src/lib/review/actions.ts",
      "src/lib/review/model.ts",
      "src/hi2vi/shell/legacy-page.tsx",
      "src/hi2vi/shell/shell.css",
    ];
    const retired = RETIRED.map((p) =>
      p.replace(/^src\//, "").replace(/\.tsx$/, ""),
    );
    const hits = files.flatMap((rel) => {
      const text = read(rel);
      return [
        ...retired.filter((p) => text.includes(p)),
        ...(/until (S10|S5)\b|lx-docked|`listen` leaves|place of Listen|`\/review`[^.]*until its own phase/.test(
          text,
        )
          ? ["a stale line"]
          : []),
      ].map((what) => `${rel}: ${what}`);
    });
    expect(hits).toEqual([]);
  });
});
