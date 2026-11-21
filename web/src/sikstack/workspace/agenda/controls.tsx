"use client";

import {
  type FocusEventHandler,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type Ref,
} from "react";

import { AGENDA } from "@/content/workspace/agenda";

import type { AgendaAct, PartPick } from "./select";

// The Agenda's reorder and picking controls (`AgendaList.dc.html`, frame.md F302, F303, F309): the grip, the boxes,
// the head's actions where it has room and the strip at the part's end where it has not. No state of their own.

/**
 * The grip (F302): a 44 px button with two bars drawn in CSS, named `Reorder: <title>` and described by the list's
 * hidden sentence; `aria-pressed` while its row is lifted. Pointer and touch drag from it (`touch-action: none` in the
 * sheet); the keyboard lifts with Space or Enter.
 */
export function Grip({
  title,
  howId,
  lifted,
  gripRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onKeyDown,
  onBlur,
}: {
  title: string;
  howId: string;
  lifted: boolean;
  gripRef?: Ref<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
  onLostPointerCapture?: PointerEventHandler<HTMLButtonElement>;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="agenda-grip"
      aria-label={AGENDA.grip.label(title)}
      aria-describedby={howId}
      aria-pressed={lifted}
      ref={gripRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
}

/** A row's box (F303): `label.check.agenda-check`, named `Select: <title>`. */
export function RowCheck({
  title,
  checked,
  onToggle,
}: {
  title: string;
  checked: boolean;
  onToggle?: () => void;
}) {
  return (
    <label className="check agenda-check">
      <input type="checkbox" checked={checked} onChange={() => onToggle?.()} />
      <span className="sr-only">{AGENDA.pick.row(title)}</span>
    </label>
  );
}

/**
 * The part's box over the rows' boxes (F303): checked when every row on screen is picked, half set
 * (`indeterminate`, a property only) when some are; named for the rows on screen.
 */
export function PartCheck({
  pick,
  boxRef,
  onToggle,
}: {
  pick: PartPick;
  boxRef?: (el: HTMLInputElement | null) => void;
  onToggle?: () => void;
}) {
  return (
    <label className="check agenda-check">
      <input
        type="checkbox"
        checked={pick.all}
        ref={(el) => {
          // A new callback each render, so it runs on every commit and the half state follows the picks.
          if (el) el.indeterminate = pick.some;
          boxRef?.(el);
        }}
        onChange={() => onToggle?.()}
      />
      <span className="sr-only">{pick.allLabel}</span>
    </label>
  );
}

function Acts({
  acts,
  className,
  onAct,
}: {
  acts: readonly AgendaAct[];
  className: string;
  onAct?: (kind: AgendaAct) => void;
}) {
  return (
    <div className={className}>
      {acts.map((kind) => (
        <button
          key={kind}
          type="button"
          className="btn"
          onClick={() => onAct?.(kind)}
        >
          {AGENDA.pick.acts[kind]}
        </button>
      ))}
    </div>
  );
}

/**
 * Where the head has room (52em of the part, F309): **Clear**, then the part's actions in Add item's place, on the
 * head's one line. Drawn only while rows are picked; the sheet shows it only from 52em.
 */
export function PartBar({
  pick,
  onClear,
  onAct,
}: {
  pick: PartPick;
  onClear?: () => void;
  onAct?: (kind: AgendaAct) => void;
}) {
  return (
    <>
      <button type="button" className="btn agenda-wide" onClick={onClear}>
        {AGENDA.pick.clear}
      </button>
      <Acts
        acts={pick.acts}
        className="cluster agenda-head-acts agenda-wide"
        onAct={onAct}
      />
    </>
  );
}

/**
 * Narrower (F309): the strip at the part's end, after its rows and its pager (`div.agenda-bulk`, a group named for
 * the part): the count and **Clear** on line one, the actions on line two ending on the part's edge. It sticks to the
 * window's foot while the part runs past it. Drawn only while rows are picked; the sheet hides it from 52em.
 */
export function BulkStrip({
  pick,
  onClear,
  onAct,
}: {
  pick: PartPick;
  onClear?: () => void;
  onAct?: (kind: AgendaAct) => void;
}) {
  return (
    <div className="agenda-bulk" role="group" aria-label={pick.bulkLabel}>
      <p className="meta agenda-bulk-count">{pick.count}</p>
      <button type="button" className="btn" onClick={onClear}>
        {AGENDA.pick.clear}
      </button>
      <Acts
        acts={pick.acts}
        className="cluster agenda-bulk-acts"
        onAct={onAct}
      />
    </div>
  );
}
