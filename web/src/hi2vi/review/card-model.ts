/**
 * Review's card, as words and states (job 07-listen-review, round 01: frame.md F216, F217, F223, F239, F242;
 * `ReviewCard.dc.html`). Pure, and no `"use client"`: the card draws it, the tests read it. The grading, the
 * transitions and the sends stay the old ones (`lib/reader/quiz.ts`, `lib/review/*`); this module only says what the
 * signed card shows of them: the kind line, the item re-asked, the foot (the main button's four labels, or the pair)
 * and the where-row under the card.
 */
import { REVIEW } from "@/content/review";
import { itemWayBack, withFrom } from "@/lib/library/from";
import {
  gradeItem,
  joinAccepted,
  type ItemState,
  type QuizSpec,
} from "@/lib/reader/quiz";
import { languageName } from "@/lib/reader/language";
import {
  cardLang,
  formatInterval,
  placeText,
  sourceText,
  tagFor,
} from "@/lib/review/model";
import type { QueueMeta, Rating, ReviewCard } from "@/lib/review/types";

/** The four kinds job 07 draws (F216). */
export type CardForm = "choice" | "cloze" | "recall" | "highlight";

/**
 * The form job 07 draws for a card: choose one, one blank, recall, a highlight. A quiz item in a form only the old
 * quiz signs (several right answers, several blanks) has no drawn card, so it keeps today's card, whole, as the
 * Library's reader keeps today's quiz for those forms (`hi2vi/reader/aids/quiz-model.ts` `drawable`).
 */
export function drawnForm(
  card: ReviewCard,
  spec: QuizSpec | null,
): CardForm | null {
  if (card.source === "highlight") return "highlight";
  if (!spec) return null;
  if (spec.type === "choice") return spec.multi ? null : "choice";
  if (spec.type === "cloze") return spec.accepted.length === 1 ? "cloze" : null;
  return "recall";
}

/** A rating of this card in flight, or the one that failed. */
export interface CardSend {
  rating: Rating;
}

export type OptionState = "" | "right" | "wrong" | "answer";

export interface OptionView {
  id: string;
  key: string;
  state: OptionState;
  tag: string;
  /** Graded: the row stays a focusable button, `aria-disabled`, and a tap does nothing. */
  graded: boolean;
}

/** The line over the main button (`p.say.rv-line`): held one line tall, hidden while empty. */
export interface LineView {
  empty: boolean;
  /** The failure's one sentence, its dot a space's width either side (`.rv-line-fail`). */
  fail: boolean;
  /** The status shape: `undefined` is the plain dot (only while hidden). */
  state: "done" | "fail" | "idle" | undefined;
  word: string;
  rest: string;
}

/** The main button's four labels, in one cell: Check, Next, Saving…, Try again. */
export type MainLabel = 0 | 1 | 2 | 3;

export interface MainView {
  label: MainLabel;
  busy: boolean;
  disabled: boolean;
  /** What a press does: Check, rate the grade (right → Good, wrong → Again), or send the failed rating again. */
  press: "check" | "rate" | "retry";
  rating: Rating;
}

export interface RateView {
  rating: Rating;
  word: string;
  /** `Good · in 1 day` (F217). */
  ivl: string;
  busy: boolean;
}

export interface PairView {
  ask: string;
  good: RateView;
  again: RateView;
  disabled: boolean;
  /** The pair's cell holds the failed line and Try again instead. */
  failed: boolean;
}

export interface WhereView {
  label: string;
  title: string;
  titleLang: string;
  place: string;
  open: { word: string; href: string; shown: boolean };
  /** Suspend card waits while a rating is sent. */
  suspendOff: boolean;
}

export interface CardView {
  form: CardForm;
  kindWord: string;
  tag: string;
  source: string;
  /** The card's language, named in itself after the source (` · 한국어`), or null for English. */
  langName: string | null;
  lang: string;
  drift: boolean;
  hint: string;
  options: OptionView[];
  blank: {
    label: string;
    state: "" | "right" | "wrong";
    locked: boolean;
  } | null;
  answerShown: boolean;
  wrote: { wrote: string; accepted: string } | null;
  /** The why under a graded choice or blank (`.rv-text`). */
  why: boolean;
  main: MainView | null;
  line: LineView;
  pair: PairView | null;
  /** The card's polite status line: Saving…, the failure, the verdict and its rating line. */
  live: string;
  where: WhereView;
  /** For links inside the card's text (`#id`): the card's address without its fragment. */
  hrefBase: string;
}

/**
 * Open at this question → / highlight → (F242): the card's own place in its text (the server's address, its
 * fragment the quiz's or the highlighted block's id, inside the card's section), with the way back the reader names
 * (`?from=`, through the Library's `itemWayBack`: a member's Library).
 */
export function openHref(card: ReviewCard): string {
  const href = card.where.href;
  if (!href.startsWith("/")) return "/library";
  const way = itemWayBack(null, {
    member: true,
    orgs: [card.where.org],
    project: card.where.project,
  });
  return way ? withFrom(href, way.origin) : href;
}

