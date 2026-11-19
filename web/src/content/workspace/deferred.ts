// The Workspace's deferred jobs page words (design job 02, round 02-agenda-and-links: `Deferred.dc.html`,
// `DeferredList.dc.html`, `DeferredFilter.dc.html`, `DeferredJob.dc.html`; frame.md F36, F49, F78, F300),
// verbatim. The words every Workspace page shares (the places, the facts' labels, the panels' heads, Not found,
// the part that failed, the pager's name) are `./frame`'s. Imported by its own path, never through
// `content/index.ts`.

import { num } from "@/lib/format";

import type { JobFilter } from "@/lib/workspace/address";

/** The status filter's four choices, in the signed order, each with its word. */
export const DEFERRED_FILTERS: Record<JobFilter, string> = {
  open: "Open",
  promoted: "Promoted",
  dropped: "Dropped",
  done: "Done",
};

/** The list (`DeferredList.dc.html`). */
export const DEFERRED_LIST = {
  /** The panel's `h2` and its name. */
  title: "Deferred jobs",
  /** The head's count: `12 open`; with a search `10 of 229 open`. */
  count: (status: JobFilter, total: number, found?: number) =>
    `${found === undefined ? "" : `${num(found)} of `}${num(total)} ${status}`,
  search: {
    label: "Find a deferred job",
    placeholder: "Find by id, title, source or trigger",
  },
  /** The status filter's group name. */
  filter: "Status",
  /** Read before a row's second line, its source and its date by a screen reader. */
  srTrigger: "Trigger: ",
  srSource: "Source ",
  srCreated: "Created ",
  loading: "Loading…",
  empty: {
    /** No job at all: the head reads `0 open` and there is no toolbar. */
    none: "No deferred jobs yet. An agent files one when a slice finds work for later.",
    /** A status with no job. */
    status: {
      open: "No open jobs.",
      promoted: "No job has been promoted.",
      dropped: "No job has been dropped.",
      done: "No job is done.",
    } satisfies Record<JobFilter, string>,
    /** A search with no match in this status and some in another. */
    inStatus: (status: JobFilter, q: string) =>
      `No ${status} job contains “${q}”.`,
  },
} as const;

/** One job (`DeferredJob.dc.html`). */
export const DEFERRED_JOB = {
  loading: "Loading…",
} as const;
