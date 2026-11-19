import { noteKey, type NoteKey } from "./machine";
import { isListenPath } from "./paths";
import type { Listen } from "./types";

/**
 * P64-3y.F1 — leaving the Listen pages ends the Listen; its place is kept (job 07 frame.md F231; `Main.dc.html`'s
 * `leave` and `PLACED`). Pure, so it is proved in node; `ListenRoot` applies it on every move of the address
 * (a link, Back, Forward), the store's `listenActions.leave` carries it out.
 *
 *  - The Listen pages are `isListenPath`'s: a chapter, a document, the book page. A move between two of them keeps
 *    the Listen and its dock (F208); a move from one to any other page (the library, Review, Search, a project) ends it.
 *  - A Listen with a place (playing, paused, buffering, offline, the earlier version, playback stopped, signed
 *    out) that had moved past 0:00 ends as Stop listening does: the place is kept (`kept`, the `PUT` with `kept`)
 *    and the head offers Continue listening there.
 *  - Any other (still preparing, starting, finished, or at 0:00) ends keeping nothing.
 */

/** The states with a place (F231's list; `Main.dc.html`'s `PLACED`, `Listen.dc.html`'s `FOLLOWS`). */
export const PLACED: readonly NoteKey[] = [
  "playing",
  "paused",
  "buffering",
  "offline-play",
  "offline-stopped",
  "outdated",
  "fail-play",
  "fail-session",
];

/**
 * Past 0:00: a place of a second or more into the chapter (a book) or the document, the place Continue listening
 * would offer (`keptOf`'s `chPos`). Under a second reads `0:00`, as a saved place under a second offers nothing.
 */
const PAST = 1;

/** Whether a Listen keeps its place when it ends by leaving the Listen pages. */
export function keepsPlace(
  l: Pick<Listen, "state" | "old" | "chPos">,
): boolean {
  return PLACED.includes(noteKey(l.state, l.old)) && l.chPos >= PAST;
}

/** Whether a move of the address leaves the Listen pages (from one of them to any other page). */
export function leavesListen(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  return isListenPath(from ?? null) && !isListenPath(to ?? null);
}
