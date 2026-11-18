/**
 * Reorder (design job 02, `AgendaList.dc.html`, frame.md F302): the open part's rows move by their grip. Pure, so the
 * client list and the tests share it.
 *
 * - **Keyboard**: Space or Enter lifts the row; ArrowUp and ArrowDown move it one place (the list shows the order it
 *   would take, focus stays on its grip); Space or Enter puts it down; Escape, or Tab away, puts it back. Only a put
 *   down at another place writes: one `move`, before the item it now precedes (after the last one at the end).
 * - **Pointer and touch**: the row lifts once the pointer moves; it follows the pointer, and the rows between its
 *   place and the gap slide by its height; release puts it down at the gap; Escape or a cancelled pointer puts it back.
 * - Each step is said in the list's status line.
 */
import { AGENDA } from "@/content/workspace/agenda";
import type { MovePlace } from "@/lib/workspace/rules";

/** A row lifted by the keyboard: its id and the place (0-based, among the open rows) it would take. */
export interface Lift {
  id: string;
  at: number;
}

/** The open rows in the order a lift would give them; unchanged with no lift (or one whose row is gone). */
export function liftedOrder<T extends { id: string }>(
  rows: readonly T[],
  lift: Lift | null,
): T[] {
  const from = lift ? rows.findIndex((r) => r.id === lift.id) : -1;
  if (!lift || from === -1) return [...rows];
  const moved = rows.filter((_, i) => i !== from);
  moved.splice(Math.min(Math.max(0, lift.at), moved.length), 0, rows[from]);
  return moved;
}

/**
 * The move that puts `id` at `at` (0-based) of the open order: before the item that then follows it, or after the
 * last one at the end. Null when it would not move.
 */
export function movePlace(
  order: readonly string[],
  id: string,
  at: number,
): MovePlace | null {
  const from = order.indexOf(id);
  if (from === -1 || at === from || at < 0 || at >= order.length) return null;
  const rest = order.filter((x) => x !== id);
  return at < rest.length
    ? { before: rest[at] }
    : { after: rest[rest.length - 1] };
}

/** What one step does: the lift after it, the status line, the move to write, and the grip to keep focused. */
export interface GripStep {
  lift: Lift | null;
  said: string | null;
  /** A put down at another place: the one `move` to write. */
  put: { id: string; place: MovePlace } | null;
  /** The grip that keeps the focus (the list re-orders under it). */
  focus: string | null;
}

/**
 * A key on a row's grip. `order` is the open order without the lift; `title` names an item. Null when the key is
 * not the grip's (it then does its default: Tab moves on, and the blur puts the row back).
 */
export function gripKey(
  order: readonly string[],
  title: (id: string) => string,
  lift: Lift | null,
  id: string,
  key: string,
): GripStep | null {
  const of = order.length;
  const from = order.indexOf(id);
  if (from === -1) return null;
  const here = lift !== null && lift.id === id;
  const t = title(id);
  if (key === " " || key === "Enter") {
    if (lift === null) {
      return {
        lift: { id, at: from },
        said: AGENDA.said.pickedUp(t, from + 1, of),
        put: null,
        focus: id,
      };
    }
    if (!here) return { lift, said: null, put: null, focus: null };
    const place = movePlace(order, id, lift.at);
    return {
      lift: null,
      said: place
        ? AGENDA.said.putDown(t, lift.at + 1, of)
        : AGENDA.said.putBack(t),
      put: place ? { id, place } : null,
      focus: id,
    };
  }
  if (!here) return null;
  if (key === "ArrowUp" || key === "ArrowDown") {
    const at = Math.min(
      Math.max(0, lift.at + (key === "ArrowUp" ? -1 : 1)),
      of - 1,
    );
    return at === lift.at
      ? { lift, said: null, put: null, focus: id }
      : {
          lift: { id, at },
          said: AGENDA.said.movedTo(t, at + 1, of),
          put: null,
          focus: id,
        };
  }
  if (key === "Escape") {
    return {
      lift: null,
      said: AGENDA.said.cancelled(t, from + 1, of),
      put: null,
      focus: id,
    };
  }
  return null;
}

/**
 * The lifted grip lost the focus (Tab away, a click elsewhere): the row goes back, unless the blur is the list
 * re-ordering under a step (`stepping`, the grip the step keeps focused), which the step focuses again.
 */
export function gripBlur(
  order: readonly string[],
  title: (id: string) => string,
  lift: Lift | null,
  id: string,
  stepping: string | null,
): GripStep | null {
  if (lift === null || lift.id !== id || stepping === id) return null;
  const from = order.indexOf(id);
  return {
    lift: null,
    said:
      from === -1
        ? null
        : AGENDA.said.cancelled(title(id), from + 1, order.length),
    put: null,
    focus: null,
  };
}

/** A pointer drag: the dragged row, where it started and where it would land, how far it moved, its height. */
export interface Drag {
  id: string;
  from: number;
  at: number;
  dy: number;
  h: number;
}

/** The pointer moves this far (px) before the row lifts: a press alone does not. */
export const DRAG_START = 4;

/**
 * Where a dragged row lands: the number of other rows whose middle is above the dragged row's middle. `mids` are
 * the rows' middles (px) when the drag started, in order.
 */
export function dragAt(
  mids: readonly number[],
  from: number,
  dy: number,
): number {
  const mid = mids[from] + dy;
  let at = 0;
  mids.forEach((m, i) => {
    if (i !== from && m < mid) at += 1;
  });
  return at;
}

/** How far (px) the row at `k` slides while `drag` is in motion: the dragged one follows the pointer. */
export function dragShift(k: number, drag: Drag | null): number {
  if (!drag) return 0;
  if (k === drag.from) return drag.dy;
  if (drag.from < drag.at && k > drag.from && k <= drag.at) return -drag.h;
  if (drag.at < drag.from && k >= drag.at && k < drag.from) return drag.h;
  return 0;
}
