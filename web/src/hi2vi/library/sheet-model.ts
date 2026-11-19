/**
 * Which sheet is open (frame.md F61): one place for everything that opens over the text, **one at a
 * time**. A page holds one value, the open sheet's name or `null`, and passes `open={open === name}` to
 * each `Sheet`; opening a second sheet closes the first. Pure, so a node test reaches it.
 */
export type SheetAction<Name extends string> =
  | { type: "open"; name: Name }
  | { type: "close"; name?: Name }
  | { type: "toggle"; name: Name };

export function nextSheet<Name extends string>(
  open: Name | null,
  action: SheetAction<Name>,
): Name | null {
  switch (action.type) {
    case "open":
      return action.name;
    case "toggle":
      return open === action.name ? null : action.name;
    case "close":
      // A sheet's own close (Close, Escape, the scrim) closes it only if it is still the open one.
      return action.name === undefined || action.name === open ? null : open;
  }
}

/** The sides a sheet comes from (frame.md F61); under 40em of the app every sheet comes from the bottom. */
export type SheetSide = "start" | "end" | "bottom";

/** `.sheet` (the start side: Contents, Notes), `.sheet.at-end` (Version history, Display, Ask), `.sheet.is-bottom`. */
export function sheetClass(side: SheetSide): string {
  return side === "end"
    ? "sheet at-end"
    : side === "bottom"
      ? "sheet is-bottom"
      : "sheet";
}

/** A click on the scrim: the point lies outside the sheet's own box (the dialog fills its box, so a click inside is on its content). */
export function outsideBox(
  x: number,
  y: number,
  box: { left: number; top: number; right: number; bottom: number },
): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}
