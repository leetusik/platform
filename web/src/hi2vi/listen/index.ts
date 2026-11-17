// Listen's parts in the hi2vi frame (job 07, round 01; P64-3y): the head's slot (AudioHead, its control and
// note), its model and follow along; the dock, its track and the pill (S3); the opened player (S4); the book page (S5).
export { AudioHead, type AudioHeadProps } from "./audio-head";
export { Control } from "./control";
export { Held, Note } from "./note";
export {
  controlOf,
  followsIn,
  headOf,
  holdOf,
  listenShown,
  SHAPE_STATE,
  shellOf,
  startingOf,
  textOf,
  trackOf,
  trackStartingOf,
  type HeadControl,
  type HeadNote,
  type HeadView,
  type ListenWhat,
  type TrackView,
} from "./model";
export { Dock } from "./dock";
export { ListenPill } from "./pill";
export { ListenTrack } from "./track";
export { ListenHeadSlot } from "./head-slot";
export { useFollow } from "./follow";
export { ListenPlayerSheet } from "./player";
export { PlayerBody } from "./player-body";
export { goToText, pressPlayer, textHref, type PlayerEvent } from "./press";
export {
  bookControlOf,
  bookHeadOf,
  bookRowsOf,
  bookStartOf,
  bookTrackOf,
  type BookListenSeedView,
  type BookStart,
  type RowAudio,
} from "./book";
