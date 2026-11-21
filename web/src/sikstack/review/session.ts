/**
 * Review's session on the page, as pure steps (job 07 `pages/review/result.md` § Behaviour; frame.md F223). No React
 * and no `"use client"`: the page (`review-frame.tsx`) applies each step's patch to its state and does what the step
 * says next (read the queue again, move the focus); the tests read them. The rules were the earlier page's
 * (`ReviewApp`, since removed), moved here unchanged (P64-3y.S7) so each can be proved alone:
 *
 *  - a rating sends with a fresh `review_id` (Try again repeats the failed one: `reviewIdFor`), and **the reply
 *    lands only on the rating that sent it** (`pending.seq`): a reply that comes back after another send began, or
 *    after the page moved on, changes nothing;
 *  - the counts are the server's, replaced by every reply; a card due again today goes to the queue's end
 *    (`landRating`); a suspend moves the counts by one, optimistically, until its reply;
 *  - Suspend card shows Card suspended with Undo (the page clears it after ten seconds); the next rating or suspend
 *    clears it; Undo puts the card back first, with its count.
 */
import { REVIEW } from "@/content/review";
import {
  reduce,
  fresh,
  responseOf,
  type ItemState,
  type QuizResponse,
} from "@/lib/reader/quiz";
import {
  adjustCounts,
  formatInterval,
  landRating,
  landSuspend,
  newId,
  reviewIdFor,
} from "@/lib/review/model";
import { specFor } from "@/lib/review/spec";
import type {
  ActionResult,
  QueueMeta,
  Rating,
  RateReply,
  ReviewCard,
  StatusReply,
} from "@/lib/review/types";

import type { Saved } from "./due-head";

export interface Sent {
  cardId: string;
  rating: Rating;
  reviewId: string;
}

export interface Pending extends Sent {
  seq: number;
}

export interface Toast {
  id: number;
  kind: "undo" | "retry";
  card: ReviewCard;
  text: string;
}

/** The part of the page's state the session's steps read and write. */
export interface Desk {
  queue: ReviewCard[];
  meta: QueueMeta;
  states: Record<string, ItemState>;
  pending: Pending | null;
  failed: Sent | null;
  saved: Saved | null;
  toast: Toast | null;
}

/** What `rateReviewCard` is given: the same input as it has always been. */
export interface RateSend {
  cardId: string;
  rating: Rating;
  reviewId: string;
  response: QuizResponse | undefined;
}

/** What the page does after a step: nothing more, read the queue again, or move the focus. */
export type Then = "none" | "reload" | "focus" | "focus-retry";

// --- rating -------------------------------------------------------------------------------------------

/**
 * A press of Next, a rating or Try again on the card at the queue's head: the send, and the state it starts
 * (the rating in flight; no failure; no toast). Null while a rating is in flight or with no card.
 */
export function rateStart(
  d: Desk,
  rating: Rating,
  seq: number,
  make: () => string = newId,
): {
  card: ReviewCard;
  send: RateSend;
  patch: Pick<Desk, "states" | "pending" | "failed" | "toast">;
} | null {
  const card = d.queue[0];
  if (!card || d.pending) return null;
  const spec = specFor(card);
  let st = d.states[card.card_id] ?? fresh();
  // Pressing a rating on a recall card also records the quiz's self-grade, so the margin marks it as the quiz does.
  if (spec && spec.type === "recall" && st.ph === "revealed") {
    st = reduce(spec, st, {
      t: "self",
      v: rating === "good" ? "got" : "missed",
    }).st;
  }
  const response =
    spec && st.ph === "graded" ? responseOf(spec, st) : undefined;
  const reviewId = reviewIdFor(d.failed, card.card_id, rating, make);
  return {
    card,
    send: { cardId: card.card_id, rating, reviewId, response },
    patch: {
      states: spec ? { ...d.states, [card.card_id]: st } : d.states,
      pending: { cardId: card.card_id, rating, reviewId, seq },
      failed: null,
      toast: null,
    },
  };
}

/**
 * A rating's reply. Null when it is not the reply of the rating in flight (stale: it lands nowhere). Saved: the card
 * leaves (or goes to the queue's end, due again today), the counts are the reply's, the head's saved line says the
 * rating and its interval, then the next card takes the focus (or the queue is read again when it ran out).
 */
