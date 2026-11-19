// The words of highlights, notes and bookmarks in the Library's reader (P63-fk.S11), verbatim from the signed boards
// of Library round 02 (job 03: `AnnotationsBar.dc.html`, `AnnotationsBox.dc.html`, `AnnotationsPaint.dc.html`,
// `AnnotationsPlace.dc.html`, `AnnotationsNotes.dc.html` and the page `Annotations.dc.html`; `## Build` § Page:
// annotations). A mark's row, Sign in to save and the undo line's sentences are the frame's (`MARK_ROW`, `SAVE` in
// `./library-frame`). Imported by its own path, never through the content barrel.
//
// Two lines no board draws are the product's own, kept as the old layer says them (`READER.notes`): the line of a
// write that did not reach the server (`notSaved`, with Try again), and the word of a typed block in the bar a
// selection shows (`Diagram`, `Quiz`, …; a heading reads the board's `Section`).

export const READER_MARKS = {
  /** The hidden lines a highlight's keyboard stop is described by (never shown). */
  desc: {
    one: "Highlight",
    note: "Highlight with a note",
    many: "Highlights overlap here",
  },
  bar: {
    aria: {
      passage: "Selected text",
      block: "This section",
      plain: "This position",
    },
    /** Cut: "… stops at the end of <section>." */
    cutLead:
      "Highlights stay inside one section, so this one stops at the end of ",
    cutTail: ".",
    section: "Section",
    refused: "Highlights start at the first section.",
    plain: "Highlights are not available in this document.",
    highlight: "Highlight",
    addNote: "Add note",
    bookmark: "Bookmark",
    bookmarked: "Bookmarked",
    position: "Bookmark this position",
    positionOn: "Bookmarked here",
  },
  box: {
    title: {
      highlight: "Highlight",
      highlightNote: "Highlight with a note",
      new: "New highlight",
      section: "Note on a section",
      bookmark: "Bookmark",
      changed: "Text changed",
      /** "1 highlight in " / "2 highlights in ", the language's own name after it. */
      other: (n: number): string =>
        `${n} ${n === 1 ? "highlight" : "highlights"} in `,
      choose: (n: number): string => `${n} highlights`,
    },
    aria: {
      new: "Note on a new highlight",
      choose: "Choose a highlight",
      highlight: "Highlight",
    },
    close: "Close",
    addNote: "Add note",
    editNote: "Edit note",
    noLabel: "No label yet.",
    addLabel: "Add label",
    editLabel: "Edit label",
    note: "Note",
    placeholder: "What do you want to remember about this?",
    failed: "Could not save the note. Try again.",
    hint: "⌘ Enter saves. Esc cancels.",
    count: (n: number): string => `${n.toLocaleString("en-US")} / 2,000`,
    countFull: "2,000 / 2,000, the most a note holds",
    saveNote: "Save note",
    saving: "Saving…",
    cancel: "Cancel",
    deleteNote: "Delete note",
    label: "Label",
    labelPlaceholder: "Why this place?",
    saveLabel: "Save label",
    review: "Review this",
    reviewOn: "It is a card in your reviews.",
    reviewPaused: "Its card is paused, and keeps its history.",
    reviewNever: "Turn on to make it a review card.",
    goesBoth: "Its note and its review card go with it.",
    goesNote: "Its note goes with it.",
    goesCard: "Its review card goes with it.",
    deleteHighlight: "Delete highlight",
    removeBookmark: "Remove bookmark",
    delete: "Delete",
    deleteAria: (quote: string): string => `Delete highlight: ${quote}`,
    /** Text changed: "You made this on English v1. …" */
    changedLead: (many: boolean, made: string): string =>
      many
        ? `You made these on ${made}. This version no longer says them, so they are not painted here.`
        : `You made this on ${made}. This version no longer says it, so it is not painted here.`,
    otherLead: (many: boolean, screen: string): string =>
      many
        ? `Highlights belong to their language, so these are not painted on the ${screen} text.`
        : `Highlights belong to their language, so this one is not painted on the ${screen} text.`,
    /** "Read this section in v1" / "Read this section in 한국어" (the name in its own language). */
    readPre: "Read this section in ",
    overlap: "They overlap here. Pick one to open it.",
  },
  /** The notes beside the text (`.an-notes > button.an-note`). */
  beside: {
    note: "Note",
    bookmarked: "Bookmarked",
    section: "Note on a section",
    changed: "Text changed",
    changedText: (words: string, n: number): string =>
      `${words} no longer ${n === 1 ? "matches" : "match"} the text`,
    other: "Other language",
    /** "1 highlight in ", the language's own name after it. */
    otherText: (words: string): string => `${words} in `,
  },
  place: {
    aria: {
      section: "The section you are reading",
      position: "This position",
    },
  },
  undo: "Undo",
  sheet: {
    count: (n: number): string => `${n} ${n === 1 ? "item" : "items"}`,
    here: { chapter: "In this chapter", document: "In this document" },
    /** "In 한국어": the language's own name after it. */
    inLang: "In ",
    otherAria: "In another language",
    otherLead: "Not painted here: a highlight belongs to its language.",
    lost: "Unanchored",
    lostLead:
      "Their text is no longer in this chapter. They stay until you delete them.",
    all: "All notes in this book",
    empty: {
      chapter:
        "Nothing marked in this chapter yet. Select a passage to highlight it, or bookmark the section you are reading.",
      document:
        "Nothing marked in this document yet. Bookmark this position keeps a place.",
    },
  },
  /** A mark's place in a row (frame.md F65): a position's, an unanchored mark's. */
  where: {
    position: (pct: number): string => `About ${pct}% through`,
    was: (block: string): string => `Was in “${block}”`,
    /** An unanchored mark whose section left no name (the canvas's `was()`). */
    removedSection: "a removed section",
  },
} as const;
