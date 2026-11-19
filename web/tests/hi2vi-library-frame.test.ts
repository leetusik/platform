import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Bar } from "@/hi2vi/library/bar";
import { barTools } from "@/hi2vi/library/bar-model";
import { Choice } from "@/hi2vi/library/choice";
import { choicePressed } from "@/hi2vi/library/choice-model";
import { Pager } from "@/hi2vi/library/pager";
import {
  pageHref,
  pagerRange,
  pagerSlots,
  pagerWays,
} from "@/hi2vi/library/pager-model";
import { nextSheet } from "@/hi2vi/library/sheet-model";

// The Library's shared parts (job 03, Library round 02; frame.md F53, F58, F61, F325, F327; operator
// decision 3 of P63-fk: Ask is not shown until the assistant ships).

const show = (slots: (number | "gap")[]) =>
  slots.map((s) => (s === "gap" ? "…" : String(s))).join(" ");

describe("the pager's window (F325)", () => {
  it("shows every page when there are 7 or fewer", () => {
    for (let pages = 1; pages <= 7; pages++)
      for (let page = 1; page <= pages; page++)
        expect(pagerSlots(page, pages)).toEqual(
          Array.from({ length: pages }, (_, i) => i + 1),
        );
  });

  it("draws the signed seven places for each page of 10", () => {
    expect(
      Array.from({ length: 10 }, (_, i) => show(pagerSlots(i + 1, 10))),
    ).toEqual([
      "1 2 3 4 5 … 10",
      "1 2 3 4 5 … 10",
      "1 2 3 4 5 … 10",
      "1 2 3 4 5 … 10",
      "1 … 4 5 6 … 10",
      "1 … 5 6 7 … 10",
      "1 … 6 7 8 9 10",
      "1 … 6 7 8 9 10",
      "1 … 6 7 8 9 10",
      "1 … 6 7 8 9 10",
    ]);
  });

  it("keeps seven places, the first, the last and the current page, for 8 to 12 pages", () => {
    for (let pages = 8; pages <= 12; pages++)
      for (let page = 1; page <= pages; page++) {
        const slots = pagerSlots(page, pages);
        const where = `page ${page} of ${pages}`;
        expect(slots, where).toHaveLength(7);
        expect(slots[0], where).toBe(1);
        expect(slots[6], where).toBe(pages);
        expect(slots, where).toContain(page);
        // the numbers rise; a gap stands exactly where a run of pages is left out
        const nums = slots.filter((s): s is number => s !== "gap");
        for (let i = 1; i < slots.length; i++) {
          const [a, b] = [slots[i - 1], slots[i]];
          if (a !== "gap" && b !== "gap") expect(b, where).toBe(a + 1);
        }
        expect(
          nums.every((n, i) => i === 0 || n > nums[i - 1]),
          where,
        ).toBe(true);
        // the current page's neighbours are shown
        if (page > 1) expect(slots, where).toContain(page - 1);
        if (page < pages) expect(slots, where).toContain(page + 1);
      }
  });

  it("turns Previous off on the first page and Next on the last", () => {
    for (let pages = 1; pages <= 12; pages++)
      for (let page = 1; page <= pages; page++) {
        const ways = pagerWays(page, pages);
        expect(ways.previous).toBe(page === 1 ? null : page - 1);
        expect(ways.next).toBe(page === pages ? null : page + 1);
      }
  });

  it("links each number and way to ?page=n, keeping the list's query", () => {
    expect(pageHref(3)).toBe("?page=3");
    expect(
      pageHref(2, { view: "all", q: "web hook", filter: "", page: "9" }),
    ).toBe("?view=all&q=web+hook&page=2");
    expect(pagerRange(2, 25, 240)).toBe("26–50 of 240");
    expect(pagerRange(1, 25, 1554)).toBe("1–25 of 1,554");
  });

  it("renders disabled ends, the current page unlinked, the rest as links", () => {
    const html = (page: number) =>
      renderToStaticMarkup(
        createElement(Pager, {
          page,
          pages: 10,
          range: "x",
          label: "Pages of documents",
          query: { q: "a" },
        }),
      );
    const first = html(1);
    expect(first).toMatch(
      /<button type="button" class="btn pager-prev" aria-label="Previous" disabled="">/,
    );
    expect(first).toMatch(
      /<a class="btn pager-next" aria-label="Next" href="\?q=a&amp;page=2">/,
    );
    expect(first).toMatch(
      /<button type="button" class="btn pager-num" aria-current="page" aria-label="Page 1">1<\/button>/,
    );
    expect(first).toMatch(
      /<a class="btn pager-num" aria-label="Page 10" href="\?q=a&amp;page=10">10<\/a>/,
    );
    const last = html(10);
    expect(last).toMatch(
      /<button type="button" class="btn pager-next" aria-label="Next" disabled="">/,
    );
    expect(last).toMatch(
      /<a class="btn pager-prev" aria-label="Previous" href="\?q=a&amp;page=9">/,
    );
    const middle = html(5);
    expect(middle).not.toMatch(/disabled/);
    expect(middle.match(/aria-hidden="true">…<\/span>/g)).toHaveLength(2);
  });
});

