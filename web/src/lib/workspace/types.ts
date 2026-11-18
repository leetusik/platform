/**
 * The Workspace's read model, as the API's workspace routes answer it (`server/workspace_read.py`,
 * `server/workspace_web_api.py`): the shapes every Workspace page draws, typed once.
 *
 * A word the stored files do not hold is `null`, never made up (a stop's or a gate's own sentence,
 * the words that clear a gate). Dates are calendar days as the workspace wrote them (`2026-11-17`);
 * the sync line's `at` and an inbox entry's `created_at` are instants (`2026-11-17T09:12:00Z`).
 *
 * Deliberately free of `server-only`: pages read on the server, and client islands draw the same
 * shapes.
 */

/** How fresh the project's copy of its workspace is (F40). */
export type SyncState = "unlinked" | "never" | "fresh" | "behind";

export interface Sync {
  state: SyncState;
  /** The last landed batch (an instant), or null when nothing has landed. */
  at: string | null;
}

/** The Workspace's own sync facts, which every item route carries as `workspace`. */
export interface WorkspaceHead {
  /** The engine version the last batch named (`v97`'s number part as the engine writes it). */
  version: string | null;
  sync: Sync;
}

/** An item route's record: the record, with the Workspace's sync facts beside it. */
export type WithHead<T> = T & { workspace: WorkspaceHead };

// -- phases and slices ---------------------------------------------------------------------------

/** A phase's acceptance gate; `state` null when the phase has not declared it. */
export interface Gate {
  state: "not_required" | "required" | "open" | "cleared" | null;
  note: string | null;
  walkthrough: string[];
  words: string | null;
  /** The day it was cleared. */
  cleared: string | null;
}

export interface Review {
  verdict: string | null;
  note: string | null;
}

/** A pull request's state, as the engine last recorded it; null when it is not known. */
export type PullRequestState = "draft" | "open" | "merged" | "closed";

export interface PullRequest {
  /** From the URL's `/pull/<n>`; null when the URL names none. */
  number: number | null;
  state: PullRequestState | null;
  url: string;
}

export interface Branch {
  repo: string | null;
  branch: string | null;
  /** Null when no pull request was opened (no URL). */
  pr: PullRequest | null;
}

/**
 * A slice the Workspace names by id (a stream's or the pointer's slice, the next one, a stop's, a
 * phase row's current one), with its stored name and status: both null when the store has no
 * `slice.json` for it (draw the id alone then).
 */
export interface SliceName {
  /** The short id (`S2`). */
  id: string;
  /** The full id (`P8-q4.S2`). */
  full: string;
  name: string | null;
  status: string | null;
}

/** A phase as the Workspace lists it: no intent, notebook or slices. */
export interface PhaseRow {
  id: string;
  short: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  created: string | null;
  started: string | null;
  completed: string | null;
  archived: boolean;
  stream: string;
  done: number;
  total: number;
  /** The current slice's short id (`S2`), or null. */
  current: string | null;
  /** The current slice named, or null when there is none (absent from an older read). */
  currentRef?: SliceName | null;
  gate: Gate;
  review: Review;
  branches: Branch[];
  /** The agenda item the phase belongs to. */
  agenda: string | null;
}

/** A stop that waits on the operator; `what` is null (the store keeps no sentence). */
export interface Stop {
  kind: string | null;
  what: string | null;
  words: string | null;
  since: string | null;
}

/** A slice as a phase lists it: no plan or result. */
export interface SliceRow {
  /** The short id (`S1`, `DECOMP`, `REVIEW`). */
  id: string;
  /** The full id (`P8-q4.S1`). */
  full: string;
  phase: string;
  name: string | null;
  kind: string | null;
  status: string | null;
  risk: string | null;
  /** Short ids of the slices it depends on. */
  deps: string[];
  started: string | null;
  completed: string | null;
  outcome: string | null;
  stop: Stop | null;
}

export interface NotebookDecision {
  id: string;
  text: string;
  slice: string | null;
}

export interface NotebookQuestion {
  id: string;
  text: string;
  state: "open" | "resolved";
  answer: string;
}

export interface Notebook {
  now: string | null;
  decisions: NotebookDecision[];
  questions: NotebookQuestion[];
  docImpact: { slice: string | null; text: string }[];
  notes: { text: string }[];
  topics: { slug: string; gist: string | null }[];
}

/** One phase, with its intent, slices and notebook (`GET …/workspace/phases/{phase}`). */
export interface Phase extends PhaseRow {
  intent: { original: string | null; confirmed: string | null };
  slices: SliceRow[];
  notebook: Notebook | null;
  /** The phase's explaining document, by its title; null when the phase is not an explain phase. */
  explain: { title: string } | null;
}

/** A result's verdict block; a key the block does not carry is null. */
export interface Verdict {
  status: string | null;
  route: string | null;
  model: string | null;
  effort: string | null;
  summary: string | null;
  /** Stored prose (`files_changed`), never a count. */
  files: string | null;
  validation: string | null;
  deviations: string | null;
  docImpact: string | null;
}

/** One slice, with its plan and result (`GET …/workspace/slices/{full}`). */
export interface Slice extends Omit<SliceRow, "stop"> {
  plan: string | null;
  result: { verdict: Verdict; body: string } | null;
  stop: Stop | null;
}

// -- deferred jobs -------------------------------------------------------------------------------

export type JobStatus = "deferred" | "ready" | "promoted" | "done" | "dropped";

