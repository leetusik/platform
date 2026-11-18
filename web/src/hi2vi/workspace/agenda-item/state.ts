/**
 * An agenda item's page, its state as one reducer (design job 02, round 02-agenda-and-links: `AgendaItem.dc.html`
 * and its head and form boards; frame.md F45, F81, F303). Pure: the client page dispatches what happened and
 * sends the writes itself; the Node tests drive the same reducer.
 *
 * - **One form at a time** in the slot under the head (Edit, Solve, Drop): it opens from the head, whose
 *   actions are then away, and closes only by its own Cancel or its send. The first field takes the focus.
 * - **Sending:** every head button is disabled; the busy one shows its pending label. A form's send that
 *   answers the title refusal puts it under the field (focus back on it); one the route refused or found no
 *   longer open (a 409) shows the route's line over the fields; one that got no answer shows F45's
 *   `Could not … Try again.`; the form stays open with what was typed.
 * - **A write that landed** is laid over the read (`optimistic.ts`) and waits for sync; the focus goes to Edit
 *   after a save or a Reopen, to Reopen after a solve, a drop or a Defer.
 * - **Delete asks first**; after it the page says Item deleted (`gone`), whatever the next read says.
 * - **Try again and Discard** on a refused change: the old entry closes, Try again's new one waits; the notice
 *   that held the pressed button is gone, so the focus goes to Edit (F303's rule for a finished action).
 */

import {
  discarded,
  EMPTY_OVERLAY,
  reconcile,
  retried,
  written,
  type Overlay,
} from "@/lib/workspace/optimistic";
import { titleError } from "@/lib/workspace/rules";
import type {
  AgendaItem,
  ChangeKind,
  WriteAnswer,
} from "@/lib/workspace/types";

export type FormKind = "edit" | "solve" | "drop";
export type FormPhase = "rest" | "sending" | "title-error" | "send-failed";
/** What is being sent: a form, one of the head's buttons, the confirm's Yes, or the refused notice's buttons. */
export type Busy = "form" | "defer" | "reopen" | "delete" | "retry" | "discard";
/** What takes the focus next: a head button, or the open form's first field. */
export type FocusKey =
  "edit" | "solve" | "drop" | "reopen" | "defer" | "delete" | "first";

export interface Draft {
  title: string;
  note: string;
  line: string;
}

export interface PageState {
  overlay: Overlay;
  form: FormKind | null;
  phase: FormPhase;
  /** The route's own line over the form (a refusal, a change no longer open); null for F45's sentence. */
  notice: string | null;
  draft: Draft;
  busy: Busy | null;
  /** The Delete confirm is open. */
  asking: boolean;
  /** Honoured once: `n` grows with each request. */
  focus: { on: FocusKey; n: number } | null;
  /** The title of the item this page deleted: the page says Item deleted. */
  gone: string | null;
  /** The kind of each entry this page wrote, for Try again's pending label. */
  kinds: Record<string, ChangeKind>;
}

export const INITIAL: PageState = {
  overlay: EMPTY_OVERLAY,
  form: null,
  phase: "rest",
  notice: null,
  draft: { title: "", note: "", line: "" },
  busy: null,
  asking: false,
  focus: null,
  gone: null,
  kinds: {},
};

/** What a form sends, or null when its title is refused here first (the route's own check). */
export type FormSend =
  | { kind: "edit"; title: string; note: string }
  | { kind: "solve"; outcome: string }
  | { kind: "drop"; reason: string };

/** The form's send: the title and the note trimmed (F45), the line trimmed; null on the title refusal. */
export function formSend(form: FormKind, draft: Draft): FormSend | null {
  if (form === "edit") {
    if (titleError(draft.title) !== null) return null;
    return { kind: "edit", title: draft.title.trim(), note: draft.note.trim() };
  }
  return form === "solve"
    ? { kind: "solve", outcome: draft.line.trim() }
    : { kind: "drop", reason: draft.line.trim() };
}

