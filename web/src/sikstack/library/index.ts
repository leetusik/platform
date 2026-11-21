// The Library's shared parts (job 03, Library round 02, `## Build` § The frame: what every page builds
// from; frame.md F52 to F69, F87 to F100, F320 to F328): the bar outside the Shell, the sheet, a choice,
// the pager, Sign in to save, a mark's row, Your reading data, the Display and Version history bodies and
// a book's chapters. Presentational: props and events, no data reads; the pages wire them. They emit the
// signed markup and the classes of src/sikstack/styles/library/frame.css; their words are
// `@/content/library-frame`. The list parts live in `./lists/` (S4), the reader's in `@/sikstack/reader`.
export { Bar, type BarProps } from "./bar";
export {
  ASK_SHOWN,
  barLanguages,
  barProgress,
  barScroll,
  barTools,
  readPercent,
  type BarScroll,
  type BarTool,
  type BarViewer,
} from "./bar-model";
export { Sheet, type SheetProps } from "./sheet";
export {
  nextSheet,
  outsideBox,
  sheetClass,
  type SheetAction,
  type SheetSide,
} from "./sheet-model";
export { Choice, type ChoiceItem, type ChoiceProps } from "./choice";
export { choicePressed, type ChoiceOption } from "./choice-model";
export { Pager, type PagerProps } from "./pager";
export {
  pageHref,
  pagerPlace,
  pagerRange,
  pagerSlots,
  pagerWays,
  type PagerQuery,
  type PagerSlot,
} from "./pager-model";
export { Save, type SaveProps } from "./save";
export { MarkRow, type MarkRowProps } from "./mark-row";
export {
  markActions,
  markFacts,
  markFailedLine,
  markLead,
  markUndoLine,
  markWord,
  UNDO_MS,
  type Mark,
  type MarkKind,
  type MarkRowPhase,
  type MarkState,
} from "./mark-row-model";
export {
  ReadingData,
  readingDataItems,
  type ReadingDataPhase,
  type ReadingDataProps,
} from "./reading-data";
export { Display, type DisplayProps } from "./display";
export { Versions, type VersionItem, type VersionsProps } from "./versions";
export {
  ChapterRow,
  ReaderChapters,
  type ChapterRowItem,
  type ChapterRowProps,
  type ChapterSection,
  type ReaderChaptersProps,
} from "./chapters";
