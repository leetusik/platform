import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlaceBar, SlotLine, SlotSave } from "@/sikstack/reader/marks/parts";
import { OldBodyContext, OldRoot } from "@/sikstack/reader/old-root";
import {
  layerHolderOf,
  readerTopH,
  SLOT_ORDER,
  slotLift,
  slotOf,
  slotWants,
  type LayerHolder,
  type SlotChild,
  type SlotHolder,
} from "@/sikstack/reader/slot";
import { DEFAULT_READER_SETTINGS } from "@/lib/reader-cookie";

// P64-3y.F4 — the reader's one slot above the foot bar (03-library frame.md F93; 07-listen-review frame.md F207:
// "the undo line, Sign in to save, the reader's resume pill, then Listen's pill. One thing at a time"), the dock
// under it (F208), and the reader's top bar's real height for the old islands. S14 found Listen's pill drawn on
// top of the place bar after a jump from the contents list: Listen's pill read the reader's resume pill alone.

const web = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(web, path), "utf8");
const noop = () => {};

/** The root element of a server render, as the slot host's first child (its classes and its role). */
function childOf(el: ReactElement): SlotChild {
  const html = renderToStaticMarkup(el);
  const tag = /^<[a-z]+([^>]*)>/.exec(html)?.[1] ?? "";
  const attr = (name: string) =>
    new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
  const classes = (attr("class") ?? "").split(/\s+/).filter(Boolean);
  return {
    classList: { contains: (name: string) => classes.includes(name) },
    getAttribute: attr,
  };
}

/** What the marks layer portals into the slot (`components/reader/annotations.tsx`'s `slot`), drawn by its parts. */
const LAYER: Record<LayerHolder, ReactElement> = {
  line: createElement(SlotLine, {
    text: "Highlight deleted.",
    action: { label: "Undo", onClick: noop },
  }),
  save: createElement(SlotSave, {
    what: "bookmarks",
    signInHref: "/sign-in?next=%2Fp%2Fp64-fid%2Fhandbook%2Fguide%2Fwrite-lock",
    onNotNow: noop,
  }),
  place: createElement(PlaceBar, {
    kind: "section",
    label: "How it works",
    lang: "en",
    bookmarked: false,
    onNote: noop,
    onBookmark: noop,
  }),
};

describe("the layer's part in the slot", () => {
  it("is read from the part the layer draws", () => {
    expect(layerHolderOf(childOf(LAYER.line))).toBe("line");
    expect(layerHolderOf(childOf(LAYER.save))).toBe("save");
    expect(layerHolderOf(childOf(LAYER.place))).toBe("place");
    // a bookmark of a position (a text with no sections) is the place bar too
    const position = createElement(PlaceBar, {
      kind: "position",
      label: "",
      lang: "en",
      bookmarked: true,
      onNote: noop,
      onBookmark: noop,
    });
    expect(layerHolderOf(childOf(position))).toBe("place");
    // a write's failure is the same status line, with Try again
    const failed = createElement(SlotLine, {
      text: "Could not save the note. Try again.",
      action: { label: "Try again", onClick: noop },
    });
    expect(layerHolderOf(childOf(failed))).toBe("line");
    expect(layerHolderOf(null)).toBeNull();
  });
});

/**
 * Each moment that brings something to the slot (rows), with what wants it then (the layer's part, the reader's
 * resume pill, Listen's pill: its head's control under the top bar, no sheet open), and the one holder the record
 * gives the slot.
 */
const MOMENTS: [
  string,
  { layer: LayerHolder | null; resume: boolean; listen: boolean },
  SlotHolder | null,
][] = [
  // S14's case: write-lock at 1440, How it works from the contents list, the head's Listen under the bar
  [
    "a jump from the contents list (S14)",
    { layer: "place", resume: false, listen: true },
    "place",
  ],
  [
    "a landing from a link (#id), the bars shown",
    { layer: "place", resume: false, listen: true },
    "place",
  ],
  [
    "a bookmark opened from Notes",
    { layer: "place", resume: false, listen: true },
    "place",
  ],
  [
    "Continue reading at a kept place",
    { layer: null, resume: true, listen: true },
    "resume",
  ],
  [
    "a highlight made, signed out",
    { layer: "save", resume: false, listen: false },
    "save",
  ],
  [
    "a highlight deleted (ten seconds of Undo)",
    { layer: "line", resume: false, listen: true },
    "line",
  ],
  [
    "a delete while the resume pill is up",
    { layer: "line", resume: true, listen: true },
    "line",
  ],
  [
    "a save offered while the resume pill is up",
    { layer: "save", resume: true, listen: true },
    "save",
  ],
  [
    "a scroll down: the bars hide, the place bar leaves",
    { layer: null, resume: false, listen: true },
    "listen",
  ],
  [
    "a sheet open (no place bar, no Listen's pill)",
    { layer: null, resume: false, listen: false },
    null,
  ],
  [
    "the head's control still on screen",
    { layer: "place", resume: false, listen: false },
    "place",
  ],
  ["nothing at all", { layer: null, resume: false, listen: false }, null],
];

