// Listen's parts in the hi2vi frame (job 07, round 01; P64-3y): the head's slot (AudioHead, its control and
// note), its model and follow along. The dock (S3) and the player (S4) join them here.
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
  type HeadControl,
  type HeadNote,
  type HeadView,
  type ListenWhat,
} from "./model";
export { ListenHeadSlot } from "./head-slot";
export { useFollow } from "./follow";
