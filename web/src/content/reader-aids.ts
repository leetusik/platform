// The words of the reading aids in the Library's reader (P63-fk.S10): a term's window, the glossary and the quiz,
// verbatim from the signed boards of Library round 02 (job 03: `BlocksTerm.dc.html`, `BlocksGlossary.dc.html`,
// `BlocksQuiz.dc.html`; `## Build` § Page: blocks; frame.md's word list for Blocks). Imported by its own path, never
// through the content barrel. The words of the quiz's forms the boards do not draw (`04-quiz`: several right
// answers, several blanks) stay the old quiz's (`lib/reader/quiz.ts`), and so does the line a saved answer shows on
// return (`provenance`, `driftNote`).

export const READER_AIDS = {
  term: {
    close: "Close",
    /** Before a term's aliases, comma-joined. */
    alsoCalled: "Also called",
    more: "Read more",
    less: "Show less",
    toGlossary: "In the glossary",
  },
  glossary: {
    title: "Glossary",
    back: "Back to the text",
  },
  quiz: {
    /** The block's name and its head's first word. */
    label: "Quiz",
    count: (n: number): string => `${n} ${n === 1 ? "question" : "questions"}`,
    answered: (done: number, total: number): string =>
      `${done} of ${total} answered`,
    where: (n: number, total: number): string => `Question ${n} of ${total}`,
    heard: {
      correct: ", correct",
      incorrect: ", incorrect",
      got: ", got it",
      missed: ", missed it",
    },
    hint: {
      choice: "Choose one answer.",
      gap: "Fill in the blank. Capitals and spaces around the answer don’t count.",
      recall: "Answer it in your head, then show the answer.",
    },
    options: (n: number): string => `Answers to question ${n}`,
    tag: {
      right: "Your answer, correct",
      wrong: "Your answer, incorrect",
      answer: "Correct answer",
    },
    blank: (n: number, total: number): string => `Blank ${n} of ${total}`,
    answer: "Answer",
    answerOf: (n: number): string => `Answer to question ${n}`,
    show: "Show answer",
    got: "I got it",
    missed: "I missed it",
    check: "Check",
    again: "Try again",
    verdict: {
      right: "Correct.",
      wrong: "Incorrect.",
      got: "Got it.",
      missed: "Missed it.",
      ask: "Did you get it?",
      empty: "Nothing to check yet.",
    },
    emptySub: "Fill in the blank first.",
    save: {
      saving: "Saving…",
      saved: "Saved for review.",
      later: "Saved. Review keeps your first answer.",
      failed: "Not saved. Check your connection.",
    },
    /** `You wrote “<b>…</b>”. Accepted: <b>…</b>.` */
    wrote: ["You wrote “", "”. Accepted: ", "."] as const,
  },
} as const;
