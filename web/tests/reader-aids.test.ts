import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  drawable,
  optionView,
  quizCount,
  quizFoot,
  termClose,
  termPress,
  termRest,
} from "@/hi2vi/reader/aids";
import { ChapterView, validateChapter } from "@/lib/native";
import type { QuizViewContext } from "@/lib/native/render";
import { loadQuizSaved } from "@/lib/reader/quiz-saved";
import {
  fresh,
  landSend,
  reduce,
  savedState,
  type ItemState,
  type QuizAction,
  type QuizSpec,
} from "@/lib/reader/quiz";

// P63-fk.S10 — the reading aids in the Library's reader (job 03, Library round 02, `## Build` § Page: blocks): the
// rules a term's window and the quiz must keep. The look is the fidelity slice's, verified live, never here.

const web = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(web, path), "utf8");

const choice: QuizSpec = {
  id: "q1",
  type: "choice",
  n: 1,
  options: [
    { id: "a", key: "A" },
    { id: "b", key: "B" },
    { id: "c", key: "C" },
  ],
  answer: ["b"],
  multi: false,
};
const gap: QuizSpec = {
  id: "q2",
  type: "cloze",
  n: 2,
  accepted: [["double", "twice", "2x", "two times", "café", "두 배"]],
};
const recall: QuizSpec = { id: "q3", type: "recall", n: 3 };

function run(spec: QuizSpec, ...actions: QuizAction[]): ItemState {
  let st = fresh();
  for (const a of actions) st = reduce(spec, st, a).st;
  return st;
}
const typed = (v: string) => run(gap, { t: "type", n: 1, v }, { t: "check" });

describe("a gap's answer is compared after NFC, trim and case-fold", () => {
  it("capitals and spaces around the answer don't count", () => {
    expect(quizFoot(gap, typed("  DOUBLE "), true).verdict).toBe("Correct.");
    expect(quizFoot(gap, typed("Two Times"), true).verdict).toBe("Correct.");
  });
  it("a decomposed (NFD) answer matches its composed form, Korean included", () => {
    expect(quizFoot(gap, typed("café"), true).verdict).toBe("Correct.");
    expect(quizFoot(gap, typed("두 배"), true).verdict).toBe("Correct.");
  });
  it("inner spaces and other words still count", () => {
    const st = typed("twice as much");
    const foot = quizFoot(gap, st, true);
    expect(foot.verdict).toBe("Incorrect.");
    expect(foot.kind).toBe("wrong");
  });
  it("nothing typed is not graded: the board's two sentences", () => {
    const st = typed("   ");
    expect(st.ph).toBe("open");
    const foot = quizFoot(gap, st, true);
    expect([foot.verdict, foot.sub]).toEqual([
      "Nothing to check yet.",
      "Fill in the blank first.",
    ]);
  });
});

describe("a graded option stays focusable", () => {
  it("is aria-disabled, never disabled and never out of the Tab order", () => {
    const st = run(choice, { t: "pick", opt: "a" });
    expect([0, 1, 2].map((j) => optionView(choice, st, j))).toEqual([
      {
        key: "A",
        state: "wrong",
        tag: "Your answer, incorrect",
        ariaDisabled: "true",
      },
      {
        key: "B",
        state: "answer",
        tag: "Correct answer",
        ariaDisabled: "true",
      },
      { key: "C", state: "", tag: "", ariaDisabled: "true" },
    ]);
  });

  it("in the Library's markup, a saved graded answer's options are buttons a reader can still reach", () => {
    const markup = chapter(QUIZ, {
      member: true,
      saved: {
        "q--pick": {
          state: "graded",
          response: { selected: ["b"] },
          correct: true,
          prov: "Your answer from 12 Nov 2026",
        },
      },
    });
    const opts = [
      ...markup.matchAll(/<button[^>]*class="blocks-opt"[^>]*>/g),
    ].map((m) => m[0]);
    expect(opts).toHaveLength(3);
    for (const o of opts) {
      expect(o).toContain('aria-disabled="true"');
      expect(o).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(o).not.toContain("tabindex");
    }
    expect(markup).toContain("Your answer, correct");
    expect(markup).toContain("Your answer from 12 Nov 2026");
  });
  it("a saved answer's line is the board's date on the viewer's day (P63-fk.S26)", async () => {
    // Answered at 23:30 UTC on 12 Nov 2025: 13 Nov in Seoul. Another year, so the board's form names it.
    const saved = await loadQuizSaved({
      token: undefined,
      attempts: [
        {
          id: "a1",
          doc: "d",
          lang: "en",
          version: 1,
          block_id: "q",
          item_id: "pick",
          item_type: "choice",
          response: { selected: ["b"] },
          correct: true,
          attempt: 1,
          answered_at: "2025-11-12T23:30:00Z",
        },
      ],
      checked: validateChapter(QUIZ, "native"),
      project: "p",
      here: { stem: "d", lang: "en", version: 1, docId: 1, newest: 1 },
      loose: true,
      variants: [],
      langName: () => "English",
      timeZone: "Asia/Seoul",
    });
    const markup = chapter(QUIZ, { member: true, saved });
    expect(markup).toContain("Your answer from Nov 13, 2025");
    expect(markup).not.toContain("13 Nov 2025");
    // The old look keeps its own words, on the same day.
    expect(saved["q--pick"]).toMatchObject({
      prov: "Your answer from 13 Nov 2025",
    });
  });
});

