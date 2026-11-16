// The words of the reader's frame (src/hi2vi/reader/): the head, the end and the foot of a text, the
// reader's sheets and its loading, not found and error screens. Verbatim from the signed boards of
// Library round 02 (job 03: `Chapter.dc.html`, `ReaderHead.dc.html`, `ReaderEnd.dc.html`,
// `ReaderFoot.dc.html`, `ReaderChapters.dc.html`; frame.md F54, F55, F64, F89, F92, F94). The shared
// parts' words (the bar, the sheet's Close, Display, Versions, Sign in to save, a chapter's row) are
// `@/content/library-frame`; Error's are `@/content/hi2vi-states`. Imported by its own path, never
// through `content/index.ts`.

/** U+2007, a figure space: the foot's percentage keeps three figures' width (frame.md F94, FG12). */
export const FIGURE_SPACE = " ";

const pad3 = (pct: number) => {
  const fig = String(pct);
  return FIGURE_SPACE.repeat(Math.max(0, 3 - fig.length)) + fig;
};

export const READER_FRAME = {
  /** The bar's way back before the page knows its book, and its short label (frame.md F89). */
  book: "Book",
  /** The bar's way back when the book is missing (frame.md F89). */
  library: "Library",
  tag: {
    olderVersion: "Older version",
    olderTranslation: "Older translation",
  },

  head: {
    /** `Chapter 6 of 14` (the head's first fact, the foot's place, the end's next chapter). */
    chapterOf: (n: number, total: number) => `Chapter ${n} of ${total}`,
    /** `v3, published Nov 2`. */
    version: (n: number, published: string) => `v${n}, published ${published}`,
    versionHistory: "Version history",
    olderVersion: "Older version.",
    olderVersionLine: (version: number, newest: number, noun: string) =>
      `You’re reading v${version} of this ${noun}. The current version is v${newest}.`,
    readNewest: (newest: number) => `Read v${newest}`,
    olderTranslation: "Older translation.",
    olderTranslationLine: (source: string, from: number, newest: number) =>
      `Translated from ${source} v${from}. ${source} is now at v${newest}.`,
    readSource: (source: string, newest: number) => `Read ${source} v${newest}`,
    /** The sections' heading and its `nav`'s name. */
    sections: (noun: string) => `In this ${noun}`,
  },

  end: {
    /** Each state's word and line (frame.md F64). */
    line: {
      "not-yet": (noun: string) =>
        [
          "Not finished yet.",
          `Reading to here marks this ${noun} finished.`,
        ] as const,
      finished: () => ["Finished.", "Saved to your progress."] as const,
      updated: (noun: string) =>
        [
          "Finished.",
          `You finished an earlier version. This ${noun} has changed since.`,
        ] as const,
      unread: () => ["Not finished.", "Marked as unread."] as const,
      visitor: () => ["Not saved.", "Signed-out reading isn’t saved."] as const,
    },
    markFinished: "Mark as finished",
    markUnread: "Mark as unread",
    nextChapter: "Next chapter",
    readNext: "Read next",
    lastLine: "You’ve reached the end of this book.",
    backToBook: "Back to the book",
    backToLibrary: "Back to Library",
    inThisBook: "In this book",
    /** `5 of 14 finished` (a member). */
    finished: (done: number, total: number) => `${done} of ${total} finished`,
    /** `14 chapters` (a visitor). */
    chapters: (total: number) =>
      `${total.toLocaleString("en-US")} ${total === 1 ? "chapter" : "chapters"}`,
  },

  foot: {
    /** The foot bar's name. */
    label: "Chapters",
    previous: "Previous",
    contents: "Contents",
    next: "Next",
    book: "The book",
    previousAria: (title: string) =>
      title ? `Previous chapter: ${title}` : "Previous chapter",
    nextAria: (title: string) => `Next chapter: ${title}`,
    bookAria: "Back to the book",
    /** `Chapter 6 of 14, ␣42%`: the percentage in a slot three figures wide. */
    where: (n: number, total: number, pct: number) =>
      `Chapter ${n} of ${total}, ${pad3(pct)}%`,
    /** `Contents. Chapter 6 of 14, 42%`: said without the figure spaces. */
    contentsAria: (n: number, total: number, pct: number) =>
      `Contents. Chapter ${n} of ${total}, ${pct}%`,
    /** `6 of 14`, under 36em of the foot. */
    count: (n: number, total: number) => `${n} of ${total}`,
    pill: "Picked up where you left off",
    fromTop: "From the top",
  },

  sheets: {
    contents: "Contents",
    notes: "Notes",
    versionHistory: "Version history",
    display: "Display",
    /** `Chapter 6 of 14, 5 of 14 finished`; a visitor's `Chapter 1 of 1`. */
    bookLine: (n: number, total: number, done: number | null) =>
      `Chapter ${n} of ${total}${done === null ? "" : `, ${done} of ${total} finished`}`,
  },

  /** A chapter's reading state in a row (frame.md F54). */
  state: {
    notStarted: "Not started",
    started: (pct: number) => (pct > 0 ? `Started, ${pct}%` : "Started"),
    finished: "Finished",
  },

  loading: "Loading…",

  notFound: {
    title: "Chapter not found",
    member: "This chapter doesn’t exist, or it isn’t part of your org.",
    visitor:
      "This link doesn’t point at a shared chapter. It may have moved, been unshared, or never existed.",
    backToLibrary: "Back to Library",
    signIn: "Sign in",
  },
} as const;
