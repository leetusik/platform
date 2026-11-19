// The Library's list parts (job 03, Library round 02, `## Build` § The shared parts round 02 changed;
// frame.md F320 to F323, F328): a project's section (`Shelf`), the one documents table (`LibraryDocs`)
// and Continue reading (`LibraryContinue`), each with every variant the record gives (member and
// visitor, `head`, `projects`, `scope`), so the library, a project's page and the public library only
// mount them. Their data is `@/lib/library/lists` (pure) and `@/lib/library/load-lists` (the reads);
// their words `@/content/library-page`; their sheet src/hi2vi/styles/library/lists.css.
export { Shelf, type ShelfProps } from "./shelf";
export { LibraryContinue, type LibraryContinueProps } from "./library-continue";
export {
  continuePlace,
  continueRows,
  placeText,
  type ContinuePlace,
  type ContinueRow,
  type ContinueScope,
} from "./continue-model";
export {
  LibraryDocs,
  type LibraryDocsPhase,
  type LibraryDocsProps,
} from "./library-docs";
