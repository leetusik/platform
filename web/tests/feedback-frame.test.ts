import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Absent,
  ClampLink,
  Fact,
  Facts,
  FilterBar,
  Json,
  KeepLines,
  Rating,
  Seg,
  StackTable,
  Tags,
  Waiting,
} from "@/sikstack/feedback";
import { isToggle } from "@/sikstack/feedback/filter-bar";

// The Feedback frame's shared parts (job 04 round 02, `result.md` § The shared pieces; the Components
// boards Rating, Tag, Facts, Json, FilterBar, Stack, Waiting). Each emits its board's markup.

const html = <P extends object>(type: ComponentType<P>, props: P) =>
  renderToStaticMarkup(createElement(type, props));

const ABSENT =
  '<span class="absent"><span aria-hidden="true">—</span><span class="sr-only">Not recorded</span></span>';

describe("Rating (F122)", () => {
  it("draws feedback_value 1, 2 and null as Liked, Disliked and Unrated", () => {
    expect(html(Rating, { value: 1 })).toBe(
      '<span class="rating rating-liked">Liked</span>',
    );
    expect(html(Rating, { value: 2 })).toBe(
      '<span class="rating rating-disliked">Disliked</span>',
    );
    expect(html(Rating, { value: null })).toBe(
      '<span class="rating rating-unrated">Unrated</span>',
    );
  });
});

describe("Json (F126)", () => {
  it("draws no block for an empty object, an empty array or null", () => {
    for (const value of [{}, [], null, undefined])
      expect(html(Json, { label: "Attributes", value })).toBe("");
  });

  it("draws a focusable region, named, holding the value indented by two", () => {
    const out = html(Json, {
      label: "Trigger metadata",
      value: { control: "thumbs_down", shown_for_ms: 8420 },
    });
    expect(out).toBe(
      '<div class="json" tabindex="0" role="region" aria-label="Trigger metadata"><pre>{\n  &quot;control&quot;: &quot;thumbs_down&quot;,\n  &quot;shown_for_ms&quot;: 8420\n}</pre></div>',
    );
  });
});

describe("Absent and Tags (F124, F125)", () => {
  it("draws the dash with words for a screen reader", () => {
    expect(html(Absent, {})).toBe(ABSENT);
  });

  it("draws the caller's words as tags, Korean marked, and the dash for none", () => {
    expect(html(Tags, { tags: ["search", "검색 품질"] })).toBe(
      '<ul class="tags"><li class="tag">search</li><li class="tag" lang="ko">검색 품질</li></ul>',
    );
    expect(html(Tags, { tags: [] })).toBe(ABSENT);
  });
});

describe("Facts, Fact and KeepLines (F127)", () => {
  it("draws label over value in the grid, the dash for an absent value", () => {
    const out = renderToStaticMarkup(
      createElement(
        Facts,
        null,
        createElement(Fact, { label: "Project" }, "platform"),
        createElement(Fact, { label: "Channel" }, null),
        createElement(Fact, { label: "Session" }, ""),
        createElement(
          Fact,
          { label: "Target text", wide: true, lang: "ko" },
          createElement(KeepLines, { text: "재생 속도 1.0×" }),
        ),
      ),
    );
    expect(out).toBe(
      '<dl class="facts is-grid">' +
        '<div class="fact"><dt>Project</dt><dd>platform</dd></div>' +
        `<div class="fact"><dt>Channel</dt><dd>${ABSENT}</dd></div>` +
        `<div class="fact"><dt>Session</dt><dd>${ABSENT}</dd></div>` +
        '<div class="fact is-wide"><dt>Target text</dt><dd lang="ko"><p class="keep-lines">재생 속도 1.0×</p></dd></div>' +
        "</dl>",
    );
  });

  it("draws the one text a page is for as the lead, keeping its lines", () => {
    expect(html(KeepLines, { text: "a\n\nb", lead: true, lang: "ko" })).toBe(
      '<p class="lead keep-lines" lang="ko">a\n\nb</p>',
    );
  });
});

describe("Waiting (F45, F344)", () => {
  it("is the dashed badge with its word in ink", () => {
    expect(html(Waiting, {})).toBe(
      '<span class="badge is-waiting is-ink">Waiting for sync</span>',
    );
  });
});

