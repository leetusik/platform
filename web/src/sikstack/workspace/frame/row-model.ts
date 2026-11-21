/**
 * A Workspace row's four layouts by its list's own width, in em so they follow enlarged text (frame.md F43;
 * `../../styles/workspace/frame.css`, its `@container` rules): under 22em one column, the id over the name;
 * 22em to 30em the status and the end cell under the name; 30em to 52em only the end cell under it; from 52em
 * one line.
 */
export const WS_ROW_BREAKS = [22, 30, 52] as const;

export type WsRowLayout =
  "one-column" | "status-under" | "end-under" | "one-line";

const LAYOUTS: WsRowLayout[] = [
  "one-column",
  "status-under",
  "end-under",
  "one-line",
];

/** The layout a list `width` em wide gives its rows. */
export function wsRowLayout(width: number): WsRowLayout {
  return LAYOUTS[WS_ROW_BREAKS.filter((b) => width >= b).length];
}
