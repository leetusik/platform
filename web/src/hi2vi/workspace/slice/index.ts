// A slice's page (design job 02: `Slice.dc.html`, `SliceHead`, `SliceVerdict`, `SliceCommits`; frame.md F84 to
// F86, F305). Its words are `@/content/workspace/slice`; the frame's parts and words are reused, never redrawn.
// The read is `./load` (server-only, imported by its own path). The pure model is tested on its own.
//
// - `SlicePage`, `SliceLoading`: the page and its loading state; `SliceMissing`: Not found and Error.
// - `SliceHead`, `SliceVerdict`, `SliceCommits`: its parts.
// - `sliceLead`, `sliceFacts`, `verdictFields`, `verdictFiles`, `planOutline`, `resultPart`, `sliceCommits`.
export { SliceCommits } from "./commits";
export { SliceHead } from "./head";
export { SliceHeadLoading, SliceLoading } from "./loading";
export { SliceMissing } from "./missing";
export {
  planOutline,
  resultPart,
  sliceCommits,
  sliceFacts,
  sliceLead,
  slicePhaseOf,
  sliceStopped,
  verdictFields,
  verdictFiles,
  verdictValue,
  type SliceCommit,
  type SliceFact,
} from "./model";
export { SlicePage } from "./page";
export { SliceVerdict } from "./verdict";
