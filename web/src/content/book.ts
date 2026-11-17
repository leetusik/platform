// P30.S23 — the book page's own words, from `07-book-page` round 01's *Every string written
// for the book page* (English only; D36 (4)). The reader's words that the page reuses
// unchanged ("Not started", "UPDATED", "CURRENT"...) are written here once more only where
// the book page builds the sentence itself; pure functions carry the plural forms so the
// page, the skeleton and the tests read one source.

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const BOOK = {
  head: {
    chapters: (total: number): string => plural(total, "chapter", "chapters"),
  },
} as const;