const EMPTY_LINE: LineView = {
  empty: true,
  fail: false,
  state: undefined,
  word: REVIEW.foot.correct,
  rest: "",
};

export function cardView(args: {
  card: ReviewCard;
  form: CardForm;
  spec: QuizSpec | null;
  st: ItemState | null;
  meta: Pick<QueueMeta, "day" | "now">;
  sending: CardSend | null;
  failed: CardSend | null;
}): CardView {
  const { card, form, spec, st, meta, sending, failed } = args;
  const F = REVIEW.foot;
  const C = REVIEW.card;
  const W = REVIEW.where;
  const lang = cardLang(card);
  const graded = st?.ph === "graded";
  const saving = sending !== null;
  const fail = failed !== null && !saving;
  const good = formatInterval(card.previews.good.interval);
  const again = formatInterval(card.previews.again.interval);
  const quiz = form !== "highlight";
  const correct = graded && !!st?.correct;

  // --- the item ------------------------------------------------------------------------------
  const options: OptionView[] =
    form === "choice" && spec?.type === "choice" && st
      ? spec.options.map((o) => {
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
            id: o.id,
            key: o.key,
            state,
            tag: state ? C.optionTags[state] : "",
            graded,
          };
        })
      : [];
  const blank =
    form === "cloze" && spec?.type === "cloze" && st
      ? {
          label: C.blank(1, 1),
          state: (graded
            ? gradeItem(spec, st).oks[0]
              ? "right"
              : "wrong"
            : "") as "" | "right" | "wrong",
          locked: graded || saving,
        }
      : null;
  const wrote =
    form === "cloze" && spec?.type === "cloze" && st && graded && !correct
      ? {
          wrote: String(st.blanks[0] ?? "").trim(),
          accepted: joinAccepted(spec.accepted[0] ?? [])
            .map((x) => x.v + x.sep)
            .join(""),
        }
      : null;
  const explain =
    card.source === "quiz" && card.item_type !== "recall"
      ? card.back.explain
      : null;

  // --- the foot: choice and cloze, the main button and its line (F217, FG6, FG8) --------------------
  const hasMain = form === "cloze" || (form === "choice" && graded);
  let line: LineView = EMPTY_LINE;
  if (graded && fail)
    line = {
      empty: false,
      fail: true,
      state: "fail",
      word: F.notSavedWord,
      rest: F.notSavedRest,
    };
  else if (graded)
    line = {
      empty: false,
      fail: false,
      state: correct ? "done" : "fail",
      word: correct ? F.correct : F.incorrect,
      rest: correct ? F.rates("good", good) : F.rates("again", again),
    };
  else if (form === "cloze" && st?.empty)
    line = {
      empty: false,
      fail: false,
      state: "idle",
      word: F.nothingYet,
      rest: F.blankFirst,
    };
  const main: MainView | null = hasMain
    ? {
        label: !graded ? 0 : saving ? 2 : fail ? 3 : 1,
        busy: saving,
        disabled: saving,
        press: !graded ? "check" : fail ? "retry" : "rate",
        rating: correct ? "good" : "again",
      }
    : null;

  // --- the foot: recall (after Show answer) and highlight, the pair, Good first --------------------
  const pairOn =
    form === "highlight" || (form === "recall" && !!st && st.ph !== "open");
  const words = form === "highlight" ? F.highlight : F.recall;
  const rateOf = (rating: Rating): RateView => ({
    rating,
    word: rating === "good" ? words.good : words.again,
    ivl: F.preview(rating, rating === "good" ? good : again),
    busy: saving && sending?.rating === rating,
  });
  const pair: PairView | null = pairOn
    ? {
        ask: words.ask,
        good: rateOf("good"),
        again: rateOf("again"),
        disabled: saving || fail,
        failed: fail,
      }
    : null;

  const live = saving
    ? F.saving
    : fail
      ? F.notSaved
      : graded && (form === "choice" || form === "cloze")
        ? `${line.word}. ${line.rest}`
        : form === "recall" && st?.ph === "revealed"
          ? C.answerShown
          : "";

  const shown =
    form === "highlight" || graded || (form === "recall" && st?.ph !== "open");
  return {
    form,
    kindWord: quiz ? C.question : C.highlight,
    tag: tagFor(card, meta),
    source: sourceText(card),
    langName: lang !== "en" ? languageName(lang) : null,
    lang,
    drift: card.reset,
    hint:
      form === "choice"
        ? C.hints.choice
        : form === "cloze"
          ? C.hints.cloze
          : form === "recall"
            ? C.hints.recall
            : "",
    options,
    blank,
    answerShown: form === "recall" && !!st && st.ph !== "open",
    wrote,
    why: graded && !!explain && explain.length > 0,
    main,
    line,
    pair,
    live,
    where: {
      label: card.where.book === null ? W.fromDocument : W.fromChapter,
      title: card.where.chapter_title,
      titleLang: card.where.lang,
      place: placeText(card),
      open: {
        word: quiz ? W.openQuestion : W.openHighlight,
        href: openHref(card),
        shown,
      },
      suspendOff: saving,
    },
    hrefBase: card.where.href.split("#")[0],
  };
}
