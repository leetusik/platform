"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { MARK_ROW } from "@/content/library-frame";

import {
  markActions,
  markFacts,
  markFailedLine,
  markLead,
  markUndoLine,
  markWord,
  UNDO_MS,
  type Mark,
  type MarkRowPhase,
} from "./mark-row-model";

/**
 * MarkRow (`MarkRow.dc.html`, frame.md F65, F95): one highlight, note or bookmark in a `.mark-list`
 * (the Notes sheet of a text, a book's notes). The first line is the way to the mark (`onOpen`); then
 * the note, then one line of facts (the word, the place, where it was made, `In review`). Its actions
 * sit at the row's end: **Delete**, or **Add label** / **Edit label** and **Remove** for a bookmark.
 *
 * Deleting never asks: `onDelete(id)` is heard at once and the row becomes one line saying what went
 * with it, with **Undo** (`onUndo(id)`), for ten seconds, then `onGone(id)`. A delete that fails (a
 * promise from `onDelete` or `onGone` that rejects) brings the row back with its failure line, and
 * `onUndo(id)`. A label is edited in place (`onLabel(id, text)`). `phase` forces a state; the row's own
 * presses move it from there. `place` is where the mark is (its section's title, `About 40% through`,
 * `Was in “Roles”`), in `placeLang` (the text's language for a mark made in the other one).
 */
export interface MarkRowProps {
  mark: Mark;
  place: string;
  placeLang?: string;
  phase?: MarkRowPhase;
  onOpen?: (mark: Mark) => void;
  onLabel?: (id: string, text: string) => void;
  onDelete?: (id: string) => void | Promise<unknown>;
  onUndo?: (id: string) => void;
  onGone?: (id: string) => void | Promise<unknown>;
}

export function MarkRow({
  mark: m,
  place,
  placeLang,
  phase: phaseProp,
  onOpen,
  onLabel,
  onDelete,
  onUndo,
  onGone,
}: MarkRowProps) {
  const [own, setOwn] = useState<MarkRowPhase | undefined>(undefined);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const fieldId = useId();
  const run = useRef(0);
  const phase = own ?? phaseProp ?? "rest";

  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const lead = markLead(m, place);
  const facts = markFacts(m, place);
  const actions = markActions(m, place);
  const bookmark = m.kind === "bookmark" || m.kind === "position";
  const factLang = placeLang ?? (m.state === "other" ? m.lang : "en");
  const nameLang = bookmark && m.label ? m.lang : factLang;

  const fail = (id: number) => {
    if (id !== run.current) return;
    setOwn("failed");
    onUndo?.(m.id);
  };
  const watch = (result: void | Promise<unknown>, id: number) => {
    if (result && typeof result.then === "function")
      result.then(undefined, () => fail(id));
  };
  const remove = () => {
    const id = ++run.current;
    setOwn("deleted");
    watch(onDelete?.(m.id), id);
    setTimeout(() => {
      if (id !== run.current) return;
      watch(onGone?.(m.id), id);
    }, UNDO_MS);
  };
  const undo = () => {
    run.current += 1;
    setOwn("rest");
    onUndo?.(m.id);
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = String(draft ?? m.label ?? "").trim();
    setOwn("rest");
    onLabel?.(m.id, text);
  };

  return (
    <div className="mark-row" role="listitem">
      {(phase === "rest" || phase === "failed") && (
        <>
          <div className="mark-main">
            {lead.canOpen && (
              <button
                type="button"
                className="mark-open"
                onClick={() => onOpen?.(m)}
              >
                {lead.quote !== null && (
                  <span className="mark-quote" lang={m.lang}>
                    “{lead.quote}”
                  </span>
                )}
                {lead.name !== null && (
                  <span className="strong" lang={nameLang}>
                    {lead.name}
                  </span>
                )}
              </button>
            )}
            {m.note && <p className="mark-note">{m.note}</p>}
            <p className="mark-meta meta">
              <span>{markWord(m)}</span>
              {facts.place !== null && (
                <span lang={factLang}>{facts.place}</span>
              )}
              {facts.made !== null && <span>{facts.made}</span>}
              {facts.review && <span>{MARK_ROW.inReview}</span>}
            </p>
            {phase === "failed" && (
              <p className="field-error" role="alert">
                {markFailedLine(m)}
              </p>
            )}
          </div>
          <div className="mark-actions">
            {actions.label !== null && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(m.label ?? "");
                  setOwn("editing");
                }}
              >
                {actions.label}
              </button>
            )}
            <button
              type="button"
              className="btn"
              aria-label={actions.removeAria}
              onClick={remove}
            >
              {actions.remove}
            </button>
          </div>
        </>
      )}
      {phase === "editing" && (
        <form className="form-row mark-form" onSubmit={save}>
          <div className="field">
            <label className="label" htmlFor={fieldId}>
              {MARK_ROW.label}
            </label>
            <input
              className="input"
              id={fieldId}
              type="text"
              maxLength={120}
              placeholder={MARK_ROW.labelPlaceholder}
              value={draft ?? m.label ?? ""}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <button type="submit" className="btn">
            {MARK_ROW.saveLabel}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setOwn("rest");
              setDraft(undefined);
            }}
          >
            {MARK_ROW.cancel}
          </button>
        </form>
      )}
      {phase === "deleted" && (
        <p className="mark-undo" role="status">
          <span>{markUndoLine(m)}</span>
          <button type="button" className="btn" onClick={undo}>
            {MARK_ROW.undo}
          </button>
        </p>
      )}
    </div>
  );
}
