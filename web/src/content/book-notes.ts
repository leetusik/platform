// A book's notes page's words (sikstack Library, job 03 round 02, `## Build` § Page: book-notes; the board
// `BookNotes`). Verbatim from the board; a mark's row's words (Delete, Undo, its lines) are MarkRow's,
// `@/content/library-frame`. Imported by its own path, never through `content/index.ts`.

import { num, plural } from "@/lib/format";

export type NotesFilter = "all" | "bm" | "hl";

/** One noun a choice, `[one, many]` (the board's `BN_NOUN`). */
const NOUN: Record<NotesFilter, readonly [string, string]> = {
  all: ["item", "items"],
  bm: ["bookmark", "bookmarks"],
  hl: ["highlight or note", "highlights and notes"],
};

export const BOOK_NOTES = {
  title: "Notes in this book",
  /** `13 items in 4 chapters`; at nothing `0 items`. */
  count: (filter: NotesFilter, n: number, chapters: number): string =>
    n
      ? `${plural(n, NOUN[filter][0], NOUN[filter][1])} in ${plural(chapters, "chapter")}`
      : `0 ${NOUN[filter][1]}`,
  unanchored: (n: number) => `${num(n)} unanchored`,
  show: "Show",
  choice: {
    all: "All",
    bm: "Bookmarks",
    hl: "Highlights and notes",
  } satisfies Record<NotesFilter, string>,
  /** A choice with its count (`All 13`), once the list has loaded. */
  choiceCount: (label: string, n: number) => `${label} ${num(n)}`,
  chapterN: (n: number) => `Chapter ${n}`,
  empty: {
    all: "Nothing marked in this book yet. Highlights, notes and bookmarks you make in its chapters are listed here.",
    bm: "No bookmarks in this book yet. Select a heading in a chapter and choose Bookmark.",
    hl: "No highlights or notes in this book yet. Select a passage in a chapter and choose Highlight.",
  } satisfies Record<NotesFilter, string>,
  loading: "Loading…",
  failed: "Notes did not load.",
  retry: "Try again",
  back: {
    book: "Book",
    chapter: "Chapter",
    library: "Library",
  },
  notFound: {
    title: "Book not found",
    text: "This book doesn’t exist, or it isn’t part of your org.",
    back: "Back to Library",
  },
} as const;
