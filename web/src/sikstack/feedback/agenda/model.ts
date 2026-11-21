/**
 * Add to agenda's rules (job 04 round 02, `FeedbackItemSend.dc.html`, `FeedbackItemAgenda.dc.html`;
 * frame.md F143, F341 to F344), pure so they can be tested without a DOM.
 *
 * - The page's state, in the board's order (`FB.canSend`, `FB.sent`): filed, else waiting, else not
 *   offered, else the add's phase.
 * - The add's phases: `rest` (the button), `confirm` (the dialog open), `adding` (in flight: Cancel
 *   disabled, Escape does nothing), `failed` (the dialog open with its notice), `added` (the head reads
 *   Added to agenda, the Agenda part shows the item).
 * - Focus: the dialog opens on Cancel; when it closes, focus goes to what stands at the head's end:
 *   the status after an add (the button is gone), else the button that opened it.
 */

import {
  notOfferedText,
  type AgendaItem,
  type AgendaOffer,
} from "@/lib/feedback/agenda";

export type AgendaPageState =
  | { kind: "filed"; item: AgendaItem }
  | { kind: "waiting"; item: AgendaItem }
  | { kind: "not-offered"; reason: "no-project" | "no-workspace"; text: string }
  | { kind: "offered"; project: string };

/** The page's state from `canAdd` and `sent`: filed, else waiting, else not offered, else offered. */
export function agendaPageState(
  offer: AgendaOffer,
  item: AgendaItem | null,
): AgendaPageState {
  if (item && item.sync === null) return { kind: "filed", item };
  if (item) return { kind: "waiting", item };
  if (!offer.offered)
    return {
      kind: "not-offered",
      reason: offer.reason,
      text: notOfferedText(offer),
    };
  return { kind: "offered", project: offer.project };
}

export type AddPhase = "rest" | "confirm" | "adding" | "failed" | "added";

/** The confirm is open. */
export function isOpen(phase: AddPhase): boolean {
  return phase === "confirm" || phase === "adding" || phase === "failed";
}

/** While the add is in flight, Cancel is disabled and Escape does nothing (F143). */
export function isLocked(phase: AddPhase): boolean {
  return phase === "adding";
}

/** The button opens the confirm. */
export function ask(phase: AddPhase): AddPhase {
  return phase === "rest" ? "confirm" : phase;
}

/** Cancel or Escape: closes the confirm, unless the add is in flight. */
export function cancel(phase: AddPhase): AddPhase {
  return phase === "confirm" || phase === "failed" ? "rest" : phase;
}

/** Add to agenda, in the confirm: the add starts (again, after a failure). */
export function send(phase: AddPhase): AddPhase {
  return phase === "confirm" || phase === "failed" ? "adding" : phase;
}

/** The add's answer: added, or the confirm stays open with its notice. */
export function answer(phase: AddPhase, ok: boolean): AddPhase {
  if (phase !== "adding") return phase;
  return ok ? "added" : "failed";
}

/**
 * Where focus goes when the confirm closes (F143): the status that took the button's place after an
 * add, else the button that opened it.
 */
export function focusBack<T>(status: T | null, button: T | null): T | null {
  return status ?? button;
}
