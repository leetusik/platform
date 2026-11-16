"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";

import { SEND_FEEDBACK as T } from "@/content/send-feedback";
import { messageLength } from "@/lib/send-feedback/check";
import {
  sendLandingFeedback,
  sendOrgHomeFeedback,
  type SendFeedbackResult,
} from "@/lib/send-feedback/actions";

import {
  answerForm,
  canClose,
  closeForm,
  editForm,
  firstInvalid,
  initialFeedbackForm,
  noticeText,
  openForm,
  replyTo,
  showCount,
  submitForm,
  type FeedbackContext,
  type FeedbackForm,
} from "./model";
import "./send-feedback.css";

/**
 * The feedback control (job 08, round 01-landing-diagram-feedback, signed: `## Build` §2,
 * `SendFeedback.dc.html`, frame.md F400 to F408): one element, a trigger and the native modal
 * `<dialog class="dlg sf-dlg">`. A visitor's (the landing, `context="visitor"`) asks for an optional
 * email for a reply and carries the hidden `website` trap; a signed-in user's (org home,
 * `context="account"`) says `Sends as <email>.` and never has an email field.
 *
 * Mount it only where the server holds the control's key (F408): the page reads
 * `feedbackControl()` and passes `limit`. Opened with `showModal()`, closed with `close()` (Cancel,
 * Done, Escape), so focus returns to the trigger. Checked on Send only; Escape waits while a send
 * is in flight; what is typed is kept until it is sent or the page is left; the answer is reported
 * in the dialog, never a toast (F405).
 */
export interface SendFeedbackProps {
  context: FeedbackContext;
  /** The length cap, every `[LIMIT]` on screen. */
  limit: number;
  /** The session's email, for `account` only. */
  account?: string;
  /** The row's look: `lp-link lp-foot-send` on the landing, `btn` on org home. */
  triggerClassName: string;
}

export function SendFeedback({
  context,
  limit,
  account,
  triggerClassName,
}: SendFeedbackProps) {
  const [form, setForm] = useState<FeedbackForm>(initialFeedbackForm);

  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const trapRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  /** An answer lands only on the send that started it, and never after the control is gone. */
  const sendRef = useRef(0);
  /** The phase the last render showed, to know a server's `invalid` from the check's own. */
  const lastPhase = useRef(form.phase);

  const { phase } = form;
  const visitor = context === "visitor";
  const open = phase !== "closed";
  const sent = phase === "sent";

  function focusField(field: "message" | "email" | null) {
    if (field === "message") msgRef.current?.focus();
    else if (field === "email") emailRef.current?.focus();
  }

  // The dialog follows the phase: shown as a modal while open, focus in Message on opening.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      if (phase !== "sending") msgRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, phase]);

  // Sent: Done takes focus, described by the two lines.
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  // The server's `invalid`: the first field to put right takes focus once the fields are enabled.
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase !== "invalid" || was !== "sending") return;
    if (form.errors.message) msgRef.current?.focus();
    else if (form.errors.email) emailRef.current?.focus();
  }, [phase, form.errors]);

  // Gone (the page is left): an answer still on its way lands nowhere.
  useEffect(
    () => () => {
      sendRef.current += 1;
    },
    [],
  );

  async function send(draft: FeedbackForm) {
    const ticket = ++sendRef.current;
    let result: SendFeedbackResult;
    try {
      result = visitor
        ? await sendLandingFeedback({
            message: draft.message,
            ...(draft.email.trim() ? { email: draft.email } : {}),
            website: trapRef.current?.value ?? "",
          })
        : await sendOrgHomeFeedback({ message: draft.message });
    } catch {
      result = { status: "failed" };
    }
    if (ticket !== sendRef.current) return;
    setForm((current) => answerForm(current, context, result));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = submitForm(form, context, limit);
    if (next === form) return;
    setForm(next);
    if (next.phase === "invalid") {
      focusField(firstInvalid(next.errors));
      return;
    }
    void send(next);
  }

  /** Cancel and Done close the native way, so focus goes back to the trigger. */
  function close() {
    if (!canClose(form)) return;
    const el = dialogRef.current;
    if (el?.open) el.close();
    else setForm(closeForm);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="dialog"
        onClick={() => setForm(openForm)}
      >
        {T.trigger}
      </button>
      <dialog
        ref={dialogRef}
        className="dlg sf-dlg"
        aria-label={sent ? T.sentTitle : T.title}
        onCancel={(event) => {
          // A send in flight is not left (F406): Escape waits.
          if (!canClose(form)) event.preventDefault();
        }}
        onClose={() => {
          if (!canClose(form)) {
            // A repeated Escape a browser no longer lets a page cancel: the send is still not left.
            dialogRef.current?.showModal();
            return;
          }
          setForm(closeForm);
          const trigger = triggerRef.current;
          if (trigger && document.activeElement === document.body)
            trigger.focus();
        }}
      >
        {open ? (
          <FeedbackDialogContent
            context={context}
            limit={limit}
            account={account}
            form={form}
            uid={uid}
            msgRef={msgRef}
            emailRef={emailRef}
            trapRef={trapRef}
            doneRef={doneRef}
            onEdit={(field, value) => setForm((f) => editForm(f, field, value))}
            onSubmit={onSubmit}
            onClose={close}
          />
        ) : null}
      </dialog>
    </>
  );
}

