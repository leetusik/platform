// The reader's frame (job 03, Library round 02: `## Build` § The frame, § Page: chapter; frame.md F52,
// F59, F61 to F64, F89, F93, F94, F100): the reader on a chapter, its head, end and foot, its loading, not
// found and error screens, and the rules they follow (`./model`). Words: `@/content/reader-frame`; the
// sheet is `styles/library/reader.css` (with frame.css's classes). The shared parts it mounts (Bar, Sheet,
// Display, Versions, ReaderChapters, Save) are `@/hi2vi/library`'s.
//
// The text is `ChapterBody` (`./body/body`, P63-fk.S9, imported by its path: it renders server-only parts);
// `OldRoot` (`./old-root`) is the old reader's root around what in the body still reads the old sheet: the print
// masthead and colophon, and the body's islands (`./body/island`).
export { ChapterReader, type ChapterReaderProps } from "./chapter-reader";
export { ReaderHead, type ReaderHeadProps } from "./reader-head";
export { ReaderEnd, type ReaderEndProps } from "./reader-end";
export { ReaderFoot, type ReaderFootProps } from "./reader-foot";
export {
  failedState,
  missingState,
  ReaderFailed,
  ReaderLoading,
  ReaderMissing,
  ReaderSegment,
  ReaderSegmentContext,
  type ReaderSegmentValue,
} from "./reader-states";
export { OldBodyContext, OldRoot, type OldBodyValue } from "./old-root";
export {
  chapterItems,
  chromeOf,
  currentSection,
  endAction,
  endRowsShown,
  endState,
  pillAfterScroll,
  quietBars,
  readerBars,
  scrollBars,
  sectionsOf,
  showBars,
  versionItems,
  type EndState,
  type ReaderBars,
} from "./model";
