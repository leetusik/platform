import { READER_AIDS } from "@/content/reader-aids";
import {
  gradeItem,
  joinAccepted,
  type ItemState,
  type QuizSpec,
} from "@/lib/reader/quiz";

/**
 * The Library's quiz, as words and states (P63-fk.S10; job 03, Library round 02: `BlocksQuiz.dc.html`, `## Build`
 * § Page: blocks *The quiz*). Pure: the grading, the transitions and the save path are the old quiz's
 * (`lib/reader/quiz.ts`, `useQuiz`), only the look and its words are the board's.
 */

const Q = READER_AIDS.quiz;

/**
 * Whether the Library draws this quiz: every item one of the board's three forms (choose one, one blank, recall).
 * A quiz holding a form only `04-quiz` signs (several right answers, several blanks) keeps the product's own look,
 * whole, until those forms are drawn.
 */
export function drawable(specs: readonly QuizSpec[]): boolean {
  return (
    specs.length > 0 &&
    specs.every(
      (s) =>
        (s.type === "choice" && !s.multi) ||
        s.type === "recall" ||
        (s.type === "cloze" && s.accepted.length === 1),
    )
  );
}

/** The head's count: `3 questions` until the first answer, then `1 of 3 answered`; never a score. */
export function quizCount(answered: number, total: number): string {
  return answered > 0 ? Q.answered(answered, total) : Q.count(total);
}

export function quizHint(spec: QuizSpec): string {
  return spec.type === "recall"
    ? Q.hint.recall
    : spec.type === "cloze"
      ? Q.hint.gap
      : Q.hint.choice;
}

/** `Question 1 of 3`, and what a screen reader hears after it once graded. */
export function quizWhere(
  spec: QuizSpec,
  st: ItemState,
  total: number,
): { where: string; heard: string } {
  const where = Q.where(spec.n, total);
  if (st.ph !== "graded") return { where, heard: "" };
  if (spec.type === "recall")
    return { where, heard: st.self === "got" ? Q.heard.got : Q.heard.missed };
  return { where, heard: st.correct ? Q.heard.correct : Q.heard.incorrect };
}

export type OptionState = "" | "right" | "wrong" | "answer";

/**
 * One option of a choose-one item: its state and tag once graded. A graded option is `aria-disabled` and stays a
 * focusable button (never `disabled`, never out of the Tab order), so a reader can still reach it and hear its tag.
 */
export function optionView(
  spec: Extract<QuizSpec, { type: "choice" }>,
  st: ItemState,
  j: number,
): {
  key: string;
  state: OptionState;
  tag: string;
  ariaDisabled: "true" | "false";
} {
  const o = spec.options[j];
  const graded = st.ph === "graded";
  const chosen = graded && st.sel.includes(o.id);
  const right = spec.answer.includes(o.id);
  const state: OptionState = chosen
    ? right
      ? "right"
      : "wrong"
    : graded && right
      ? "answer"
      : "";
  return {
    key: o.key,
    state,
    tag: state ? Q.tag[state] : "",
    ariaDisabled: graded ? "true" : "false",
  };
}

/** The save line under a member's verdict: a saved answer's own line on return, else the send's state. */
export function saveLine(st: ItemState, saves: boolean): string {
  if (st.origin === "saved") return st.prov;
  if (!saves) return "";
  if (st.save === "saving") return Q.save.saving;
  if (st.save === "failed") return Q.save.failed;
  if (st.save === "saved") return st.later ? Q.save.later : Q.save.saved;
  return "";
}

/**
 * The foot (`.end-status`): the verdict and the save line, which control ends the row, and the one polite live
 * region's sentence.
 */
export function quizFoot(
  spec: QuizSpec,
  st: ItemState,
  saves: boolean,
): {
  shown: boolean;
  verdict: string;
  sub: string;
  kind: "" | "right" | "wrong";
  asking: boolean;
  action: boolean;
  live: string;
} {
  const graded = st.ph === "graded";
  const gap = spec.type === "cloze";
  const recall = spec.type === "recall";
  let verdict = "";
  let sub = "";
  let kind: "" | "right" | "wrong" = "";
  if (graded) {
    verdict = recall
      ? st.self === "got"
        ? Q.verdict.got
        : Q.verdict.missed
      : st.correct
        ? Q.verdict.right
        : Q.verdict.wrong;
    sub = saveLine(st, saves);
    kind = st.correct ? "right" : "wrong";
  } else if (gap && st.empty) {
    verdict = Q.verdict.empty;
    sub = Q.emptySub;
  } else if (recall && st.ph === "revealed") verdict = Q.verdict.ask;
  const asking = recall && st.ph === "revealed";
  return {
    shown: gap || graded || asking,
    verdict,
    sub,
    kind,
    asking,
    action: gap || graded,
    live: verdict ? verdict + (sub ? ` ${sub}` : "") : "",
  };
}

/** A wrong blank: what was typed, and every accepted form joined `a, b or c`. */
export function quizWrote(
  spec: QuizSpec,
  st: ItemState,
): { wrote: string; accepted: string } | null {
  if (spec.type !== "cloze" || st.ph !== "graded" || st.correct) return null;
  const forms = spec.accepted[0] ?? [];
  return {
    wrote: String(st.blanks[0] ?? "").trim(),
    accepted: joinAccepted(forms)
      .map((x) => x.v + x.sep)
      .join(""),
  };
}

/** A graded blank's field: `right` (an ink line) or `wrong` (struck through, `aria-invalid`). */
export function blankState(
  spec: QuizSpec,
  st: ItemState,
): "" | "right" | "wrong" {
  if (spec.type !== "cloze" || st.ph !== "graded") return "";
  return gradeItem(spec, st).oks[0] ? "right" : "wrong";
}
