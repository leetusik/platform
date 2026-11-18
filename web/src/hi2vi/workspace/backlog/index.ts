// The backlog (design job 02, `Backlog*.dc.html`, frame.md F304): its model and its parts. The page is
// `app/(app)/projects/[projectId]/workspace/backlog/page.tsx`; the words are `@/content/workspace/backlog`.
export {
  ARCHIVED_PER,
  archivedHref,
  askedPage,
  backlogView,
  idleSentence,
  type BacklogArchived,
  type BacklogCell,
  type BacklogPhase,
  type BacklogRef,
  type BacklogStream,
  type BacklogView,
  type BacklogWaitingItem,
} from "./model";
export {
  BacklogNow,
  BacklogNowFailed,
  BacklogNowLoading,
  BacklogPhases,
  BacklogPhasesLoading,
  BacklogWaiting,
} from "./parts";
export { BacklogFailed } from "./failed";
export { BacklogLoading } from "./loading";
