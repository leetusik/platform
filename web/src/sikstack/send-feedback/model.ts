// The feedback control's states (job 08, round 01-landing-diagram-feedback, `## Build` §2;
// `frame.md` F402 to F406; `SendFeedback.dc.html`'s logic), as pure steps the component runs and
// the tests prove without a DOM. The check is S2's own (`@/lib/send-feedback/check`), so the dialog
// says what the server would say.

import { SEND_FEEDBACK } from "@/content/send-feedback";
import {
  checkMessage,
  checkReplyEmail,
  messageLength,
  type SendFeedbackResult,
} from "@/lib/send-feedback/check";

/** Who sends: a visitor (the landing, with an optional reply email) or a signed-in user (org home). */
export type FeedbackContext = "visitor" | "account";

/** The §2 table's phases. `refused-site` is a visitor's only. */
export type FeedbackPhase =
  | "closed"
  | "open"
  | "invalid"
  | "sending"
  | "sent"
  | "failed"
  | "refused"
  | "refused-site";

/** The marks of the last check, one a field; a field's mark leaves when it is edited. */
export interface FeedbackErrors {
  message?: "empty" | "too-long";
  email?: "not-one";
}

export interface FeedbackForm {
  phase: FeedbackPhase;
  message: string;
  email: string;
  errors: FeedbackErrors;
}

export const initialFeedbackForm: FeedbackForm = {
  phase: "closed",
  message: "",
  email: "",
  errors: {},
};

/** The trigger: the dialog opens on the form as it was left (F406). */
export function openForm(form: FeedbackForm): FeedbackForm {
  return form.phase === "closed" ? { ...form, phase: "open" } : form;
}

/** The check, run on Send only (F404): the message, then a visitor's email. */
export function checkForm(
  context: FeedbackContext,
  form: Pick<FeedbackForm, "message" | "email">,
  limit: number,
): FeedbackErrors {
  const errors: FeedbackErrors = {};
  const message = checkMessage(form.message, limit);
  if (message) errors.message = message;
  if (context === "visitor" && checkReplyEmail(form.email))
    errors.email = "not-one";
  return errors;
}

function hasErrors(errors: FeedbackErrors): boolean {
  return Boolean(errors.message || errors.email);
}

/** Send: a form that fails the check is `invalid` with its marks; a sound one is `sending`. */
export function submitForm(
  form: FeedbackForm,
  context: FeedbackContext,
  limit: number,
): FeedbackForm {
  if (form.phase === "sending" || form.phase === "sent") return form;
  const errors = checkForm(context, form, limit);
  if (hasErrors(errors)) return { ...form, phase: "invalid", errors };
  return { ...form, phase: "sending", errors: {} };
}

/**
 * Typing: the draft changes and nothing is checked (F404). In `invalid` the edited field's mark
 * leaves; once none is left the form is plain again (`open`), as the canvas's `edit` does.
 */
export function editForm(
  form: FeedbackForm,
  field: "message" | "email",
  value: string,
): FeedbackForm {
  if (form.phase === "sending") return form;
  const next = { ...form, [field]: value };
  if (form.phase !== "invalid") return next;
  const errors = { ...form.errors };
  delete errors[field];
  return hasErrors(errors)
    ? { ...next, errors }
    : { ...next, phase: "open", errors: {} };
}

/** The first field to put right, or null. */
export function firstInvalid(
  errors: FeedbackErrors,
): "message" | "email" | null {
  if (errors.message) return "message";
  if (errors.email) return "email";
  return null;
}

/** The server's answer, landing only on the send that is still `sending`. */
export function answerForm(
  form: FeedbackForm,
  context: FeedbackContext,
  result: SendFeedbackResult,
): FeedbackForm {
  if (form.phase !== "sending") return form;
  switch (result.status) {
    case "sent":
      return { ...form, phase: "sent", errors: {} };
    case "refused":
      return { ...form, phase: "refused" };
    case "refused-site":
      // A signed-in user has no such state (§2): the account's refusal stands for it.
      return {
        ...form,
        phase: context === "visitor" ? "refused-site" : "refused",
      };
    case "invalid": {
      // The server's check maps to the same sentences, under the same field.
      const errors: FeedbackErrors =
        result.field === "email"
          ? context === "visitor"
            ? { email: "not-one" }
            : {}
          : {
              message: result.reason === "too-long" ? "too-long" : "empty",
            };
      return hasErrors(errors)
        ? { ...form, phase: "invalid", errors }
        : { ...form, phase: "failed", errors: {} };
    }
    default:
      return { ...form, phase: "failed", errors: {} };
  }
}

/** May the dialog close now? Never while a send is in flight: Escape waits (F406). */
export function canClose(form: FeedbackForm): boolean {
  return form.phase !== "sending";
}

/**
 * Closed (Cancel, Escape, Done): what was typed is kept until it is sent (F406); a sent message
 * empties the form. A send in flight is never left.
 */
export function closeForm(form: FeedbackForm): FeedbackForm {
  if (form.phase === "closed" || form.phase === "sending") return form;
  if (form.phase === "sent") return initialFeedbackForm;
  return { ...form, phase: "closed", errors: {} };
}

/** The notice at the top of the form after a send that failed or was refused (F405), or null. */
export function noticeText(
  phase: FeedbackPhase,
  context: FeedbackContext,
): string | null {
  if (phase === "failed") return SEND_FEEDBACK.failed;
  if (phase === "refused")
    return context === "visitor"
      ? SEND_FEEDBACK.refusedVisitor
      : SEND_FEEDBACK.refusedAccount;
  if (phase === "refused-site")
    return context === "visitor"
      ? SEND_FEEDBACK.refusedSite
      : SEND_FEEDBACK.refusedAccount;
  return null;
}

/** The count shows from nine tenths of the limit, and past it (F401). */
export function showCount(message: string, limit: number): boolean {
  return messageLength(message) >= limit * 0.9;
}

/** Where a reply would go: the account's address, or the visitor's typed one (trimmed), or none. */
export function replyTo(
  context: FeedbackContext,
  account: string | undefined,
  email: string,
): string {
  return context === "account" ? (account ?? "") : email.trim();
}
