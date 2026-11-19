/**
 * The Workspace's shared pure models: what more than one page derives from the read model, written
 * once. Nothing here reads, writes or formats a sync line (that is the frame's).
 *
 * - An agenda item's state (F301, the canvas's `WS.itemState`): deferred, solved and dropped are
 *   the item's own; otherwise In progress while a phase it holds is not done, else Open. A state
 *   the read model already derived as In progress stays so.
 * - An agenda item's end cell (F79): `1 of 4 phases done, 3 deferred jobs`, either part alone, or
 *   nothing.
 * - A phase's progress (F39): `1/7`, its track's name `1 of 7 slices done, 1 in progress` and one
 *   segment a slice.
 * - The open deferred jobs (F42: `12 open`, project home's `12 deferred`): status deferred or ready;
 *   and each status filter's count.
 * - A stale doc's notes (F42): `4 notes from P7-m3 and P8-q4`; a doc's `v<ordinal>`.
 * - Dates (F2) in the viewer's zone: `dates(timeZone)` binds the page's zone once.
 *
 * Deliberately free of `server-only`: server pages and client islands share it.
 */

import { date, plural, when, type FormatOptions } from "@/lib/format";

import type { JobFilter } from "./address";
import type { AgendaItem, DocRow, ItemState, JobRow, PhaseRow } from "./types";

// -- an agenda item --------------------------------------------------------------------------

/** A phase as an item's figures need it: its status. */
export type PhaseLookup = (id: string) => Pick<PhaseRow, "status"> | null;

/** A lookup over the Workspace's phase rows, by full or short id. */
export function phaseLookup(
  phases: readonly Pick<PhaseRow, "id" | "short" | "status">[],
): PhaseLookup {
  const byId = new Map<string, Pick<PhaseRow, "status">>();
  for (const p of phases) byId.set(p.id, p);
  for (const p of phases) if (!byId.has(p.short)) byId.set(p.short, p);
  return (id) => byId.get(id) ?? null;
}

const OWN_STATES: readonly string[] = ["deferred", "solved", "dropped"];

/**
 * The state an item reads: deferred, solved and dropped are its own (deferred wins over a running
 * phase, F301); In progress while a phase it holds is known and not done; else Open.
 */
export function itemState(
  item: Pick<AgendaItem, "state" | "phases">,
  phaseOf: PhaseLookup = () => null,
): ItemState {
  const state = item.state ?? "open";
  if (OWN_STATES.includes(state)) return state as ItemState;
  if (state === "in_progress") return "in_progress";
  return item.phases.some((id) => {
    const p = phaseOf(id);
    return p !== null && p.status !== "done";
  })
    ? "in_progress"
    : "open";
}

/** Whether an item has ended (Solved and dropped). */
export function isEnded(state: ItemState): boolean {
  return state === "solved" || state === "dropped";
}

export interface ItemEnd {
  /** The item's phases the Workspace holds, and how many of them are done. */
  phases: number;
  done: number;
  /** The deferred jobs it holds. */
  jobs: number;
  /** `1 of 4 phases done, 3 deferred jobs`; `''` when it holds neither. */
  text: string;
}

/** An open item's end cell (F79): how far its phases are, and its deferred jobs. */
export function itemEnd(
  item: Pick<AgendaItem, "phases" | "deferred">,
  phaseOf: PhaseLookup,
): ItemEnd {
  const known = item.phases
    .map((id) => phaseOf(id))
    .filter((p): p is Pick<PhaseRow, "status"> => p !== null);
  const done = known.filter((p) => p.status === "done").length;
  const jobs = item.deferred.length;
  const parts = [
    known.length ? `${done} of ${plural(known.length, "phase")} done` : "",
    jobs ? plural(jobs, "deferred job") : "",
  ].filter(Boolean);
  return { phases: known.length, done, jobs, text: parts.join(", ") };
}

/** Whether every phase the item holds is done (the item page's primary Solve). */
export function everyPhaseDone(
  item: Pick<AgendaItem, "phases">,
  phaseOf: PhaseLookup,
): boolean {
  const known = item.phases.map((id) => phaseOf(id));
  return (
    known.length > 0 && known.every((p) => p !== null && p.status === "done")
  );
}

// -- a phase -----------------------------------------------------------------------------------

export interface Progress {
  /** `1/7`. */
  count: string;
  /** The track's accessible name and the sentence: `1 of 7 slices done, 1 in progress`. */
  label: string;
  /** One a slice: `is-done`, `is-now` (the slice being worked on) or `''`. */
  segs: ("is-done" | "is-now" | "")[];
}

