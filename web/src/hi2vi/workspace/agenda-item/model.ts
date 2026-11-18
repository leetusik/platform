/**
 * An agenda item's page, as pure functions (design job 02, round 02-agenda-and-links: `AgendaItem.dc.html`,
 * `AgendaItemHead.dc.html`; frame.md F45, F301, F303, F309): what the page draws from its read and from the
 * changes it wrote that the workspace has not taken yet. No React and no I/O, so the server page, the client
 * page and the Node tests all import it.
 *
 * - `itemLines(item, workspace)`: the rows the page draws of other records: the item's phases in the backlog's
 *   order (the running one first, then newest first: the Workspace's own order) and its deferred jobs in the
 *   item's order. A phase or a job the Workspace does not hold is not drawn.
 * - `headActions(state)`: the head's buttons in F309's one order: **Delete, Edit, Defer, Drop, Solve** while the
 *   item is open or in progress; **Delete, Edit, Reopen** while it is deferred, solved or dropped.
 * - `itemView(read, overlay)`: the item as the page shows it, its state, the primary Solve (only while it is
 *   open and every linked phase is done), its marks (Waiting for sync, a refused change), its long facts and
 *   the Phases panel's form (rows, the command to plan one, or none on an ended item); null when this page
 *   deleted it.
 */

import { WS_ACTIONS } from "@/content/workspace/frame";
import {
  everyPhaseDone,
  itemState,
  langOf,
  phaseLookup,
} from "@/lib/workspace/model";
import { view, type Overlay } from "@/lib/workspace/optimistic";
import type {
  AgendaItem,
  ChangeKind,
  ItemState,
  JobRow,
  PhaseRow,
} from "@/lib/workspace/types";

/** A linked phase as the item's Phases panel draws it (F43, F39). */
export interface PhaseLine {
  id: string;
  short: string;
  name: string;
  lang: "en" | "ko";
  status: string | null;
  done: number;
  total: number;
  /** The slice being worked on, shown under the name while the phase is not done: `S4 Agenda and links`, or
   * its short id alone when the store has no name for it. */
  current: string | null;
  currentLang: "en" | "ko";
}

/** A deferred job as the item's Deferred jobs panel draws it (F43). */
export interface JobLine {
  id: string;
  title: string;
  lang: "en" | "ko";
  status: string | null;
  created: string | null;
}

/** What the page read: the item, and the rows of its phases and jobs. */
export interface ItemRead {
  item: AgendaItem;
  phases: PhaseLine[];
  jobs: JobLine[];
}

function currentLine(p: PhaseRow): string | null {
  const id = p.currentRef?.id ?? p.current;
  if (!id) return null;
  const name = p.currentRef?.name;
  return name ? `${id} ${name}` : id;
}

/** The rows of the item's phases (in the Workspace's order) and its jobs (in the item's order). */
export function itemLines(
  item: Pick<AgendaItem, "phases" | "deferred">,
  workspace: {
    phases: readonly PhaseRow[];
    deferred: readonly JobRow[];
  } | null,
): { phases: PhaseLine[]; jobs: JobLine[] } {
  if (!workspace) return { phases: [], jobs: [] };
  const linked = new Set(item.phases);
  const phases = workspace.phases
    .filter((p) => linked.has(p.id) || linked.has(p.short))
    .map((p) => ({
      id: p.id,
      short: p.short,
      name: p.name ?? p.id,
      lang: langOf(p.name),
      status: p.status,
      done: p.done,
      total: p.total,
      current: currentLine(p),
      currentLang: langOf(p.currentRef?.name),
    }));
  const jobs = item.deferred.flatMap((id) => {
    const j = workspace.deferred.find((row) => row.id === id);
    return j
      ? [
          {
            id: j.id,
            title: j.title ?? j.id,
            lang: j.lang === "ko" ? ("ko" as const) : ("en" as const),
            status: j.status,
            created: j.created,
          },
        ]
      : [];
  });
  return { phases, jobs };
}

/** A button of the item's head. */
export type HeadAction =
  "delete" | "edit" | "defer" | "drop" | "solve" | "reopen";

const SET_ASIDE: readonly ItemState[] = ["deferred", "solved", "dropped"];

/** Whether the item is set aside or ended: its head offers Reopen and it has no Defer, Drop or Solve. */
export function isSetAside(state: ItemState): boolean {
  return SET_ASIDE.includes(state);
}

/** The head's buttons for a state, in F309's order. */
export function headActions(state: ItemState): HeadAction[] {
  return isSetAside(state)
    ? ["delete", "edit", "reopen"]
    : ["delete", "edit", "defer", "drop", "solve"];
}

export interface ItemView {
  item: AgendaItem;
  status: ItemState;
  actions: HeadAction[];
  /** Every linked phase is done and the item is open: the sentence, and Solve is the primary button. */
  allDone: boolean;
  waiting: boolean;
  /** A change the workspace refused: what it said, and the entry Discard and Try again name. */
  refused: { said: string; entry: string } | null;
  /** Outcome (solved) or Reason (dropped), when the line is not empty. */
  end: { label: "outcome" | "reason"; text: string } | null;
  note: string | null;
  phases: PhaseLine[];
  jobs: JobLine[];
  /** The Phases panel: its rows, the command to plan one (no phase, not ended), or none (no phase, ended). */
  phasesPanel: "rows" | "command" | null;
}

/** The item as the page shows it: the read, with what the page wrote laid over it; null when it deleted it. */
export function itemView(read: ItemRead, overlay: Overlay): ItemView | null {
  const shown = view({ agenda: [read.item] }, overlay).agenda.find(
    (row) => row.id === read.item.id,
  );
  if (!shown) return null;
  const lookup = phaseLookup(read.phases);
  const status = itemState(shown, lookup);
  const ended = status === "solved" || status === "dropped";
  const endText =
    status === "solved"
      ? shown.outcome
      : status === "dropped"
        ? shown.reason
        : "";
  const sync = shown.sync;
  return {
    item: shown,
    status,
    actions: headActions(status),
    allDone:
      status === "open" &&
      read.phases.length > 0 &&
      everyPhaseDone({ phases: read.phases.map((p) => p.id) }, lookup),
    waiting: sync === "waiting",
    refused:
      sync !== null && typeof sync === "object"
        ? { said: sync.refused, entry: sync.entry }
        : null,
    end: endText
      ? { label: status === "solved" ? "outcome" : "reason", text: endText }
      : null,
    note: shown.note ? shown.note : null,
    phases: read.phases,
    jobs: read.jobs,
    phasesPanel: read.phases.length > 0 ? "rows" : ended ? null : "command",
  };
}

/** A change's own pending label, for Try again on the refused notice (F45: `Saving…` for an edit). */
export const PENDING_LABEL: Record<ChangeKind, string> = {
  add: WS_ACTIONS.add[1],
  edit: WS_ACTIONS.save[1],
  move: WS_ACTIONS.save[1],
  defer: WS_ACTIONS.defer[1],
  solve: WS_ACTIONS.solve[1],
  drop: WS_ACTIONS.drop[1],
  reopen: WS_ACTIONS.reopen[1],
  delete: WS_ACTIONS.delete[1],
};
