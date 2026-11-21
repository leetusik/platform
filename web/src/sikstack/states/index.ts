// The app's shared page states under the Shell (P58; job 01 round 03-instrument, `## Build` § Shared
// states): Error and Not found, one whole-page block each. Words: `@/content/sikstack-states`.
//
// - `StateBlock {state, onRetry?}`: `.column > .block.block-page` (title, sentence, actions, reference).
// - `errorState({orgName, digest?})`, `notFoundState({orgName | null})`: what the block shows.
// - `boundaryRetry({retry?, unstable_retry?, reset})`: the function Try again calls (re-fetch first).
// - `useShellOrgName()` (client): the active org's name, from the Shell's context (`@/sikstack/shell`).
//
// Loading, Empty, Loaded and Toast are states of a page, not screens of their own (frame.md F31).
export {
  errorState,
  notFoundState,
  type StateAction,
  type StateModel,
} from "./model";
export { boundaryRetry, type BoundaryRetryProps } from "./retry";
export { StateBlock } from "./state-block";
export { useShellOrgName } from "./org-name";
