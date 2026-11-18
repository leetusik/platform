import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Md, type MdProps, mdSections } from "@/hi2vi/workspace/md";

// The Workspace's Markdown body (design job 02, frame.md F46): a real renderer whose output carries the `.md`
// classes: three heading steps counted from `level`, a code block and a table in their own focusable scroll
// box, the way to a section from three first-step headings, no raw HTML, and a real plan rendered whole.

const render = (props: MdProps) => renderToStaticMarkup(createElement(Md, props));
const count = (html: string, needle: string) => html.split(needle).length - 1;

/** A plan as the workspace writes them: a title, sections, an eight-column table, a code block, Korean text. */
const PLAN = [
  "# Workspace pages: the Agenda at rest",
  "",
  "## Goal",
  "",
  "Build the Agenda's three lists **as signed**: the open items, the deferred part and what ended. See",
  "[the signed record](https://example.com/record) and the `agenda.css` sheet; nothing is *redesigned*.",
  "",
  "## Read for this work",
  "",
  "1. The round's Build: the Agenda wherever it appears.",
  "2. The boards `AgendaList.dc.html` and `AgendaListStates.dc.html`.",
  "   - The second half of the states is its own board.",
  "   - 한국어 제목은 `lang=\"ko\"`를 받습니다.",
  "3. The frame's notes on rows.",
  "",
  "### Not in this work",
  "",
  "- Reordering and picked rows: the next piece of work.",
  "",
  "## Claims",
  "",
  "| Claim | Kind | Seen failing | Passing | Command | Runtime | Owner | Note |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| Ten deferred a page | guard | mutation | yes | `pnpm --dir web test` | node | web | the pager's key is `deferred` |",
  "| 회의록 정리 renders whole | claim | before | yes | `vitest run` | node | web | Korean title, `lang=\"ko\"` |",
  "| Waiting for sync shows | claim | before | yes | `vitest run` | Chrome | web | a dashed badge |",
  "",
  "## Validation",
  "",
  "```sh",
  "pnpm --dir web test -- tests/agenda.test.ts",
  "pnpm --dir web typecheck",
  "```",
  "",
  "> 운영자의 브라우저에서도 확인했습니다. Checked by hand in the operator's runtime as well.",
].join("\n");

describe("Md's heading steps", () => {
  it("give the shallowest heading the first step and count aria-level from `level`", () => {
    const at2 = render({ source: PLAN, dropTitle: true });
    expect(at2).toContain('<div class="md-h1" role="heading" aria-level="2" id="md-1">Goal</div>');
    expect(at2).toContain('<div class="md-h2" role="heading" aria-level="3">Not in this work</div>');
    const at3 = render({ source: PLAN, dropTitle: true, level: 3, anchor: "plan" });
    expect(at3).toContain('<div class="md-h1" role="heading" aria-level="3" id="plan-1">Goal</div>');
    expect(at3).toContain('<div class="md-h2" role="heading" aria-level="4">Not in this work</div>');
    // the body's own box carries the anchor
    expect(at3).toContain('<div class="md" id="plan">');
  });

  it("put anything deeper than the second step on the third", () => {
    const html = render({ source: "## A\n\n### B\n\n#### C\n\n##### D\n" });
    expect(html).toContain('<div class="md-h3" role="heading" aria-level="4">C</div>');
    expect(html).toContain('<div class="md-h3" role="heading" aria-level="4">D</div>');
  });

  it("drop a leading `# …` only when asked", () => {
    expect(render({ source: PLAN })).toContain("Workspace pages: the Agenda at rest");
    expect(render({ source: PLAN, dropTitle: true })).not.toContain("Workspace pages: the Agenda at rest");
  });
});

describe("Md's scroll boxes", () => {
  it("hold a code block and a table each in its own focusable, named box", () => {
    const html = render({ source: PLAN, dropTitle: true });
    expect(html).toContain(
      '<div class="table-scroll md-code" tabindex="0" role="region" aria-label="Code"><pre><code class="language-sh">',
    );
    expect(html).toContain(
      '<div class="table-scroll md-table" tabindex="0" role="region" aria-label="Table"><table class="table"><thead>',
    );
    expect(count(html, '<th scope="col">')).toBe(8);
  });
});

describe("Md's way to a section", () => {
  const three = "## One\n\ntext\n\n## Two\n\ntext\n\n## Three\n\ntext\n";
  const two = "## One\n\ntext\n\n## Two\n\ntext\n\n### Under\n\ntext\n";

  it("appears with `outline` and three first-step headings: a closed disclosure and a list beside", () => {
    const html = render({ source: three, outline: true, anchor: "doc" });
    expect(html).toContain('<details class="md-jump"><summary>Sections</summary>');
    expect(html).not.toContain("<details class=\"md-jump\" open");
    expect(html).toContain('<nav class="md-outline" aria-label="Sections"><p class="md-outline-title">Sections</p>');
    expect(count(html, '<a class="md-outline-link" href="#doc-3">Three</a>')).toBe(2);
  });

  it("does not appear under three first-step headings, or without `outline`", () => {
    expect(render({ source: two, outline: true })).not.toMatch(/md-jump|md-outline/);
    expect(render({ source: three })).not.toMatch(/md-jump|md-outline/);
  });

  it("counts first-step headings after the title is dropped", () => {
    expect(mdSections(PLAN, { dropTitle: true, anchor: "plan" })).toEqual([
      { text: "Goal", href: "#plan-1" },
      { text: "Read for this work", href: "#plan-2" },
      { text: "Claims", href: "#plan-3" },
      { text: "Validation", href: "#plan-4" },
    ]);
  });
});

describe("Md and raw HTML", () => {
  it("never renders it: a tag in the source shows as its text", () => {
    const source = [
      "Run `<P>.F1` next; the slice <b>bold</b> stays text.",
      "",
      '<script>alert("x")</script>',
      "",
      '<div onclick="steal()">box</div>',
      "",
      "[a link](javascript:alert(1))",
    ].join("\n");
    const html = render({ source });
    expect(html).not.toMatch(/<script|<b>|<div onclick|href="javascript:/);
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("Md on a real plan", () => {
  it("renders every word, cell and code line, Korean included", () => {
    const html = render({ source: PLAN, dropTitle: true, outline: true, level: 3, anchor: "plan" });
    const text = html
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&");
    const words = PLAN.split("\n")
      .slice(1)
      .flatMap((line) =>
        line
          .replace(/^#+ |^\s*(?:\d+\.|-) |^> /g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/[`*|]/g, " ")
          .split(/\s+/),
      )
      .filter((w) => w && !/^-+$|^```/.test(w) && w !== "sh");
    for (const w of words) expect(text, w).toContain(w);
    expect(count(html, "<tr>")).toBe(4);
    expect(html).toContain("한국어 제목은");
    expect(html).toContain("<code>agenda.css</code>");
    expect(html).toContain('<a href="https://example.com/record">the signed record</a>');
    expect(html).toContain("<blockquote>");
  });
});

describe("Md's sheet", () => {
  const css = readFileSync(
    join(fileURLToPath(new URL("..", import.meta.url)), "src/hi2vi/styles/workspace/md.css"),
    "utf8",
  );
  it("styles every class the renderer emits", () => {
    for (const cls of [
      ".md-wrap",
      ".md-layout",
      ".md {",
      ".md-h1",
      ".md-h2",
      ".md-h3",
      ".md-code",
      ".md-table",
      ".md-jump",
      ".md-outline {",
      ".md-outline-title",
      ".md-outline-link",
      "@container md (min-width: 60em)",
    ])
      expect(css, cls).toContain(cls);
  });
});
