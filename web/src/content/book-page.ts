// The book page's words (sikstack Library, job 03 round 02, `## Build` § Page: book; the boards `Book`,
// `BookHead`, `BookContinue`, `BookChapters`). Verbatim from the boards; the shared parts' words (the bar,
// Your reading data, a version's row) are `@/content/library-frame`'s. Imported by its own path, never
// through `content/index.ts`.

import { plural } from "@/lib/format";

export const BOOK_PAGE = {
  head: {
    /** `Codebase book in platform`; a visitor reads `@quillwork / platform`. */
    place: (kind: "codebase" | "subject", where: string) =>
      `${kind === "subject" ? "Subject book in " : "Codebase book in "}${where}`,
    publicPlace: (org: string, project: string) => `@${org} / ${project}`,
    finished: (done: number, total: number) => `${done} of ${total} finished`,
    allFinished: "Finished",
    notStarted: "Not started",
    chapters: (n: number) => plural(n, "chapter"),
    signedOut: "Signed-out reading isn’t saved.",
  },
  cont: {
    name: {
      continue: "Continue reading",
      next: "Next chapter",
      start: "Start reading",
      finished: "Finished",
    },
    chapterOf: (n: number, total: number) => `Chapter ${n} of ${total}`,
    leftOffAt: (where: string) => `Left off at ${where}`,
    leftOffPct: (pct: number) => `Left off at ${pct}%`,
    opened: "Opened, not read far yet",
    youFinished: (n: number) => `You finished chapter ${n}`,
    allFinished: (total: number) => `You’ve finished all ${total} chapters.`,
    changed: (n: number) => `Chapter ${n} has changed since you finished it.`,
    continueReading: "Continue reading",
    readNext: "Read next",
    readChapter: (n: number) => `Read chapter ${n}`,
    readAgain: (n: number) => `Read chapter ${n} again`,
  },
  notes: {
    title: "Notes in this book",
    count: (items: number, chapters: number) =>
      `${plural(items, "item")} in ${plural(chapters, "chapter")}`,
  },
  contents: {
    title: "Contents",
    count: (n: number) => plural(n, "chapter"),
    phases: "One chapter for each phase that was explained, in phase order.",
    list: "Chapters",
    updated: "Updated",
    notStarted: "Not started",
    started: "Started",
    startedAt: (pct: number) => `Started, ${pct}%`,
    finished: "Finished",
    olderTranslation: "Older translation",
    language: (label: string, v: number) => `${label} v${v}`,
    languageAria: (label: string, v: number, n: number) =>
      `${label} v${v}, chapter ${n}`,
    one: (v: number, date: string) =>
      date ? `v${v}, published ${date}` : `v${v}`,
    versionHistory: "Version history",
    versionHistoryAria: (n: number) => `Version history of chapter ${n}`,
    versionsOf: (n: number) => `Versions of chapter ${n}`,
    groupAria: (label: string) => `Versions, ${label}`,
    version: (n: number) => `v${n}`,
    current: "Current",
    published: (date: string) => `Published ${date}`,
    translatedFrom: (label: string, v: number) =>
      `Translated from ${label} v${v}`,
    view: "View",
    viewAria: (n: number, label: string) => `View version ${n}, ${label}`,
  },
  states: {
    loading: "Loading…",
    notFound: {
      title: "Book not found",
      member: "This book doesn’t exist, or it isn’t part of your org.",
      visitor:
        "This link doesn’t point at a shared book. It may have moved, been unshared, or never existed.",
      signIn: "Sign in",
    },
  },
} as const;
