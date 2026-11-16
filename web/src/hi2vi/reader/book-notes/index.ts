// Notes in this book (P63-fk.S14; job 03, Library round 02: `## Build` § Page: book-notes, the board `BookNotes`):
// `/@{org}/{project}/notes/{book}`, wholly new on the Bar's frame.
// - `./model`: the rows, the head's counts per choice, the chapters that stand, the way back, the deletes that wait
//   out their undo line (sent after ten seconds, on a change of the choice and on leaving the page);
// - `./notes-page`: the loaded page (`BookNotesBody`), and Did not load in place;
// - `./notes-parts`: the frame, the head, the waiting choice, Did not load's panel, the loading state.
// Words: `@/content/book-notes`; the sheet is `styles/library/book-notes.css`. The data is
// `@/lib/reader/book-notes-load` (`loadNotesPage`).
export * from "./model";
export { BookNotesBody } from "./notes-page";
export {
  NotesChoiceWaiting,
  NotesFailed,
  NotesFrame,
  NotesHead,
  NotesLoading,
} from "./notes-parts";