describe("the slot (F93, F207)", () => {
  it("holds one thing at a time, in the record's order", () => {
    expect([...SLOT_ORDER]).toEqual([
      "line",
      "save",
      "resume",
      "place",
      "listen",
    ]);
    const got = MOMENTS.map(([moment, wants]) => [
      moment,
      slotOf(slotWants(wants)),
    ]);
    expect(got).toEqual(MOMENTS.map(([moment, , holder]) => [moment, holder]));
  });

  it("gives Listen's pill the slot only when nothing else wants it", () => {
    const layers: (LayerHolder | null)[] = [null, "line", "save", "place"];
    for (const layer of layers)
      for (const resume of [false, true]) {
        const holder = slotOf(slotWants({ layer, resume, listen: true }));
        expect(holder === "listen").toBe(layer === null && !resume);
      }
  });

  it("is what both reading pages give Listen's pill and the resume pill", () => {
    for (const page of [
      "src/sikstack/reader/chapter-reader.tsx",
      "src/sikstack/reader/document/document-reader.tsx",
    ]) {
      const src = read(page);
      expect(src, page).toMatch(/useLayerHolder\(slotHost\)/);
      expect(src, page).toMatch(
        /slotOf\(\s*slotWants\(\{\s*layer: layerHolder,\s*resume: pill,\s*listen: audioOn && past && sheet === null,\s*\}\),?\s*\)/,
      );
      // Listen's pill (in the dock's track) and the resume pill (in ReaderFoot) show only as the slot's holder
      expect(src, page).toMatch(
        /<ListenTrack[^>]*\spill=\{holder === "listen"\}/,
      );
      expect(src, page).toMatch(
        /<ReaderFoot[^>]*\spill=\{chrome\.foot\.pill && holder === "resume"\}/,
      );
      expect(src, page).not.toMatch(/listenPill/);
      expect(src, page).toMatch(/useSlotLift\(rootRef\)/);
    }
  });
});

describe("the slot on the dock (F208: the dock is under F207's slot)", () => {
  // a 900 px window at 1440: the foot bar 57 px, the place bar's bottom 12 px above it, the dock (66 px tall)
  // one foot bar up
  const win = 900;
  const holderBottom = win - (56 + 12);
  const dockTop = win - (56 + 1 + 8) - 66;

  it("raises the holder to stand on the dock with the gap between", () => {
    const lift = slotLift({ dockTop, holderBottom, gap: 8 });
    expect(lift).toBe(holderBottom - (dockTop - 8));
    expect(holderBottom - lift).toBe(dockTop - 8);
  });

  it("leaves it where it is with no dock, no holder, or room to spare", () => {
    expect(slotLift({ dockTop: null, holderBottom, gap: 8 })).toBe(0);
    expect(slotLift({ dockTop, holderBottom: null, gap: 8 })).toBe(0);
    expect(slotLift({ dockTop: 800, holderBottom: 700, gap: 8 })).toBe(0);
  });

  it("is a whole number of px", () => {
    expect(slotLift({ dockTop: 760.4, holderBottom: 832, gap: 8 })).toBe(80);
  });
});

describe("the reader's top bar's real height", () => {
  it("is the bar's height inside its rule, in whole px, or nothing while the bar has none", () => {
    expect(readerTopH(56)).toBe(56);
    expect(readerTopH(98)).toBe(98);
    expect(readerTopH(98.4)).toBe(98);
    expect(readerTopH(0)).toBeNull();
    expect(readerTopH(Number.NaN)).toBeNull();
  });

  it("reaches an old island's landing margin as its own bar's height", () => {
    // an island of the body (`<OldRoot still>`); its text is the third argument
    const ISLAND = { still: true } as Parameters<typeof OldRoot>[0];
    const render = (topH: number | null) =>
      renderToStaticMarkup(
        createElement(
          OldBodyContext.Provider,
          { value: { settings: DEFAULT_READER_SETTINGS, topH } },
          createElement(OldRoot, ISLAND, "x"),
        ),
      );
    expect(render(98)).toMatch(
      /class="rd-root[^"]*"[^>]*style="[^"]*--rd-top-h:98px/,
    );
    // until the bar is measured, the old sheet's own (3.5rem)
    expect(render(null)).not.toMatch(/--rd-top-h/);
  });
});