export type PageEvent =
  /** A head button opens its form, with the item's values (Edit) or an empty line. */
  | { type: "open"; form: FormKind; item: Pick<AgendaItem, "title" | "note"> }
  | { type: "change"; field: keyof Draft; value: string }
  | { type: "cancel" }
  | { type: "submit" }
  /** Defer, Reopen, Yes delete, Try again or Discard was pressed. */
  | { type: "send"; busy: Exclude<Busy, "form"> }
  | { type: "ask" }
  | { type: "ask-cancel" }
  | {
      type: "answer";
      answer: WriteAnswer;
      timeZone: string;
      now?: number | Date;
      /** Try again: the refused entry it sent anew. */
      refusedEntry?: string;
      /** Delete: the item's title, for Item deleted. */
      title?: string;
    }
  /** A new read of the item. */
  | { type: "read"; item: AgendaItem };

function focusOn(state: PageState, on: FocusKey): PageState["focus"] {
  return { on, n: (state.focus?.n ?? 0) + 1 };
}

const AFTER: Record<Busy | FormKind, FocusKey | null> = {
  edit: "edit",
  solve: "reopen",
  drop: "reopen",
  form: null,
  defer: "reopen",
  reopen: "edit",
  delete: null,
  retry: "edit",
  discard: "edit",
};

export function reduce(state: PageState, event: PageEvent): PageState {
  switch (event.type) {
    case "open":
      if (state.busy || state.form || state.gone) return state;
      return {
        ...state,
        form: event.form,
        phase: "rest",
        notice: null,
        draft:
          event.form === "edit"
            ? { title: event.item.title ?? "", note: event.item.note, line: "" }
            : { title: "", note: "", line: "" },
        focus: focusOn(state, "first"),
      };
    case "change":
      if (state.phase === "sending") return state;
      return {
        ...state,
        draft: { ...state.draft, [event.field]: event.value },
        // a field error leaves when its field is edited (F22); a notice stays until the next send answers
        phase:
          event.field === "title" && state.phase === "title-error"
            ? "rest"
            : state.phase,
      };
    case "cancel":
      if (!state.form || state.phase === "sending") return state;
      return {
        ...state,
        form: null,
        phase: "rest",
        notice: null,
        focus: focusOn(state, state.form),
      };
    case "submit": {
      if (!state.form || state.busy) return state;
      if (formSend(state.form, state.draft) === null)
        return {
          ...state,
          phase: "title-error",
          focus: focusOn(state, "first"),
        };
      return { ...state, phase: "sending", busy: "form" };
    }
    case "send":
      if (state.busy || state.gone) return state;
      return { ...state, busy: event.busy };
    case "ask":
      if (state.busy || state.form) return state;
      return { ...state, asking: true };
    case "ask-cancel":
      if (state.busy === "delete") return state;
      return { ...state, asking: false };
    case "answer":
      return answer(state, event);
    case "read":
      return {
        ...state,
        overlay: reconcile(state.overlay, { agenda: [event.item] }),
      };
  }
}

function answer(
  state: PageState,
  event: Extract<PageEvent, { type: "answer" }>,
): PageState {
  const busy = state.busy;
  if (!busy) return state;
  const a = event.answer;
  const idle = { ...state, busy: null };
  if (!a.ok) {
    if (busy !== "form") return idle;
    if (a.reason === "title")
      return {
        ...idle,
        phase: "title-error",
        notice: null,
        focus: focusOn(state, "first"),
      };
    const line =
      (a.reason === "refused" ||
        a.reason === "closed" ||
        a.reason === "not-found") &&
      a.message
        ? a.message
        : null;
    return { ...idle, phase: "send-failed", notice: line };
  }
  const kinds = { ...state.kinds, [a.entry.id]: a.entry.kind };
  let overlay: Overlay;
  if (busy === "discard") overlay = discarded(state.overlay, a.entry);
  else if (busy === "retry" && event.refusedEntry)
    overlay = retried(
      state.overlay,
      event.refusedEntry,
      a.entry,
      event.timeZone,
      event.now,
    );
  else overlay = written(state.overlay, a.entry, event.timeZone, event.now);
  const next: PageState = { ...idle, overlay, kinds };
  if (busy === "form") {
    const form = state.form;
    return {
      ...next,
      form: null,
      phase: "rest",
      notice: null,
      focus: form ? focusOn(state, AFTER[form] as FocusKey) : state.focus,
    };
  }
  if (busy === "delete")
    return { ...next, asking: false, gone: event.title ?? "" };
  const after = AFTER[busy];
  return after ? { ...next, focus: focusOn(state, after) } : next;
}
