// The words of the Library's shared parts (src/sikstack/library/): the bar outside the Shell, the sheet, a
// choice, the pager, Sign in to save, a mark's row, Your reading data, the Display and Version history
// bodies and a book's chapters. Verbatim from the signed boards of Library round 02 (job 03:
// `Bar.dc.html`, `Sheet.dc.html`, `Choice.dc.html`, `Pager.dc.html`, `Save.dc.html`, `MarkRow.dc.html`,
// `ReadingData.dc.html`, `Display.dc.html`, `Versions.dc.html`, `ReaderChapters.dc.html`; frame.md F53,
// F55, F58, F62 to F65, F69, F92, F95, F325). Imported by its own path, never through `content/index.ts`.

/** The full name of a text's language: the bar's language choice and a mark's `Made on English v1`. */
export const LANGUAGES: Record<string, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  ko: { short: "KO", name: "한국어" },
};

export const BAR = {
  wordmark: "sikstack",
  homeLabel: "sikstack, home",
  showControls: "Show reading controls",
  language: "Language",
  notes: "Notes",
  ask: "Ask",
  display: "Display",
  /** Display's label under 40em of the bar (frame.md F53). */
  displayShort: "Aa",
  signIn: "Sign in",
} as const;

export const SHEET = {
  close: "Close",
} as const;

export const PAGER = {
  /** The nav's name when the list gives none. */
  label: "Pages",
  previous: "Previous",
  next: "Next",
  page: (n: number) => `Page ${n}`,
  /** Under 36em of the pager, between the two ways (frame.md F325). */
  pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
  /** `26–50 of 240`: the first and last row shown, and the total. */
  range: (first: string, last: string, total: string) =>
    `${first}–${last} of ${total}`,
} as const;

/** What a visitor would have kept by signing in (frame.md F64, F92). */
export type SaveWhat =
  "chapters" | "documents" | "highlights" | "bookmarks" | "quiz";

export const SAVE = {
  title: "Sign in to save",
  sentence: {
    chapters:
      "Signed in, your finished chapters and your place in each one are kept across your devices.",
    documents:
      "Signed in, your finished documents and your place in each one are kept across your devices.",
    highlights:
      "Signed in, your highlights and notes are kept across your devices.",
    bookmarks: "Signed in, your bookmarks are kept across your devices.",
    quiz: "Signed in, your quiz answers are kept across your devices.",
  } satisfies Record<SaveWhat, string>,
  signIn: "Sign in",
  notNow: "Not now",
} as const;

export const MARK_ROW = {
  /** The word for a mark (frame.md F54). */
  word: {
    highlight: "Highlight",
    highlightNote: "Highlight with a note",
    section: "Note on a section",
    bookmark: "Bookmark",
    position: "Bookmark, position",
    changed: "Text changed",
    gone: "Unanchored",
  },
  /** A highlight that is a review card (frame.md F95). */
  inReview: "In review",
  made: (language: string, version: number) =>
    `Made on ${language} v${version}`,
  addLabel: "Add label",
  editLabel: "Edit label",
  delete: "Delete",
  remove: "Remove",
  deleteAria: {
    bookmark: (what: string) => `Remove bookmark: ${what}`,
    section: (what: string) => `Delete note: ${what}`,
    highlight: (what: string) => `Delete highlight: ${what}`,
  },
  failed: {
    bookmark: "Could not remove this bookmark. Try again.",
    note: "Could not delete this note. Try again.",
    highlight: "Could not delete this highlight. Try again.",
  },
  undoLine: {
    bookmark: "Bookmark removed.",
    note: "Note deleted.",
    highlightNoteReview: "Highlight, note and review card deleted.",
    highlightNote: "Highlight and its note deleted.",
    highlightReview: "Highlight deleted, and its review card with it.",
    highlight: "Highlight deleted.",
  },
  undo: "Undo",
  label: "Label",
  labelPlaceholder: "Why this place?",
  saveLabel: "Save label",
  cancel: "Cancel",
} as const;

export type ReadingDataScope = "all" | "book";

export const READING_DATA = {
  heading: "Your reading data",
  trigger: {
    all: "Clear all reading data",
    book: "Clear this book’s reading data",
  },
  question: {
    all: "Clear all reading data?",
    book: "Clear your reading data for this book?",
  },
  removes: {
    all: "This removes, from every library you read:",
    book: (subject: string) => `This removes, from ${subject} only:`,
  },
  items: {
    all: [
      "your place and progress in every book and document",
      "bookmarks",
      "highlights and notes",
      "quiz answers",
      "review cards and their schedule",
    ],
    bookChapters: (n: number) =>
      `your place and progress in ${n}${n === 1 ? " chapter" : " chapters"}`,
    bookMarks: (n: number) =>
      n === 1
        ? "1 bookmark, highlight or note"
        : `${n} bookmarks, highlights and notes`,
    bookQuiz: "your quiz answers, and the review cards from its chapters",
  },
  keeps: {
    all: "It keeps the books and documents themselves, your review settings and your display settings on this device. You cannot undo this.",
    book: "It keeps every other book, the chapters themselves and your display settings on this device. You cannot undo this.",
  },
  cancel: "Cancel",
  confirm: {
    all: "Yes, clear all reading data",
    book: "Yes, clear reading data",
  },
  clearing: "Clearing…",
  cleared: {
    all: "All reading data cleared. Every book and document is back to the start.",
    book: "Reading data cleared. Every chapter of this book reads Not started.",
  },
  failed: {
    all: "Could not clear your reading data. Nothing was cleared. Try again.",
    book: "Could not clear this book’s reading data. Nothing was cleared. Try again.",
  },
} as const;

export type DisplayTheme = "system" | "light" | "dark" | "sepia";

export const DISPLAY = {
  textSize: "Text size",
  /** The five steps, in px: the `A` of each is drawn at its own step (frame.md F56, F62). */
  sizes: [14, 16, 18, 20, 22],
  sizeNote: { 1: ", smallest", 3: ", default", 5: ", largest" } as Record<
    number,
    string
  >,
  sizeLabel: (n: number, note: string) => `Text size ${n} of 5${note}`,
  sizeHint: (n: number, note: string) => `${n} of 5${note}`,
  sizeLetter: "A",
  theme: "Theme",
  themes: [
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "sepia", label: "Sepia" },
  ] as { key: DisplayTheme; label: string }[],
  /** While System is picked: the scheme the device gives now, `light` or `dark`. */
  system: (scheme: "light" | "dark") =>
    `System follows this device: ${scheme} now.`,
  kept: "Saved on this device. Your other devices keep their own.",
} as const;

export const VERSIONS = {
  list: "Versions",
  label: (n: number) => `v${n}`,
  current: "Current",
  published: (date: string) => `Published ${date}`,
  translatedFrom: (language: string, version: number) =>
    `Translated from ${language} v${version}`,
  readingNow: "Reading now",
  view: "View",
  viewAria: (n: number) => `View version ${n}`,
  only: "This is the only version.",
  failed: "Version history did not load.",
  retry: "Try again",
} as const;

export const CHAPTERS = {
  list: "Chapters",
  sections: "Sections of this chapter",
  updated: "Updated",
  readingNow: "Reading now",
} as const;