describe("FilterBar and Seg (F128, F141, F144)", () => {
  const projects = [
    { id: "p1", name: "platform" },
    { id: "p2", name: "vocky" },
  ];

  it("is a GET search form: the search, the project select, the rating toggles", () => {
    const out = html(FilterBar, {
      action: "/feedback",
      q: "search",
      projects,
      project: "p2",
      rating: "disliked",
      keep: { scope: "p9" },
    });
    const form = /^<form [^>]*>/.exec(out)![0];
    for (const attr of [
      'class="filterbar"',
      'role="search"',
      'aria-label="Search feedback"',
      'method="get"',
      'action="/feedback"',
    ])
      expect(form).toContain(attr);
    expect(out).toContain('<input type="hidden" name="scope" value="p9"/>');
    expect(out).toContain(
      '<div class="filterbar-search"><input class="input" type="search" aria-label="Search feedback" placeholder="e.g. 결제 or checkout" name="q" value="search"/><button type="submit" class="btn" value="disliked" name="rating">Search</button></div>',
    );
    expect(out).toContain(
      '<div class="select"><select class="input" aria-label="Project" name="project">',
    );
    expect(out).toContain('<option value="">All projects</option>');
    expect(out).toContain('<option value="p2" selected="">vocky</option>');
    expect(out).toContain('<div class="seg" role="group" aria-label="Rating">');
    const toggles = [
      ...out.matchAll(/<button type="submit" class="seg-item"[^>]*>([^<]*)</g),
    ].map((m) => [m[1], /aria-pressed="(\w+)"/.exec(m[0])![1]]);
    expect(toggles).toEqual([
      ["Any rating", "false"],
      ["Liked", "false"],
      ["Disliked", "true"],
    ]);
    // Search comes first, so Enter in the field submits through it
    expect(out.indexOf(">Search<")).toBeLessThan(out.indexOf("seg-item"));
  });

  it("leaves the project select out with a project picked in the Shell", () => {
    const out = html(FilterBar, { action: "/feedback", projects: null });
    expect(out).not.toContain("<select");
    expect(out).toMatch(/aria-pressed="true"[^>]*>Any rating</);
  });

  it("disables the whole bar, or none of it", () => {
    const off = html(FilterBar, {
      action: "/feedback",
      projects,
      disabled: true,
    });
    expect(
      off.match(/<(input|button|select)\b(?![^>]*type="hidden")/g),
    ).toHaveLength(6);
    expect(off.match(/ disabled=""/g)).toHaveLength(6);
    const on = html(FilterBar, { action: "/feedback", projects });
    expect(on).not.toContain("disabled");
  });

  it("tells a rating toggle from Search, which carries the rating's name too", () => {
    const button = (name: string | null) => ({ getAttribute: () => name });
    const search = button("rating");
    expect(isToggle(button("rating"), search, "rating")).toBe(true);
    expect(isToggle(search, search, "rating")).toBe(false);
    expect(isToggle(button(null), search, "rating")).toBe(false);
    expect(isToggle(null, search, "rating")).toBe(false);
    expect(isToggle(button("r"), null, "r")).toBe(true);
  });

  it("Seg draws a group of toggle buttons, the pressed one marked", () => {
    expect(
      html(Seg, {
        label: "Rating",
        value: "liked",
        options: [
          { value: "", label: "Any rating" },
          { value: "liked", label: "Liked" },
        ],
      }),
    ).toBe(
      '<div class="seg" role="group" aria-label="Rating"><button type="button" class="seg-item" aria-pressed="false" value="">Any rating</button><button type="button" class="seg-item" aria-pressed="true" value="liked">Liked</button></div>',
    );
  });
});

describe("StackTable and ClampLink (F130, F139, F140)", () => {
  it("wraps a table that stacks, its columns set", () => {
    expect(
      renderToStaticMarkup(
        createElement(StackTable, { set: true }, createElement("tbody")),
      ),
    ).toBe(
      '<div class="table-scroll table-stack"><table class="table stack-set"><tbody></tbody></table></div>',
    );
    expect(renderToStaticMarkup(createElement(StackTable, null))).toBe(
      '<div class="table-scroll table-stack"><table class="table"></table></div>',
    );
  });

  it("draws a row's message as its one link, cut at two lines", () => {
    expect(
      html(ClampLink, { href: "/feedback/f1", lang: "ko", children: "검색" }),
    ).toBe(
      '<a class="link-strong" lang="ko" href="/feedback/f1"><span class="clamp-2">검색</span></a>',
    );
  });
});
