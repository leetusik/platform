import type { PlayerView } from "@/lib/listen/view";

import type { PlayerEvent } from "./press";

/**
 * Where the keyboard focus goes after a press in the opened player (frame.md F226: focus opens on Close, returns
 * to the dock, every control is reachable by Tab; a modal sheet keeps its focus inside itself). Pure: given the
 * press and the view the sheet draws after it. A press whose control is still drawn and enabled keeps its focus
 * (`null`); a press whose control left (a chapter row that became the current row's plain text, Previous at the
 * book's first chapter, Next at its last, a button the new state disables) sends the focus to the transport's main
 * button, or to Close when that button is disabled. Stop listening and Sign in leave the sheet (`null`: the sheet's
 * own close and the page's navigation place the focus). No `"use client"`: proved in node.
 */

/** A control the player draws (`./player-body`), named as a press names it. */
export type PlayerControl =
  | "play"
  | "back"
  | "fwd"
  | "seek"
  | "prev"
  | "next"
  | `row:${string}`
  | `speed:${number}`
  | "follow"
  | "action"
  | "stop";

/** The stable controls the focus falls back to inside the sheet. */
export type PressFocus = "play" | "close";

/** The control a press came from; null for a press that leaves the sheet. */
export function pressedControl(e: PlayerEvent): PlayerControl | null {
  switch (e.t) {
    case "play":
      return "play";
    case "skip":
      return e.by < 0 ? "back" : "fwd";
    case "seek":
      return "seek";
    case "step":
      return e.dir < 0 ? "prev" : "next";
    case "pick":
      return `row:${e.id}`;
    case "speed":
      return `speed:${e.v}`;
    case "follow":
      return "follow";
    case "action":
      return e.what === "update" ? "action" : null;
    case "stop":
      return null;
  }
}

/**
 * Whether the player body draws `c` as a control that can hold the focus (drawn and not disabled), exactly as
 * `PlayerBody` draws it: the main button unless signed out (`play-off`), −15, +15 and the seek bar while
 * seekable, Previous and Next on a book where that chapter exists, a row's button on a made chapter that is not
 * the current one, the zone's button while it has one; Speed, Follow along and Stop listening always.
 */
export function focusable(v: PlayerView, c: PlayerControl): boolean {
  if (c === "play") return v.lead !== "play-off";
  if (c === "back" || c === "fwd" || c === "seek") return v.seekable;
  if (c === "prev") return v.isBook && v.hasPrev;
  if (c === "next") return v.isBook && v.hasNext;
  if (c === "action") return v.action !== "";
  if (c.startsWith("row:")) {
    const id = c.slice(4);
    const row = v.isBook ? v.rows.find((r) => r.id === id) : undefined;
    return !!row && row.playable && !row.current;
  }
  return true;
}

/** After a press, the control that takes the focus: null keeps it where it is (the pressed control stayed). */
export function focusAfterPress(
  e: PlayerEvent,
  after: PlayerView,
): PressFocus | null {
  const c = pressedControl(e);
  if (c === null || focusable(after, c)) return null;
  return focusable(after, "play") ? "play" : "close";
}
