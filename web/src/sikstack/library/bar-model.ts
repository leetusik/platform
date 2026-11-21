import { LANGUAGES } from "@/content/library-frame";

/**
 * The bar outside the Shell's logic (`Bar.dc.html`, frame.md F53, F59, F89, F100, F327), pure so a node
 * test reaches it.
 */
export type BarTool = "notes" | "ask" | "display";
export type BarViewer = "member" | "visitor";

/**
 * Ask is not shown until the assistant ships (operator decision 3 of P63-fk; P68-jf turns it on). When it
 * is, it is a signed-in member's only (frame.md F327): a visitor's bar never has it.
 */
export const ASK_SHOWN = false;

const ORDER: BarTool[] = ["notes", "ask", "display"];

/** The tools the bar draws, in the signed order (`notes ask display`), from a space list. */
export function barTools(
  tools: string | readonly string[] | undefined,
  viewer: BarViewer = "member",
): BarTool[] {
  const asked = new Set(
    (typeof tools === "string" ? tools.split(/\s+/) : (tools ?? [])).filter(
      Boolean,
    ),
  );
  return ORDER.filter(
    (tool) =>
      asked.has(tool) &&
      (tool !== "ask" || (ASK_SHOWN && viewer !== "visitor")),
  );
}

/** The language choice, only when the text has two or more (`EN`, `KO`, each named in full). */
export function barLanguages(
  langs: readonly string[] | undefined,
  lang: string | undefined,
): { code: string; short: string; name: string; pressed: boolean }[] {
  const list = langs ?? [];
  if (list.length < 2) return [];
  const on = lang ?? list[0];
  return list.map((code) => ({
    code,
    short: LANGUAGES[code]?.short ?? code.toUpperCase(),
    name: LANGUAGES[code]?.name ?? code,
    pressed: code === on,
  }));
}

/** The progress line's width, 0 to 100; `null` draws no line. */
export function barProgress(
  progress: number | null | undefined,
): number | null {
  if (progress === undefined || progress === null) return null;
  return Math.max(0, Math.min(100, Number(progress) || 0));
}

/** What the reader's scroll rule keeps between two scroll events. */
export interface BarScroll {
  hidden: boolean;
  /** The last scroll position seen. */
  last: number;
  /** How far the page has gone up since it last went down. */
  up: number;
}

/**
 * The reader's rule (frame.md F59): hide on the way down past 80 px; come back near the top (under
 * 80 px), at the page's end (within 8 px), or after 64 px up. `y` is the scroll position, `max` how far
 * the page can scroll.
 */
export function barScroll(state: BarScroll, y: number, max: number): BarScroll {
  let { hidden, up } = state;
  if (y < 80 || y >= max - 8) hidden = false;
  else if (y > state.last + 4) {
    hidden = true;
    up = 0;
  } else if (y < state.last) {
    up += state.last - y;
    if (up >= 64) hidden = false;
  }
  return { hidden, last: y, up };
}

/** How far the text has been read, as a whole percentage of the page's scroll (frame.md F59). */
export function readPercent(y: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(100, Math.round((100 * y) / max))) : 0;
}
