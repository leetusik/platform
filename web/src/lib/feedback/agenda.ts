/**
 * The agenda seam (P65-nh, operator decision 2; job 04 round 02, frame.md F341, F342; D237-we): the one
 * place the web decides whether a piece of feedback can be added to its project's agenda, reads what
 * it became, and files it. The platform has no agenda store yet, so today:
 *
 * - `canAdd` says not offered for every record: no project, or a project with no workspace linked;
 * - `sent` finds nothing;
 * - `fileAgendaItem`, the one write, is never reached from a page: it throws `AgendaUnavailableError`.
 *
 * The phase that gives a project a linked workspace and an agenda (P59-7s, the Workspace sync; P67-b1,
 * the Workspace pages) replaces these three bodies and keeps their signatures. The contract it fills:
 *
 * - `canAdd(record, project)`: offered (`{ offered: true, project }`) when the record's project has a
 *   linked workspace; else the two not-offered cases, in this order: no project, no workspace.
 * - `fileAgendaItem(record, project)`: files one agenda item in the record's project, **Open**, **first**
 *   in the operator's order, as `agendaFiling` builds it (title `itemTitle(message)`, note the message
 *   whole plus a link back to `/feedback/<id>`); mints its id where the agenda lives, `A<n>-<tail>`
 *   (`mintAgendaId`: the project's next agenda number, the tail `n1`, `n2`, … for each item the web
 *   added), the numbers unique per project; and returns the item (`AgendaItem`) with `state: 'open'`
 *   and `sync: 'waiting'`, so the page shows it at once with Waiting for sync until the workspace takes
 *   it. A failure before the item leaves the web throws (the confirm then reads its failed notice).
 * - `sent(record)`: the agenda item the record was filed as, with `sync: 'waiting'` until the workspace
 *   has it and `null` after; or `null` for none.
 * - Statuses: the store returns one of the Workspace's five (`AgendaStatus`); the page shows each in the
 *   Workspace's word and shape (`agendaStatus`). Deferred never reads Open.
 * - A refused sync (F45's notice with Try again and Discard) is the sync's, not this seam's (frame:N4).
 *
 * Pure and NOT `server-only`: the Agenda part's client island reads the status map and the types.
 */

import { AGENDA, AGENDA_STATUS_WORDS } from "@/content/feedback-agenda";
import type { StatusState } from "@/sikstack/ui/marks";
import { langOf } from "@/lib/feedback/lang";
import { feedbackItemHref } from "@/lib/feedback/place";
import type { Feedback } from "@/lib/feedback/types";

/** The record fields the seam reads. */
export type AgendaRecord = Pick<Feedback, "id" | "message" | "project_id">;

/** An agenda item's status: the Workspace's five (F37's `item` kind, F301's Deferred). */
export type AgendaStatus =
  "open" | "in_progress" | "deferred" | "solved" | "dropped";

/** The agenda item a piece of feedback became (F342). */
export interface AgendaItem {
  /** `A13-n1`: minted where the agenda lives, numbers unique per project. */
  id: string;
  /** The project's id. */
  project: string;
  /** `itemTitle(message)`; the workspace may rewrite it later. */
  title: string;
  /** The title's language (`langOf`): `ko` or `en`. */
  lang: string;
  state: AgendaStatus;
  /** When it was filed: an instant or a calendar date. */
  created: string;
  /** `waiting` until the workspace takes it at its next sync, then `null`. */
  sync: "waiting" | null;
  /** Where the Workspace shows the item (P67-b1's page): the Agenda part's title links there. */
  href: string;
}

/** Whether the add is offered for a record, and if not, why (F341). */
export type AgendaOffer =
  | { offered: true; project: string }
  | { offered: false; reason: "no-project" }
  | { offered: false; reason: "no-workspace"; project: string };

/**
 * Whether a record can be added to its project's agenda. `project` is the record's project's name (the
 * sentences and the confirm's title say it); with none known, its id stands in. Today no project has a
 * linked workspace, so the add is never offered.
 */
export function canAdd(
  record: Pick<Feedback, "project_id">,
  project?: string | null,
): AgendaOffer {
  if (!record.project_id) return { offered: false, reason: "no-project" };
  return {
    offered: false,
    reason: "no-workspace",
    project: project || record.project_id,
  };
}

