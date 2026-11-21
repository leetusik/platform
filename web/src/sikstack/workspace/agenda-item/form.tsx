"use client";

import { useId } from "react";

import { AGENDA_ITEM_FORMS } from "@/content/workspace/agenda-item";
import { WS_ACTIONS, WS_CHANGE } from "@/content/workspace/frame";
import { Swap } from "@/sikstack/ui";
import { langOf } from "@/lib/workspace/model";

import type { Draft, FormKind, FormPhase } from "./state";

/**
 * The form in the slot under the head (`AgendaItemForm.dc.html`; frame.md F45, F80, F81): a `form.panel` named Edit
 * item, Solve item or Drop item, no visible head, the frame's measure wide at most.
 *
 * - **Edit**: Title, Note (optional), then Cancel and **Save** at the right end.
 * - **Solve** / **Drop**: one `.form-row`, Outcome (optional) or Reason (optional), Cancel and the primary button
 *   (Drop is primary, not danger: Reopen undoes it); under the field's width the two buttons wrap, right-aligned.
 * - The title refusal sits under the field (`aria-invalid`, `aria-describedby`); a send that failed is a danger
 *   notice over the fields (F45's sentence, or the route's own line); while sending, the fields and Cancel are
 *   disabled and the primary button shows its pending label at the same width.
 */
export function AgendaItemForm({
  kind,
  phase,
  notice,
  failed = phase === "send-failed",
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  kind: FormKind;
  phase: FormPhase;
  notice: string | null;
  /** The last send failed: its notice stays over the fields, through the next send, until that one answers. */
  failed?: boolean;
  draft: Draft;
  onChange: (field: keyof Draft, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const words = AGENDA_ITEM_FORMS[kind];
  const busy = phase === "sending";
  const titleError = kind === "edit" && phase === "title-error";
  const ids = {
    title: `${uid}-title`,
    note: `${uid}-note`,
    line: `${uid}-line`,
    error: `${uid}-error`,
  };
  const cancel = (
    <button
      type="button"
      className="btn"
      disabled={busy}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      {WS_ACTIONS.cancel}
    </button>
  );
  const submit = (
    <button
      type="submit"
      className="btn btn-primary"
      data-busy={busy ? "true" : undefined}
      aria-busy={busy ? true : undefined}
    >
      <Swap labels={[words.submit, words.pending]} />
    </button>
  );
  return (
    <form
      className="panel agendaitem-form"
      aria-label={words.name}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <div className="panel-body stack gap-3">
        {failed ? (
          <p className="notice notice-danger" role="alert">
            {notice ?? words.failed}
          </p>
        ) : null}
        {kind === "edit" ? (
          <>
            <div className="field">
              <label className="label" htmlFor={ids.title}>
                {WS_ACTIONS.title}
              </label>
              <input
                className="input"
                id={ids.title}
                type="text"
                autoComplete="off"
                lang={langOf(draft.title)}
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? ids.error : undefined}
                value={draft.title}
                disabled={busy}
                data-focus="first"
                onChange={(e) => onChange("title", e.target.value)}
              />
              {titleError ? (
                <p className="field-error" id={ids.error}>
                  {WS_CHANGE.titleError}
                </p>
              ) : null}
            </div>
            <div className="field">
              <label className="label" htmlFor={ids.note}>
                {WS_ACTIONS.note}
              </label>
              <textarea
                className="input"
                id={ids.note}
                rows={3}
                lang={langOf(draft.note)}
                value={draft.note}
                disabled={busy}
                onChange={(e) => onChange("note", e.target.value)}
              />
            </div>
            <div className="cluster to-end">
              {cancel}
              {submit}
            </div>
          </>
        ) : (
          <div className="form-row">
            <div className="field">
              <label className="label" htmlFor={ids.line}>
                {kind === "solve" ? WS_ACTIONS.outcome : WS_ACTIONS.reason}
              </label>
              <input
                className="input"
                id={ids.line}
                type="text"
                autoComplete="off"
                lang={langOf(draft.line)}
                value={draft.line}
                disabled={busy}
                data-focus="first"
                onChange={(e) => onChange("line", e.target.value)}
              />
            </div>
            <div className="cluster agendaitem-end">
              {cancel}
              {submit}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
