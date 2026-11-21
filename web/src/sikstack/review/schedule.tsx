"use client";

import { useEffect, useId, useRef, type FormEvent } from "react";

import { REVIEW } from "@/content/review";
import { settingsErrors, type SettingsDraft } from "@/lib/review/model";

import type { SchedulePhase } from "./model";

/**
 * Schedule (`Schedule.dc.html`, job 07 frame.md F219): the body of Review settings, in the reader's sheet from the
 * end side. The lead; **Time zone** (a select of zones), **Reviews a day** (1 to 999) and **New highlights a day**
 * (0 to 999), each with its signed hint; the 04:00 note; **Save settings** (primary, `Saving…` in its width) and
 * **Cancel**. `phase`: `rest`; `invalid` (each bad field's error under its hint, the focus on the first);
 * `saving`; `failed` (the notice above the lead, the button reading **Try again**). The page holds the draft
 * (`onField`) and sends (`onSave`); a submit while saving does nothing.
 */
export interface ScheduleProps {
  draft: SettingsDraft;
  phase: SchedulePhase;
  /** Counts Save presses, so the focus follows each invalid attempt. */
  attempt: number;
  zones: readonly string[];
  onField: (key: keyof SettingsDraft, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function Schedule({
  draft,
  phase,
  attempt,
  zones,
  onField,
  onSave,
  onCancel,
}: ScheduleProps) {
  const S = REVIEW.settings;
  const uid = useId();
  const id = {
    tz: `${uid}-tz`,
    tzHint: `${uid}-tz-hint`,
    max: `${uid}-max`,
    maxHint: `${uid}-max-hint`,
    maxError: `${uid}-max-error`,
    nw: `${uid}-new`,
    nwHint: `${uid}-new-hint`,
    nwError: `${uid}-new-error`,
  };
  const formRef = useRef<HTMLFormElement>(null);
  const errs = settingsErrors(draft);
  const shown = phase === "invalid";
  const maxBad = shown && errs.max;
  const nwBad = shown && errs.maxNew;
  const failed = phase === "failed";

  useEffect(() => {
    if (phase !== "invalid") return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus({ preventScroll: true });
  }, [phase, attempt]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (phase !== "saving") onSave();
  };

  return (
    <form ref={formRef} className="schedule" noValidate onSubmit={submit}>
      {failed ? (
        <p className="notice notice-danger" role="alert">
          {S.notSaved}
        </p>
      ) : null}
      <p>{S.lead}</p>
      <div className="field">
        <label className="label" htmlFor={id.tz}>
          {S.timeZone}
        </label>
        <select
          id={id.tz}
          className="input"
          aria-describedby={id.tzHint}
          value={draft.tz}
          onChange={(e) => onField("tz", e.target.value)}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <p className="hint" id={id.tzHint}>
          {S.timeZoneHint}
        </p>
      </div>
      <div className="field">
        <label className="label" htmlFor={id.max}>
          {S.reviews}
        </label>
        <input
          id={id.max}
          className="input schedule-num"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft.max}
          aria-invalid={maxBad}
          aria-describedby={
            maxBad ? `${id.maxHint} ${id.maxError}` : id.maxHint
          }
          onChange={(e) => onField("max", e.target.value)}
        />
        <p className="hint" id={id.maxHint}>
          {S.reviewsHint}
        </p>
        {maxBad ? (
          <p className="field-error" id={id.maxError}>
            {S.reviewsError}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label className="label" htmlFor={id.nw}>
          {S.newHighlights}
        </label>
        <input
          id={id.nw}
          className="input schedule-num"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft.maxNew}
          aria-invalid={nwBad}
          aria-describedby={nwBad ? `${id.nwHint} ${id.nwError}` : id.nwHint}
          onChange={(e) => onField("maxNew", e.target.value)}
        />
        <p className="hint" id={id.nwHint}>
          {S.newHint}
        </p>
        {nwBad ? (
          <p className="field-error" id={id.nwError}>
            {S.newError}
          </p>
        ) : null}
      </div>
      <p className="meta">{S.day}</p>
      <div className="cluster">
        <button
          type="submit"
          className="btn btn-primary"
          data-busy={phase === "saving"}
          data-swap={failed}
        >
          <span className="swap">
            <span>{S.save}</span>
            <span>{failed ? S.tryAgain : S.saving}</span>
          </span>
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {S.cancel}
        </button>
      </div>
    </form>
  );
}