export function rateLanded(
  d: Desk,
  sent: { card: ReviewCard; rating: Rating; reviewId: string; seq: number },
  res: ActionResult<RateReply>,
  now: string,
): { patch: Partial<Desk>; then: Then } | null {
  if (!d.pending || d.pending.seq !== sent.seq) return null;
  const { card, rating, reviewId } = sent;
  if (!res.ok) {
    if (res.gone) {
      // The card is not there any more (suspended elsewhere, or its document is gone).
      return {
        patch: {
          queue: d.queue.filter((c) => c.card_id !== card.card_id),
          pending: null,
        },
        then: "reload",
      };
    }
    return {
      patch: {
        pending: null,
        failed: { cardId: card.card_id, rating, reviewId },
      },
      then: "focus-retry",
    };
  }
  const reply = res.data;
  const landed = landRating(d.queue, card, reply);
  const states = { ...d.states };
  delete states[card.card_id];
  return {
    patch: {
      queue: landed.queue,
      states,
      pending: null,
      failed: null,
      meta: {
        ...d.meta,
        now,
        day: reply.day,
        counts: reply.counts,
        limit_reached: reply.limit_reached,
        next_due_at: reply.next_due_at,
      },
      saved: {
        word: REVIEW.head.saved,
        rest: REVIEW.head.savedRest(
          rating,
          formatInterval(reply.card.interval),
        ),
      },
    },
    then: landed.refetch ? "reload" : "focus",
  };
}

// --- suspend and undo -----------------------------------------------------------------------------------

export function suspendText(card: ReviewCard): string {
  return card.source === "highlight"
    ? REVIEW.suspend.highlight
    : REVIEW.suspend.done;
}

/** Whether Suspend card acts now: a card is shown and no rating is in flight. */
export function canSuspend(d: Desk): ReviewCard | null {
  const card = d.queue[0];
  return card && !d.pending ? card : null;
}

/** Suspend card: the card leaves at once, its count drops by one, and Card suspended offers Undo. */
export function suspendStart(
  d: Desk,
  card: ReviewCard,
  toastId: number,
): Pick<Desk, "queue" | "meta" | "toast" | "failed"> {
  return {
    queue: d.queue.filter((c) => c.card_id !== card.card_id),
    meta: { ...d.meta, counts: adjustCounts(d.meta.counts, card, -1) },
    toast: { id: toastId, kind: "undo", card, text: suspendText(card) },
    failed: null,
  };
}

/** A suspend's reply: the server's counts; or, not suspended, the card back first with the failed notice. */
export function suspendLanded(
  d: Desk,
  card: ReviewCard,
  res: ActionResult<StatusReply>,
  toastId: number,
): { patch: Partial<Desk> | null; then: Then } {
  if (res.ok) {
    const reply = res.data;
    const landed = landSuspend(d.queue, reply);
    return {
      patch: {
        queue: landed.queue,
        meta: {
          ...d.meta,
          day: reply.day,
          counts: reply.counts,
          limit_reached: reply.limit_reached,
          next_due_at: reply.next_due_at,
        },
      },
      then: landed.refetch ? "reload" : "none",
    };
  }
  if (res.gone) return { patch: null, then: "reload" };
  return {
    patch: {
      queue: [card, ...d.queue.filter((c) => c.card_id !== card.card_id)],
      meta: { ...d.meta, counts: adjustCounts(d.meta.counts, card, 1) },
      toast: {
        id: toastId,
        kind: "retry",
        card,
        text: REVIEW.suspend.failed,
      },
    },
    then: "focus",
  };
}

/** Undo: the suspended card comes back first, with its count; the toast goes. Null with nothing to undo. */
export function undoStart(
  d: Desk,
): { card: ReviewCard; patch: Pick<Desk, "queue" | "meta" | "toast"> } | null {
  const card = d.toast?.card;
  if (!card) return null;
  return {
    card,
    patch: {
      queue: [card, ...d.queue.filter((c) => c.card_id !== card.card_id)],
      meta: { ...d.meta, counts: adjustCounts(d.meta.counts, card, 1) },
      toast: null,
    },
  };
}

/** Undo's reply: the server's counts; or, still suspended there, the card out again and Card suspended again. */
export function undoLanded(
  d: Desk,
  card: ReviewCard,
  res: ActionResult<StatusReply>,
  toastId: number,
): { patch: Partial<Desk> | null; then: Then } {
  if (res.ok) {
    const reply = res.data;
    return {
      patch: {
        meta: {
          ...d.meta,
          day: reply.day,
          counts: reply.counts,
          limit_reached: reply.limit_reached,
          next_due_at: reply.next_due_at,
        },
      },
      then: "none",
    };
  }
  if (res.gone) return { patch: null, then: "reload" };
  return {
    patch: {
      queue: d.queue.filter((c) => c.card_id !== card.card_id),
      meta: { ...d.meta, counts: adjustCounts(d.meta.counts, card, -1) },
      toast: { id: toastId, kind: "undo", card, text: suspendText(card) },
    },
    then: "focus",
  };
}
