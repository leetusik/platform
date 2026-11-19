/**
 * The Deferred jobs list's rules (`DeferredList.dc.html`, `DeferredFilter.dc.html`; frame.md F300, F82), pure so a
 * node test reaches them. The page reads the Workspace once and the list derives everything else from its jobs:
 *
 * - **The search** is a case-blind match of the trimmed text in a job's id, title, source and trigger.
 * - **The status filter**: Open is the jobs whose status is `deferred` or `ready`; Promoted, Dropped and Done are
 *   their own. Without a search a choice's count is the jobs in that status; with one, the matches in it.
 * - **The filter holds still**: each choice's room for its count is as wide as the status's whole count (its
 *   count with no search), at least three figures (`3ch`, the sheet's), so a search that lowers a count never
 *   moves the choice, its word or the field beside it.
 * - **Pages** of 50, 1-based; a page past the last shows the last. A search or a status change goes to page 1.
 * - **The head's count**: `12 open`, with a search `10 of 229 open`.
 * - **The empty sentence** of each case.
 *
 * The list keeps the workspace's own order. Deliberately free of `server-only`: the page and its client island
 * share it.
 */
import { DEFERRED_LIST } from "@/content/workspace/deferred";
import { WS_PAGER, WS_STATES } from "@/content/workspace/frame";
import { num } from "@/lib/format";
import { JOB_FILTERS, type JobFilter } from "@/lib/workspace/address";
import { inFilter } from "@/lib/workspace/model";
import type { JobRow } from "@/lib/workspace/types";

/** Rows a page (F300). */
export const DEFERRED_PER = WS_PAGER.deferredJobs.per;

/** What the address holds of the list: the search as typed, the status, the page (1-based). */
export interface DeferredPlace {
  q: string;
  status: JobFilter;
  page: number;
}

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined | null): string | null {
  return typeof value === "string" ? value : null;
}

/** The list's place in an address (`?q=`, `?status=`, `?page=N`); anything else is its default. */
export function readDeferredPlace(
  search: Search | URLSearchParams,
): DeferredPlace {
  const get = (key: string) =>
    search instanceof URLSearchParams ? search.get(key) : one(search[key]);
  const status = get("status");
  const page = get("page");
  return {
    q: get("q") ?? "",
    status: (JOB_FILTERS as readonly string[]).includes(status ?? "")
      ? (status as JobFilter)
      : "open",
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

/** Whether a job holds the search (already trimmed and lowered); no search holds every job. */
export function jobMatches(
  job: Pick<JobRow, "id" | "title" | "source" | "trigger">,
  needle: string,
): boolean {
  if (!needle) return true;
  return [job.id, job.title, job.source, job.trigger]
    .map((part) => part ?? "")
    .join("\n")
    .toLowerCase()
    .includes(needle);
}

export type FilterCounts = Record<JobFilter, number>;

const zero = (): FilterCounts => ({
  open: 0,
  promoted: 0,
  dropped: 0,
  done: 0,
});

/** One choice of the status filter, as `DeferredFilter` draws it. */
export interface FilterChoice {
  key: JobFilter;
  /** `Open`. */
  label: string;
  /** The count on show; `null` while the list loads (a bar in its room). */
  count: string | null;
  /** The widest the count can read: the room it ends, kept by a hidden copy. */
  room: string;
  pressed: boolean;
}

/**
 * The filter's four choices. `counts`: what each would list now (null while the list loads); `totals`: the same
 * with no search, the most a count can reach (null while it loads). A room is never narrower than its total, so
 * it holds while a search lowers the count.
 */
export function filterChoices(
  value: JobFilter,
  counts: FilterCounts | null,
  totals: FilterCounts | null,
  labels: Record<JobFilter, string>,
): FilterChoice[] {
  return JOB_FILTERS.map((key) => ({
    key,
    label: labels[key],
    count: counts ? num(counts[key]) : null,
    room: num(Math.max(totals?.[key] ?? 0, counts?.[key] ?? 0)),
    pressed: key === value,
  }));
}

/** The list as it shows for a place. */
export interface DeferredListView {
  /** The place, the page held to the pages there are. */
  place: DeferredPlace;
  /** The search as matched: trimmed (the sentences quote it so). */
  query: string;
  totals: FilterCounts;
  /** Each choice's count now: the matches with a search, else the totals. */
  counts: FilterCounts;
  /** The head's count. */
  count: string;
  /** The toolbar shows unless there is no job at all. */
  tools: boolean;
  /** This page's jobs, in the workspace's order. */
  rows: JobRow[];
  /** The jobs the status and search list, over every page. */
  listed: number;
  pages: number;
  /** `51–100 of 229`, when there is more than one page; else null (no pager). */
  pager: { page: number; pages: number; first: number; last: number } | null;
  /** The one sentence when nothing is listed; else null. */
  empty: string | null;
}

/** The list for `place` over the workspace's jobs. */
export function deferredListView(
  jobs: readonly JobRow[],
  place: DeferredPlace,
): DeferredListView {
  const query = place.q.trim();
  const needle = query.toLowerCase();
  const totals = zero();
  const found = zero();
  const listedJobs: JobRow[] = [];
  for (const job of jobs) {
    const hit = jobMatches(job, needle);
    for (const key of JOB_FILTERS) {
      if (!inFilter(job, key)) continue;
      totals[key] += 1;
      if (hit) found[key] += 1;
    }
    if (hit && inFilter(job, place.status)) listedJobs.push(job);
  }
  const listed = listedJobs.length;
  const pages = Math.max(1, Math.ceil(listed / DEFERRED_PER));
  const page = Math.min(Math.max(1, Math.floor(place.page) || 1), pages);
  const anywhere = JOB_FILTERS.reduce((n, key) => n + found[key], 0);
  const words = DEFERRED_LIST.empty;
  const empty =
    jobs.length === 0
      ? words.none
      : listed > 0
        ? null
        : !needle
          ? words.status[place.status]
          : anywhere > 0
            ? words.inStatus(place.status, query)
            : WS_STATES.noMatch(query);
  return {
    place: { ...place, page },
    query,
    totals,
    counts: needle ? found : totals,
    count: needle
      ? DEFERRED_LIST.count(
          place.status,
          totals[place.status],
          found[place.status],
        )
      : DEFERRED_LIST.count(place.status, totals[place.status]),
    tools: jobs.length > 0,
    rows: listedJobs.slice((page - 1) * DEFERRED_PER, page * DEFERRED_PER),
    listed,
    pages,
    pager:
      listed > DEFERRED_PER
        ? {
            page,
            pages,
            first: (page - 1) * DEFERRED_PER + 1,
            last: Math.min(listed, page * DEFERRED_PER),
          }
        : null,
    empty,
  };
}

/** A new search goes to page 1 (F300); the status stays. */
export function withQuery(place: DeferredPlace, q: string): DeferredPlace {
  return { q, status: place.status, page: 1 };
}

/** A new status goes to page 1 (F300); the search stays. */
export function withStatus(
  place: DeferredPlace,
  status: JobFilter,
): DeferredPlace {
  return { q: place.q, status, page: 1 };
}