export interface JobRow {
  id: string;
  title: string | null;
  lang: "en" | "ko";
  status: JobStatus | string | null;
  source: string | null;
  trigger: string | null;
  created: string | null;
  reason: string | null;
  promotedTo: string | null;
  dropped: string | null;
  agenda: string | null;
}

/** One deferred job, with its brief (`GET …/workspace/deferred/{job}`). */
export interface Job extends JobRow {
  brief: string | null;
}

// -- docs ----------------------------------------------------------------------------------------

export interface DocVersion {
  /** The stored id's leading token (`v0002`, `v2611171507`): the address takes it. */
  version: string | null;
  /** Its place in the doc's history, 1 the oldest: the page draws `v<ordinal>`. */
  ordinal: number | null;
  date: string | null;
  summary: string | null;
}

export interface DocRow {
  id: string;
  title: string;
  state: "current" | "stale" | "retired";
  version: string | null;
  ordinal: number | null;
  versioned: string | null;
  /** The phases this version came from. */
  from: string[];
  /** The unpaid notes that name this doc, per phase. */
  stale: { phase: string; notes: number }[];
  /** Every other version, newest first. */
  versions: DocVersion[];
}

/** One doc at one version, with its sections (`GET …/workspace/docs/{doc}[?version=]`). */
export interface Doc extends DocRow {
  sections: { id: string; title: string; md: string }[];
}

// -- the agenda and the web's changes ------------------------------------------------------------

export type ItemState =
  "open" | "in_progress" | "deferred" | "solved" | "dropped";

/**
 * An item's mark from the web's changes: none, a change that waits for the next sync, or a change
 * the workspace refused (its line verbatim, the entry Discard and Try again name, and the change's
 * kind, which picks Try again's pending label; an older server names no kind).
 */
export type ItemSync =
  null | "waiting" | { refused: string; entry: string; kind?: ChangeKind };

export interface AgendaItem {
  id: string;
  title: string | null;
  lang: "en" | "ko";
  note: string;
  state: ItemState | string | null;
  created: string | null;
  changed: string | null;
  phases: string[];
  deferred: string[];
  outcome: string;
  reason: string;
  sync: ItemSync;
}

/** The kinds of change the web writes, each one engine agenda command. */
export type ChangeKind =
  "add" | "edit" | "move" | "defer" | "solve" | "drop" | "reopen" | "delete";

/** An inbox entry, as the write routes answer it. */
export interface InboxEntry {
  id: string;
  kind: ChangeKind;
  items: string[];
  fields: Record<string, unknown>;
  /** An add's minted id. */
  minted_id: string | null;
  state: "pending" | "applied" | "refused" | "discarded";
  reason: string | null;
  created_at: string;
}

/** An open web change no row carries (its items gone, or its refusal behind a newer change). */
export interface Unplaced {
  entry: string;
  kind: ChangeKind;
  items: string[];
  fields: Record<string, unknown>;
  sync: Exclude<ItemSync, null>;
  /** The engine's line on a refused change; null while it waits. */
  refused: string | null;
  created: string | null;
}

// -- the Workspace -------------------------------------------------------------------------------

export interface Stream {
  id: string;
  label: string | null;
  branch: string | null;
  phase: string | null;
  slice: string | null;
  /** The stream's slice named (absent from an older read). */
  sliceRef?: SliceName | null;
}

export interface Waiting {
  type: "stop" | "gate";
  phase: string;
  slice: string | null;
  kind: string | null;
  what: string | null;
  words: string | null;
  /** A stop's slice named; null for a gate (absent from an older read). */
  sliceRef?: SliceName | null;
}

export interface Pointer {
  phase: string | null;
  slice: string | null;
  next: string | null;
  /** `slice` and `next` named (absent from an older read). */
  sliceRef?: SliceName | null;
  nextRef?: SliceName | null;
  waiting: Waiting[];
}

/** `GET …/workspace` of a project with no linked workspace, or one that has not synced. */
export interface WorkspaceBase extends WorkspaceHead {
  project: string;
  linked: boolean;
}

/** `GET …/workspace` of a linked, synced project: lists only, no bodies. */
export interface Workspace extends WorkspaceBase {
  streams: Stream[];
  pointer: Pointer;
  phases: PhaseRow[];
  deferred: JobRow[];
  docs: DocRow[];
  retired: DocRow[];
  /** In the engine's listing order (the operator's), with this request's marks. */
  agenda: AgendaItem[];
  unplaced: Unplaced[];
}

// -- a write's answer ----------------------------------------------------------------------------

/** Why a write did not land, as the page shows it. */
export type WriteError =
  /** The signed title refusal (F45), verbatim: under the Title field. */
  | { reason: "title"; message: string }
  /** Another 422, the route's one line verbatim (`A7-m3 names no agenda item`). */
  | { reason: "refused"; message: string }
  /** A 409: the change is no longer open (or, on Try again, not refused); the route's line. */
  | { reason: "closed"; message: string }
  /** A 404: no linked workspace, another tenant's project, an entry the project does not hold. */
  | { reason: "not-found"; message: string | null }
  /** No session. */
  | { reason: "signed-out" }
  /** No answer the page can use: F45's `Could not … Try again.`. */
  | { reason: "failed" };

/** A write action's answer: the entry written (an add's minted id as `item`), or why not. */
export type WriteAnswer =
  | { ok: true; entry: InboxEntry; item: string | null }
  | ({ ok: false } & WriteError);
