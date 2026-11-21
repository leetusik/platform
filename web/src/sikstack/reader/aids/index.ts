// The reading aids in the Library's reader (P63-fk.S10; job 03, Library round 02, `## Build` § Page: blocks): a
// term's window and its layer, the glossary's entries, the quiz. The renderer (`lib/native/render.tsx`) draws them
// in the Library's look; `ChapterBody` mounts the term layer. Words: `@/content/reader-aids`.
export {
  LibraryQuiz,
  LibraryBlank,
  type LibraryQuizItem,
  type LibraryQuizProps,
} from "./quiz";
export {
  blankState,
  drawable,
  optionView,
  quizCount,
  quizFoot,
  quizHint,
  quizWhere,
  quizWrote,
  saveLine,
  type OptionState,
} from "./quiz-model";
export { GlossaryList, TermWindows, type TermEntryView } from "./terms";
export { LibraryTermLayer } from "./term-layer";
export {
  termClose,
  termPress,
  termRest,
  type TermMode,
  type TermOpen,
  type TermStep,
} from "./term-model";