/** A phase's progress (F39): `live` while it is in progress with slices left. */
export function progress(
  phase: Pick<PhaseRow, "done" | "total" | "status">,
): Progress {
  const total = Math.max(0, Math.floor(phase.total));
  const done = Math.min(total, Math.max(0, Math.floor(phase.done)));
  const live = phase.status === "in_progress" && done < total;
  return {
    count: `${done}/${total}`,
    label: `${done} of ${plural(total, "slice")} done${live ? ", 1 in progress" : ""}`,
    segs: Array.from({ length: total }, (_, i) =>
      i < done ? "is-done" : live && i === done ? "is-now" : "",
    ),
  };
}

/** The longest total in a list of phases: the list's `--steps-n`, so segments share a width. */
export function longestTotal(
  phases: readonly Pick<PhaseRow, "total">[],
): number {
  return phases.reduce((n, p) => Math.max(n, p.total), 0);
}

// -- deferred jobs -----------------------------------------------------------------------------

const FILTER_STATUSES: Record<JobFilter, readonly string[]> = {
  open: ["deferred", "ready"],
  promoted: ["promoted"],
  dropped: ["dropped"],
  done: ["done"],
};

/** Whether a job is in a status filter's set (Open is deferred or ready). */
export function inFilter(
  job: Pick<JobRow, "status">,
  filter: JobFilter,
): boolean {
  return FILTER_STATUSES[filter].includes(job.status ?? "");
}

/** Each status filter's count. */
export function jobCounts(
  jobs: readonly Pick<JobRow, "status">[],
): Record<JobFilter, number> {
  const out: Record<JobFilter, number> = {
    open: 0,
    promoted: 0,
    dropped: 0,
    done: 0,
  };
  for (const job of jobs) {
    for (const filter of Object.keys(FILTER_STATUSES) as JobFilter[]) {
      if (inFilter(job, filter)) out[filter] += 1;
    }
  }
  return out;
}

/** The open deferred jobs (deferred or ready): `12 open`, project home's `12 deferred`. */
export function openJobs(jobs: readonly Pick<JobRow, "status">[]): number {
  return jobCounts(jobs).open;
}

// -- docs --------------------------------------------------------------------------------------

/** `P7-m3`, `P7-m3 and P8-q4`, `P6-b2, P7-m3 and P8-q4`. */
export function andList(ids: readonly string[]): string {
  if (ids.length < 2) return ids.join("");
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/** A stale doc's notes (F42): `4 notes from P7-m3 and P8-q4`; `''` when nothing waits. */
export function staleNotes(doc: Pick<DocRow, "stale">): string {
  if (doc.stale.length === 0) return "";
  const notes = doc.stale.reduce((n, x) => n + x.notes, 0);
  return `${plural(notes, "note")} from ${andList(doc.stale.map((x) => x.phase))}`;
}

/** A doc version as the pages write it (F42): `v14`; `—` when its place is not known. */
export function versionLabel(ordinal: number | null | undefined): string {
  return typeof ordinal === "number" && ordinal > 0 ? `v${ordinal}` : "—";
}

// -- dates -------------------------------------------------------------------------------------

export interface Dates {
  /** `Nov 13`, `Dec 9, 2025`; `—` for no date (a day not yet come: F42). */
  date(value: string | number | Date | null | undefined): string;
  /** `just now`, `12m ago`, …, then the date; `Never` for no time. */
  when(value: string | number | Date | null | undefined): string;
}

/**
 * F2's dates in the viewer's zone: `dates(viewerTimeZone(await cookies()))`. An instant turns into
 * the viewer's day; a calendar day (`2026-11-13`, as the workspace writes them) is read as written.
 * "This year" is the viewer's year.
 */
export function dates(timeZone: string, now?: number | Date): Dates {
  const options: FormatOptions = { timeZone, now };
  return {
    date: (value) =>
      value === null || value === undefined || value === ""
        ? "—"
        : date(value, options),
    when: (value) => when(value, options),
  };
}

/** Today's calendar day in a zone (`2026-11-18`): the day a change made now is written under. */
export function todayIn(
  timeZone: string,
  now: number | Date = Date.now(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// -- text --------------------------------------------------------------------------------------

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/** `ko` when a title holds Hangul, else `en` (the read model's own rule, for a change made here). */
export function langOf(title: string | null | undefined): "en" | "ko" {
  return title && HANGUL.test(title) ? "ko" : "en";
}