/** The sentence a not-offered add reads in the Agenda part (F341). */
export function notOfferedText(
  offer: Extract<AgendaOffer, { offered: false }>,
): string {
  return offer.reason === "no-project"
    ? AGENDA.noProject
    : AGENDA.noWorkspace(offer.project);
}

/**
 * The agenda item a record became, or `null`. Today there is no agenda store, so always `null`.
 */
export function sent(record: Pick<Feedback, "id">): AgendaItem | null {
  void record;
  return null;
}

/** The Workspace's title limit (its F36: 1 to 200 characters). */
export const AGENDA_TITLE_MAX = 200;

/**
 * An agenda item's title (F342, the fixture's `FB.itemTitle`): the message's first line (the first one
 * with text), whole when it fits in 200 characters; else cut at the last word before the limit (or at
 * the limit when no word ends past its first 120 characters), trailing spaces and `,.;:` dropped, with
 * `…`. Never longer than 200.
 */
export function itemTitle(message: string): string {
  const line = String(message ?? "")
    .trim()
    .split(/\r?\n/)[0]
    .trim();
  if (line.length <= AGENDA_TITLE_MAX) return line;
  const cut = line.slice(0, AGENDA_TITLE_MAX - 1);
  const at = cut.lastIndexOf(" ");
  return (at > 120 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, "") + "…";
}

/** What one agenda item's status reads: the Workspace's word and its `Status` shape (F37). */
export interface AgendaStatusView {
  word: string;
  shape: StatusState;
}

/**
 * The Workspace's five statuses, each in its word and F37's shape: Open and Deferred the ring
 * (`status-idle`), In progress the accent dot (`status-live`), Solved the check (`status-done`), Dropped
 * the struck bar (`status-revoked`). Deferred is told from Open by its word.
 */
export const AGENDA_STATUS: Readonly<Record<AgendaStatus, AgendaStatusView>> =
  Object.freeze({
    open: { word: AGENDA_STATUS_WORDS.open, shape: "idle" },
    in_progress: { word: AGENDA_STATUS_WORDS.in_progress, shape: "live" },
    deferred: { word: AGENDA_STATUS_WORDS.deferred, shape: "idle" },
    solved: { word: AGENDA_STATUS_WORDS.solved, shape: "done" },
    dropped: { word: AGENDA_STATUS_WORDS.dropped, shape: "revoked" },
  });

export function agendaStatus(state: AgendaStatus): AgendaStatusView {
  return AGENDA_STATUS[state];
}

/**
 * The id the agenda mints for an item the web added (F342, the Workspace's F47): `next` the project's
 * next agenda number before any web addition, `webAdded` how many items the web added to that project
 * before this one. `mintAgendaId(13, 0)` is `A13-n1`, `mintAgendaId(13, 1)` `A14-n2`.
 */
export function mintAgendaId(next: number, webAdded: number): string {
  return `A${next + webAdded}-n${webAdded + 1}`;
}

/** What `fileAgendaItem` sends to the agenda: an Open item, first in the operator's order. */
export interface AgendaFiling {
  /** The project's id. */
  project: string;
  title: string;
  lang: string;
  /** The message, whole, then a link back to the piece of feedback. */
  note: string;
  /** The piece of feedback it came from. */
  from: string;
  state: "open";
  place: "first";
}

/** The filing for a record with a project (F342). */
export function agendaFiling(
  record: AgendaRecord & { project_id: string },
): AgendaFiling {
  const title = itemTitle(record.message);
  return {
    project: record.project_id,
    title,
    lang: langOf(title),
    note: `${record.message}\n\n${feedbackItemHref(null, record.id)}`,
    from: record.id,
    state: "open",
    place: "first",
  };
}

/** The add has nowhere to go: the platform has no agenda store yet (decision 2). */
export class AgendaUnavailableError extends Error {
  constructor() {
    super("No agenda store: a project cannot link a workspace yet.");
    this.name = "AgendaUnavailableError";
  }
}

/**
 * The one write: files `record` as an agenda item in its project and returns the item (the contract
 * above). Never reached today: `canAdd` offers no add, so no page mounts the control that would call it.
 * Until the store exists it throws `AgendaUnavailableError`.
 */
export async function fileAgendaItem(
  record: AgendaRecord,
  project?: string | null,
): Promise<AgendaItem> {
  void record;
  void project;
  throw new AgendaUnavailableError();
}
