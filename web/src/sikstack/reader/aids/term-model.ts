/**
 * A term's window, as decisions (P63-fk.S10; job 03, Library round 02, `## Build` § Page: blocks *A term's
 * behaviour*, the signed record of `10-reading-aids`). Pure, so each rule is held by a test; the layer
 * (`./term-layer.tsx`) applies what a step returns to the page, literally:
 *
 * - **One window at a time**, in the text and in a legend: opening a term closes the one open.
 * - A click, tap, Enter or Space on a term opens its window with the focus in it; on the open term it closes it.
 * - A mouse resting 250 ms on a term opens its window without moving the focus; leaving for 200 ms closes a window
 *   a hover opened; a hover never replaces a clicked window. Under 40em of the reader (the sheet) hover opens
 *   nothing.
 * - Escape and **Close** close it and return the focus to its term; a press outside closes it, and the sheet's term
 *   takes the focus back unless the press took it.
 */

export type TermMode = "hover" | "focus";

export interface TermOpen<T> {
  term: T;
  mode: TermMode;
}

/** What the layer does: close `hide`'s window, open `show`'s, then put the focus on the term or in the window. */
export interface TermStep<T> {
  open: TermOpen<T> | null;
  hide: T | null;
  show: T | null;
  focus: "term" | "window" | null;
}

const stay = <T>(open: TermOpen<T> | null): TermStep<T> => ({
  open,
  hide: null,
  show: null,
  focus: null,
});

/** A click, tap, Enter or Space on `term`. */
export function termPress<T>(open: TermOpen<T> | null, term: T): TermStep<T> {
  if (open && open.term === term) {
    // A hover-opened window, clicked: it stays, as a clicked one, with the focus in it.
    if (open.mode === "hover")
      return {
        open: { term, mode: "focus" },
        hide: null,
        show: null,
        focus: "window",
      };
    return { open: null, hide: term, show: null, focus: null };
  }
  return {
    open: { term, mode: "focus" },
    hide: open ? open.term : null,
    show: term,
    focus: "window",
  };
}

/** A mouse rested on `term` (250 ms). `sheet`: the reader is under 40em. */
export function termRest<T>(
  open: TermOpen<T> | null,
  term: T,
  sheet: boolean,
): TermStep<T> {
  if (sheet) return stay(open);
  if (open && (open.term === term || open.mode !== "hover")) return stay(open);
  return {
    open: { term, mode: "hover" },
    hide: open ? open.term : null,
    show: term,
    focus: null,
  };
}

/**
 * The window closes: by Escape or **Close** (the focus returns to the term), a press outside (the sheet's term
 * takes it back), the mouse leaving a hover-opened window (only that one), or the focus landing elsewhere.
 */
export function termClose<T>(
  open: TermOpen<T> | null,
  how: "escape" | "close" | "outside" | "leave" | "away",
  sheet = false,
): TermStep<T> {
  if (!open) return stay(open);
  if (how === "leave" && open.mode !== "hover") return stay(open);
  const focus =
    how === "escape" || how === "close" || (how === "outside" && sheet)
      ? "term"
      : null;
  return { open: null, hide: open.term, show: null, focus };
}
