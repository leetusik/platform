/**
 * P64-3y.F4 — the reader's one slot above the foot bar, and its top bar's real height, as pure rules.
 *
 * **The slot** (03-library frame.md F93, 07-listen-review frame.md F207): one slot above the foot bar holds one
 * thing at a time, in one order: the undo line (a delete's ten seconds, or a write's failure), Sign in to save, the
 * reader's resume pill (`Picked up where you left off`) or the place bar, then Listen's pill, last. The slot's
 * holders are drawn by three owners: the marks layer puts the undo line, Sign in to save and the place bar into
 * the frame's `.marks-slot` (and already keeps those three apart, its place bar yielding to the resume pill);
 * `ReaderFoot` draws the resume pill; the dock's track draws Listen's pill. `slotOf` is the one answer all three
 * read, so no two show at once whatever moment brings them (a jump from the contents list, a landing by address,
 * a bookmark, a highlight made, a scroll, a sheet, the bars hidden).
 *
 * **The dock** (F208) is not in that order: while a Listen is under way the track holds the dock in Listen's
 * pill's stead, and the dock stays. It stands "above the foot bar and under F207's slot", so whatever holds the
 * slot then stands on the dock, never on top of it (`slotLift`).
 *
 * **The top bar** (03-library F89): the reader's bar wraps to two rows (or three, a visitor's on a chapter in two
 * languages) on a narrow window. Its real height lives in one place, `--reader-top-h` on `.app.reader` (default
 * `--top-h`, the system's one-row bar), which every "below the reader's top bar" reads: the landing margins, the
 * side panel's sticky top. `--top-h` itself stays the system's one-row height (the foot bar, the sheets' heads and
 * the landing page read it too).
 */

/** What can hold the slot, in its order (F93, F207). */
export const SLOT_ORDER = [
  "line",
  "save",
  "resume",
  "place",
  "listen",
] as const;
export type SlotHolder = (typeof SLOT_ORDER)[number];

/** Which of the slot's holders want to show now. */
export type SlotWants = Record<SlotHolder, boolean>;

/** The one holder of the slot: the first in its order that wants to show, or nothing. */
export function slotOf(wants: SlotWants): SlotHolder | null {
  for (const holder of SLOT_ORDER) if (wants[holder]) return holder;
  return null;
}

/** What the marks layer can put in the frame's slot. */
export type LayerHolder = "line" | "save" | "place";

/** The element the layer has put in the slot host, as far as this rule reads it. */
export interface SlotChild {
  classList: { contains(name: string): boolean };
  getAttribute(name: string): string | null;
}

/**
 * Which holder the marks layer's part in the slot is (`@/hi2vi/reader/marks` parts): the place bar is
 * `div.pill.marks-place`, Sign in to save is the Library's `div.save`, the undo line is a `div.pill[role=status]`.
 */
export function layerHolderOf(child: SlotChild | null): LayerHolder | null {
  if (!child) return null;
  if (child.classList.contains("marks-place")) return "place";
  if (child.classList.contains("save")) return "save";
  if (
    child.classList.contains("pill") &&
    child.getAttribute("role") === "status"
  )
    return "line";
  return null;
}

/**
 * The wants of a reading page: the layer's part (if any), the reader's resume pill, and Listen's pill, which wants
 * to show once the head's control is under the top bar, with no sheet open and no Listen under way (the dock is
 * the track's then, `trackOf`).
 */
export function slotWants(p: {
  layer: LayerHolder | null;
  resume: boolean;
  listen: boolean;
}): SlotWants {
  return {
    line: p.layer === "line",
    save: p.layer === "save",
    resume: p.resume,
    place: p.layer === "place",
    listen: p.listen,
  };
}

/**
 * How far the slot's holder rises to stand on the dock (F208: the dock is under F207's slot), in whole px:
 * nothing with no dock or no holder, else enough to keep `gap` between the holder's bottom where it would stand
 * and the dock's top. Both are window positions (from the window's top), the holder's taken without the lift.
 */
export function slotLift(p: {
  dockTop: number | null;
  holderBottom: number | null;
  gap: number;
}): number {
  if (p.dockTop === null || p.holderBottom === null) return 0;
  return Math.max(0, Math.ceil(p.holderBottom - (p.dockTop - p.gap)));
}

/**
 * The reader's top bar's real height, as `--reader-top-h` takes it: the bar's height inside its rule (the one-row
 * bar's is `--top-h`, 56 px), in whole px; null while the bar has no height (not laid out, or not printed), so the
 * sheet's default (`--top-h`) holds.
 */
export function readerTopH(innerHeight: number): number | null {
  if (!(innerHeight > 0)) return null;
  return Math.round(innerHeight);
}
