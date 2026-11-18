// The Workspace's frame (design job 02, rounds 01-workspace and 02-agenda-and-links; frame.md F35 to F49, F78,
// F80, F85): the parts every Workspace page shares. They emit the signed markup and the classes of
// src/hi2vi/styles/ (the system's `bundle.css` and `workspace/frame.css`), with no styling of their own. Their
// words are `@/content/workspace/frame`. The pure models (no React, no I/O) are tested on their own.
//
// - `wsStatus(kind, value)`, `WsStatus`: F37's word and shape for every stored value.
// - `wsSteps`, `phaseSteps`, `stepsN`, `Steps`: a phase's progress (F39).
// - `WsList`, `WsRow`, `wsRowLayout`, `WS_ROW_BREAKS`: a Workspace row and its four layouts (F43).
// - `WsNav`: the head of the four places, or the never-synced and not-linked panel (F40, F41).
// - `wsSyncLine`, `WsSync`: the sync line (F40).
// - `BackRow`, `ItemHead`: an item page's first row and title row (F35, F84, F85).
// - `Facts`, `Fact`: label-over-value facts, a long one, links as a value (F44, F80).
// - `WaitingBadge`, `RefusedBadge`, `RefusedNotice`: a change that waits, one refused (F45).
// - `wsNotFoundState`, `wsErrorState`: an item page's Not found and Error, for `StateBlock` (F49).
// - `splitIds`, `WsText`, `WsId`: an id never breaks inside a sentence (F80).
export { wsStatus, type WsStatusWord } from "./status-model";
export { WsStatus } from "./status";
export {
  phaseSteps,
  stepsN,
  wsSteps,
  type WsStep,
  type WsSteps,
} from "./steps-model";
export { Steps } from "./steps";
export { WS_ROW_BREAKS, wsRowLayout, type WsRowLayout } from "./row-model";
export { WsList, WsRow } from "./row";
export { wsSyncLine, type WsSyncLine, type WsSyncState } from "./sync-model";
export { WsSync } from "./sync";
export { WsNav } from "./nav";
export { BackRow, ItemHead } from "./item-head";
export { Fact, Facts, type FactLink } from "./facts";
export { RefusedBadge, RefusedNotice, WaitingBadge } from "./waiting";
export { wsErrorState, wsNotFoundState, type WsBack } from "./states-model";
export { splitIds, type WsTextPart } from "./ids";
export { WsId, WsText } from "./text";