describe("a send's result lands only on its own send", () => {
  const sent = (sendId: string): ItemState => ({
    ...run(choice, { t: "pick", opt: "b" }),
    save: "saving",
    sendId,
  });

  it("a late reply from an earlier send changes nothing", () => {
    expect(landSend(sent("second"), "first", { ok: true, attempt: 1 })).toBe(
      null,
    );
    expect(landSend(sent("second"), "first", { ok: false })).toBe(null);
  });
  it("a reply after Try again changes nothing", () => {
    const again = reduce(choice, sent("first"), { t: "retry" }).st;
    expect(landSend(again, "first", { ok: true, attempt: 1 })).toBe(null);
  });
  it("its own reply lands, and words the save line", () => {
    const one = landSend(sent("s"), "s", { ok: true, attempt: 1 })!;
    expect(quizFoot(choice, one, true).sub).toBe("Saved for review.");
    const two = landSend(sent("s"), "s", { ok: true, attempt: 2 })!;
    expect(quizFoot(choice, two, true).sub).toBe(
      "Saved. Review keeps your first answer.",
    );
    const fail = landSend(sent("s"), "s", { ok: false })!;
    expect(quizFoot(choice, fail, true).sub).toBe(
      "Not saved. Check your connection.",
    );
  });
  it("the Library's quiz sends through the one save path (`useQuiz`), never its own", () => {
    const lib = read("src/hi2vi/reader/aids/quiz.tsx");
    expect(lib).toMatch(/useQuiz\(props, FOCUS\)/);
    expect(lib).not.toContain("saveQuizAttempt");
    const old = read("src/components/reader/quiz.tsx");
    expect(old.match(/saveQuizAttempt\(/g)).toHaveLength(1);
  });
  it("a visitor is graded with nothing sent and no save line", () => {
    const st = run(choice, { t: "pick", opt: "b" });
    expect(st.save).toBe(null);
    expect(quizFoot(choice, st, false)).toMatchObject({
      verdict: "Correct.",
      sub: "",
    });
  });
});

describe("the quiz's words are the board's", () => {
  it("the head counts questions, then answers; never a score", () => {
    expect(quizCount(0, 3)).toBe("3 questions");
    expect(quizCount(0, 1)).toBe("1 question");
    expect(quizCount(1, 3)).toBe("1 of 3 answered");
  });
  it("recall: shown asks, then Got it. or Missed it.", () => {
    const shown = run(recall, { t: "reveal" });
    expect(quizFoot(recall, shown, true)).toMatchObject({
      verdict: "Did you get it?",
      asking: true,
      action: false,
    });
    const got = reduce(recall, shown, { t: "self", v: "got" }).st;
    expect(quizFoot(recall, got, false).verdict).toBe("Got it.");
    const missed = reduce(recall, shown, { t: "self", v: "missed" }).st;
    expect(quizFoot(recall, missed, false)).toMatchObject({
      verdict: "Missed it.",
      kind: "wrong",
    });
  });
  it("a saved answer shows its own line in the save line's place", () => {
    const st = savedState(
      { selected: ["a"] },
      false,
      "Your answer from 1 Nov 2026",
    );
    expect(quizFoot(choice, st, true).sub).toBe("Your answer from 1 Nov 2026");
  });
  it("the Library draws the board's three forms; a quiz holding a form only `04-quiz` signs keeps its old look", () => {
    expect(drawable([choice, gap, recall])).toBe(true);
    expect(
      drawable([choice, { ...choice, answer: ["a", "b"], multi: true }]),
    ).toBe(false);
    expect(drawable([{ ...gap, accepted: [["a"], ["b"]] }])).toBe(false);
  });
});

describe("a term's window", () => {
  const A = "term-a";
  const B = "term-b";

  it("Escape and Close return the focus to the term", () => {
    const open = termPress(null, A).open;
    for (const how of ["escape", "close"] as const)
      expect(termClose(open, how)).toEqual({
        open: null,
        hide: A,
        show: null,
        focus: "term",
      });
    // a hover-opened one too
    const hovered = termRest(null, A, false).open;
    expect(termClose(hovered, "escape").focus).toBe("term");
  });

  it("only one is open at a time: opening another closes the one open", () => {
    const open = termPress(null, A).open;
    expect(termPress(open, B)).toEqual({
      open: { term: B, mode: "focus" },
      hide: A,
      show: B,
      focus: "window",
    });
    // a hover replaces a hover-opened window, never a clicked one
    const hovered = termRest(null, A, false).open;
    expect(termRest(hovered, B, false)).toMatchObject({ hide: A, show: B });
    expect(termRest(open, B, false)).toMatchObject({ hide: null, show: null });
  });

  it("a press on the open term closes it; a press on a hover-opened one keeps it, with the focus", () => {
    const open = termPress(null, A).open;
    expect(termPress(open, A)).toMatchObject({
      open: null,
      hide: A,
      show: null,
    });
    const hovered = termRest(null, A, false).open;
    expect(termPress(hovered, A)).toEqual({
      open: { term: A, mode: "focus" },
      hide: null,
      show: null,
      focus: "window",
    });
  });

  it("a hover opens it without the focus, never as the sheet, and leaving closes only a hover-opened one", () => {
    expect(termRest(null, A, false).focus).toBe(null);
    expect(termRest(null, A, true).show).toBe(null);
    expect(termClose(termRest(null, A, false).open, "leave").hide).toBe(A);
    expect(termClose(termPress(null, A).open, "leave").hide).toBe(null);
  });

  it("a press outside the sheet gives its term the focus back; outside the floating window, it leaves it", () => {
    const open = termPress(null, A).open;
    expect(termClose(open, "outside", true).focus).toBe("term");
    expect(termClose(open, "outside", false).focus).toBe(null);
  });
});

// --- the Library's markup, through the renderer ---------------------------------------------------------------------

const QUIZ = `---
format: native
syntax: 1
---
## Check {#check}

\`\`\`quiz #q
items:
  - id: pick
    type: choice
    prompt: Which one?
    options:
      - {id: a, text: One}
      - {id: b, text: Two}
      - {id: c, text: Three}
    answer: [b]
    explain: Two it is.
  - id: fill
    type: cloze
    text: A heading counts {{double|twice}}, as said.
    explain: Headings say what a section is about.
  - id: think
    type: recall
    prompt: Why?
    answer: Because.
\`\`\`
`;

function chapter(source: string, ctx: Partial<QuizViewContext> = {}): string {
  const quiz: QuizViewContext = {
    member: false,
    write: null,
    version: 1,
    place: "chapter",
    lang: "en",
    signIn: null,
    saved: {},
    ...ctx,
  };
  if (quiz.member && !ctx.write)
    quiz.write = { org: "o", project: "p", doc: "d" };
  return renderToStaticMarkup(
    createElement(ChapterView, {
      checked: validateChapter(source, "native"),
      lang: "en",
      links: { format: "native", assetUrl: () => "/a.png" },
      quiz,
      look: "library",
      hooks: true,
    }),
  );
}

describe("the quiz in the Library's markup", () => {
  it("draws the board's head, rows, hints and gap, and leaves no old quiz on screen", () => {
    const m = chapter(QUIZ);
    expect(m).toContain('class="read blocks-quiz"');
    expect(m).toContain("<b>Quiz</b><span>3 questions</span>");
    expect(m).toContain("Choose one answer.");
    expect(m).toContain(
      "Fill in the blank. Capitals and spaces around the answer don’t count.",
    );
    expect(m).toContain("Answer it in your head, then show the answer.");
    expect(m).toMatch(/<input[^>]*class="input"[^>]*aria-label="Blank 1 of 1"/);
    expect(m).toContain('class="blocks-gap-w"');
    expect(m).not.toMatch(/class="qz[ "]/);
    // paper keeps today's quiz, in its old-look island (print only)
    expect(m).toMatch(/data-island=""[\s\S]*class="pp-/);
  });
});
