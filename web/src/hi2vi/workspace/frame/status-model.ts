import { WS_STATUS, type WsStatusKind } from "@/content/workspace/frame";

/** A status as a page draws it: the word, and the class to put on its `span` (frame.md F37). */
export interface WsStatusWord {
  word: string;
  cls: string;
}

/**
 * The word and the shape of a stored value (`WS.word(kind, value)`): a page puts `cls` on a `span` and never
 * retypes a row of F37's table. A value the table does not hold is said as written, in the plain dot; no value
 * is `null`, for the page to leave the status out.
 */
export function wsStatus(
  kind: WsStatusKind,
  value: string | null | undefined,
): WsStatusWord | null {
  if (value === null || value === undefined || value === "") return null;
  const known = Object.hasOwn(WS_STATUS[kind], value)
    ? WS_STATUS[kind][value]
    : null;
  return known
    ? { word: known[0], cls: known[1] }
    : { word: String(value), cls: "status" };
}
