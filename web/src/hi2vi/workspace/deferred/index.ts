// The Workspace's deferred jobs (design job 02, round 02-agenda-and-links: `Deferred.dc.html`, `DeferredList`,
// `DeferredFilter`, `DeferredJob`; frame.md F300, F82): the list with its search, status filter and pager, and
// one job. Its look is `../../styles/workspace/deferred.css`; its words `@/content/workspace/deferred`. The pure
// models (no React, no I/O) are tested on their own; the reads are `./load` (server only, imported by its path).
export {
  DEFERRED_PER,
  deferredListView,
  filterChoices,
  jobMatches,
  readDeferredPlace,
  withQuery,
  withStatus,
  type DeferredListView,
  type DeferredPlace,
  type FilterChoice,
  type FilterCounts,
} from "./list-model";
export { isSliceId, jobItem, needsWorkspace, promotedPhase } from "./job-model";
export { DeferredFilter } from "./filter";
export { DeferredList, DeferredListFailed } from "./list";
export { DeferredListLoading, DeferredJobLoading, useJobBack } from "./loading";
export { DeferredJob } from "./job";
export { DeferredJobError } from "./job-error";