describe("one sheet at a time (F61)", () => {
  it("closes the first sheet when a second opens", () => {
    let open = nextSheet<"contents" | "display">(null, {
      type: "open",
      name: "contents",
    });
    expect(open).toBe("contents");
    open = nextSheet(open, { type: "open", name: "display" });
    expect(open).toBe("display");
    expect(open === "contents").toBe(false);
  });

  it("closes only the open sheet on a sheet's own close", () => {
    expect(nextSheet("display", { type: "close", name: "contents" })).toBe(
      "display",
    );
    expect(nextSheet("display", { type: "close", name: "display" })).toBeNull();
    expect(nextSheet("display", { type: "close" })).toBeNull();
    expect(
      nextSheet("display", { type: "toggle", name: "display" }),
    ).toBeNull();
    expect(nextSheet("display", { type: "toggle", name: "notes" })).toBe(
      "notes",
    );
  });
});

describe("Choice (F58)", () => {
  const options = [
    { value: "project", content: "By project" },
    { value: "all", content: "All documents" },
    { value: "subject", content: "x" },
  ];

  it("presses exactly the chosen option", () => {
    for (const chosen of ["project", "all", "subject"]) {
      const pressed = choicePressed(options, chosen).filter((o) => o.pressed);
      expect(pressed.map((o) => o.value)).toEqual([chosen]);
    }
    expect(choicePressed(options, "none").some((o) => o.pressed)).toBe(false);
  });

  it("renders aria-pressed true on the chosen button only", () => {
    const html = renderToStaticMarkup(
      createElement(Choice<string>, { label: "View", options, value: "all" }),
    );
    expect(html).toMatch(
      /^<div class="choice" role="group" aria-label="View">/,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true">All documents</);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  });
});

describe("the bar outside the Shell (F53, F89, F327; decision 3)", () => {
  const asks = [
    "notes ask display",
    "ask",
    "ask notes",
    ["notes", "ask", "display"] as const,
    "display ask notes",
  ];

  it("draws no Ask whatever tools asks, for a member or a visitor", () => {
    for (const tools of asks)
      for (const viewer of ["member", "visitor"] as const)
        expect(barTools(tools, viewer)).not.toContain("ask");
    expect(barTools("display ask notes")).toEqual(["notes", "display"]);
  });

  it("renders no Ask button, while Notes and Display stay", () => {
    for (const viewer of ["member", "visitor"] as const) {
      const html = renderToStaticMarkup(
        createElement(Bar, {
          back: "The platform handbook",
          backShort: "Book",
          tools: "notes ask display",
          asking: true,
          viewer,
          langs: ["en", "ko"],
          lang: "ko",
          progress: 42,
        }),
      );
      expect(html).not.toMatch(/>Ask</);
      expect(html).toMatch(/>Notes</);
      expect(html).toMatch(/aria-label="Display"/);
      expect(html).toMatch(
        /aria-pressed="true" aria-label="한국어" lang="ko">KO</,
      );
      expect(html).toMatch(/<i style="width:42%"><\/i>/);
      expect(/>Sign in</.test(html)).toBe(viewer === "visitor");
    }
  });
});