export interface FeedbackDialogContentProps {
  context: FeedbackContext;
  limit: number;
  account?: string;
  form: FeedbackForm;
  /** The prefix of every id the dialog's parts name each other by. */
  uid: string;
  msgRef?: RefObject<HTMLTextAreaElement | null>;
  emailRef?: RefObject<HTMLInputElement | null>;
  trapRef?: RefObject<HTMLInputElement | null>;
  doneRef?: RefObject<HTMLButtonElement | null>;
  onEdit?: (field: "message" | "email", value: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onClose?: () => void;
}

/**
 * What the open dialog holds, top to bottom (§2): the form (title, the notice after a failed or
 * refused send, Message with its count, a visitor's email or the account line, Cancel then Send),
 * or the sent view (`Feedback sent`, its line, Done). Drawn from the form's state alone.
 */
export function FeedbackDialogContent({
  context,
  limit,
  account,
  form,
  uid,
  msgRef,
  emailRef,
  trapRef,
  doneRef,
  onEdit,
  onSubmit,
  onClose,
}: FeedbackDialogContentProps) {
  const id = (k: string) => `${uid}-${k}`;
  const { phase } = form;
  const visitor = context === "visitor";
  const busy = phase === "sending";

  if (phase === "sent") {
    const sentTo = replyTo(context, account, form.email);
    return (
      <div className="dlg-body">
        <h2 id={id("sent")}>{T.sentTitle}</h2>
        <p id={id("sent-text")}>{sentTo ? T.sentReply(sentTo) : T.sentPlain}</p>
        <div className="dlg-actions">
          <button
            ref={doneRef}
            type="button"
            className="btn"
            aria-describedby={`${id("sent")} ${id("sent-text")}`}
            onClick={onClose}
          >
            {T.done}
          </button>
        </div>
      </div>
    );
  }

  const notice = noticeText(phase, context);
  const countShown = showCount(form.message, limit);
  const msgError =
    form.errors.message === "empty"
      ? T.messageEmpty
      : form.errors.message === "too-long"
        ? T.messageLong(limit)
        : null;
  const emailError = form.errors.email ? T.emailNotOne : null;
  const msgDesc =
    [msgError ? id("msg-err") : "", countShown ? id("count") : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form className="dlg-body" noValidate onSubmit={onSubmit}>
      <h2>{T.title}</h2>
      {notice ? (
        <p className="notice notice-danger" role="alert">
          {notice}
        </p>
      ) : null}
      <div className="field">
        <div className="split baseline">
          <label className="label" htmlFor={id("msg")}>
            {T.message}
          </label>
          {countShown ? (
            <span className="meta" id={id("count")}>
              {T.count(messageLength(form.message), limit)}
            </span>
          ) : null}
        </div>
        <textarea
          ref={msgRef}
          className="input"
          id={id("msg")}
          rows={5}
          aria-required="true"
          aria-invalid={msgError ? "true" : undefined}
          aria-describedby={msgDesc}
          value={form.message}
          disabled={busy}
          onChange={(e) => onEdit?.("message", e.target.value)}
        />
        {msgError ? (
          <p className="field-error" id={id("msg-err")}>
            {msgError}
          </p>
        ) : null}
      </div>
      {visitor ? (
        <div className="field">
          <label className="label" htmlFor={id("email")}>
            {T.email}
          </label>
          <input
            ref={emailRef}
            className="input"
            id={id("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={emailError ? "true" : undefined}
            aria-describedby={emailError ? id("email-err") : id("email-hint")}
            value={form.email}
            disabled={busy}
            onChange={(e) => onEdit?.("email", e.target.value)}
          />
          {emailError ? (
            <p className="field-error" id={id("email-err")}>
              {emailError}
            </p>
          ) : (
            <span className="hint" id={id("email-hint")}>
              {T.optional}
            </span>
          )}
        </div>
      ) : (
        <p className="dim">{T.sendsAs(account ?? "")}</p>
      )}
      <div className="dlg-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          {T.cancel}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          data-busy={busy ? "true" : undefined}
          aria-busy={busy ? "true" : undefined}
        >
          <span className="swap">
            <span>{T.send}</span>
            <span>{T.sending}</span>
          </span>
        </button>
      </div>
      {visitor ? (
        // S2's trap for robots: off-screen, out of the tab order and hidden from assistive
        // technology, after every real control so the modal never focuses it first.
        <div className="sf-hp" aria-hidden="true">
          <input
            ref={trapRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
      ) : null}
    </form>
  );
}
