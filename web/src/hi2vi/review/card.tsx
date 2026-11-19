"use client";

import Link from "next/link";
import { useId, type KeyboardEvent, type ReactNode } from "react";

import { InlineText } from "@/components/review/inline";
import { REVIEW } from "@/content/review";
import { Say } from "@/hi2vi/ui";
import { cx } from "@/lib/cx";
import { hangulRuns, isKorean } from "@/lib/reader/hangul";
import type { ItemState, QuizAction, QuizSpec } from "@/lib/reader/quiz";
import type { QueueMeta, Rating, ReviewCard } from "@/lib/review/types";
import type { Inline } from "@/lib/native/tree";

import { cardView, type CardForm, type CardSend } from "./card-model";

/**
 * A review card (`ReviewCard.dc.html`; job 07 frame.md F216, F217, F223, F239, F242) and the row under it:
 *
 *   div.stack.gap-4
 *     > article.card-page.rv-card[tabindex=-1] (labelled by its kind line, between two ink hairlines)
 *       > the kind line (`.card-kind`: the word, its `badge is-wrap` tag) and the source (` · 한국어` on a Korean card)
 *       + the drift `.notice` + the item (choice graded on the tap; one blank, Enter is Check; recall with Show
 *         answer; a highlight's quote and Your note) + the foot (the main button's four labels in one `.hold` cell,
 *         or the pair, Good first, and the failure in the pair's cell) + one polite status line
 *     + .rv-where (From the chapter / the document, the title, the place, Open at this … →, Suspend card)
 *
 * The card's text (prompt, quote, options, answer, note, why) scales with Display's text size (`--read-k`); its chrome
 * does not (review.css). The page holds the answer, the sends and the queue (`review-frame.tsx`); the card only says
 * what was pressed. The focus hooks the page moves to: `[data-rv-card]` (a new card), `[data-rv-main]` (Next after a
 * grade, Try again after a failure), `[data-rv-answer]` (the answer after Show answer).
 */
export interface ReviewCardProps {
  card: ReviewCard;
  form: CardForm;
  spec: QuizSpec | null;
  st: ItemState | null;
  meta: Pick<QueueMeta, "day" | "now">;
  sending: CardSend | null;
  failed: CardSend | null;
  onAct: (a: QuizAction) => void;
  onRate: (rating: Rating) => void;
  onRetry: () => void;
  onSuspend: () => void;
}

const chrome = (s: string): ReactNode => hangulRuns(s, true);

export function ReviewCardView(props: ReviewCardProps) {
  const { card, st, sending } = props;
  const uid = useId();
  const kindId = `${uid}-kind`;
  const v = cardView(props);
  const wrap = !isKorean(v.lang);
  const text = (nodes: readonly Inline[] | null | undefined): ReactNode => (
    <InlineText nodes={nodes} wrap={wrap} hrefBase={v.hrefBase} />
  );
  const busy = sending !== null;

  // --- the item --------------------------------------------------------------------------------
  let item: ReactNode = null;
  if (card.source === "quiz" && st) {
    const graded = st.ph === "graded";
    const blank = (n: number, tail: ReactNode) => {
      const b = v.blank;
      if (!b) return null;
      const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        // Enter is Check; an Enter that commits an IME composition (Korean) is not.
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!graded && !busy) props.onAct({ t: "check" });
        }
      };
      const input = (
        <input
          id={`${uid}-gap`}
          className="input"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label={b.label}
          data-first=""
          data-state={b.state || undefined}
          aria-invalid={b.state === "wrong" ? "true" : "false"}
          readOnly={b.locked}
          value={st.blanks[n - 1] ?? ""}
          onChange={(e) => {
            if (!graded) props.onAct({ t: "type", n, v: e.target.value });
          }}
          onKeyDown={onKey}
          // With the keyboard up, the blank (and the foot below it) stays in view.
          onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
        />
      );
      // What touches the blank's end (a comma, a Korean particle) stays on its line with it.
      return tail ? (
        <span className="rv-gap-w">
          {input}
          {tail}
        </span>
      ) : (
        input
      );
    };
    item = (
      <>
        <div className="stack gap-1" lang={v.lang}>
          {card.item_type === "cloze" ? (
            <p className="card-prompt rv-gap">
              <InlineText
                nodes={card.front.text}
                wrap={wrap}
                hrefBase={v.hrefBase}
                cloze={{ blank }}
              />
            </p>
          ) : (
            <p className="card-prompt">{text(card.front.prompt)}</p>
          )}
          <p className="rv-hint" lang="en">
            {v.hint}
          </p>
        </div>
        {card.item_type === "choice" ? (
          <ul
            className="rv-opts"
            aria-label={REVIEW.card.answers}
            lang={v.lang}
          >
            {v.options.map((o, j) => (
              <li key={o.id}>
                <button
                  type="button"
                  className="rv-opt"
                  data-first={j === 0 ? "" : undefined}
                  data-state={o.state || undefined}
                  aria-disabled={o.graded ? "true" : "false"}
                  onClick={() => {
                    if (!o.graded && !busy)
                      props.onAct({ t: "pick", opt: o.id });
                  }}
                >
                  <span className="rv-opt-lead" aria-hidden="true">
                    <span className="rv-opt-key">{o.key}</span>
                  </span>
                  <span>{text(card.front.options[j]?.text)}</span>
                  {o.tag ? (
                    <span className="rv-opt-tag" lang="en">
                      {o.tag}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {card.item_type === "recall" ? (
          <div
            className="rv-answer"
            role="group"
            aria-label={REVIEW.card.answer}
            tabIndex={-1}
            data-rv-answer=""
          >
            <div className="rv-answer-head">
              <span>{REVIEW.card.answer}</span>
              {v.answerShown ? null : (
                <button
                  type="button"
                  className="btn"
                  aria-expanded="false"
                  data-first=""
                  onClick={() => props.onAct({ t: "reveal" })}
                >
                  {REVIEW.card.showAnswer}
                </button>
              )}
            </div>
            {v.answerShown ? (
              <div className="rv-answer-text rv-text" lang={v.lang}>
                <p>{text(card.back.answer)}</p>
                {card.back.explain && card.back.explain.length > 0 ? (
                  <p>{text(card.back.explain)}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {v.wrote ? (
          <p className="rv-wrote">
            {REVIEW.card.wrote[0]}
            <b lang={v.lang}>{v.wrote.wrote}</b>
            {REVIEW.card.wrote[1]}
            <b lang={v.lang}>{v.wrote.accepted}</b>
            {REVIEW.card.wrote[2]}
          </p>
        ) : null}
        {v.why && card.item_type !== "recall" ? (
          <p className="rv-text" lang={v.lang}>
            {text(card.back.explain)}
          </p>
        ) : null}
      </>
    );
  } else if (card.source === "highlight") {
    const note = card.front.note;
    item = (
      <>
        <blockquote className="card-quote" lang={v.lang}>
          {hangulRuns(card.front.quote ?? "", wrap)}
        </blockquote>
        {note ? (
          <div className="stack gap-1">
            <p className="label">{REVIEW.card.yourNote}</p>
            <p className="rv-text" lang={v.lang}>
              {hangulRuns(note, wrap)}
            </p>
          </div>
        ) : null}
      </>
    );
  }

  // --- the foot ------------------------------------------------------------------------------------
  const F = REVIEW.foot;
  const main = v.main;
  const onMain = () => {
    if (!main) return;
    if (main.press === "check") props.onAct({ t: "check" });
    else if (main.press === "retry") props.onRetry();
    else props.onRate(main.rating);
  };
  const held = (n: number) =>
    main && main.label === n ? undefined : "is-held";
  const pair = v.pair;

  return (
    <div className="stack gap-4">
      <article
        className="card-page rv-card"
        tabIndex={-1}
        aria-labelledby={kindId}
        data-rv-card={card.card_id}
      >
        <div className="stack gap-1">
          <p className="card-kind" id={kindId}>
            <span className="strong">{v.kindWord}</span>
            {v.tag ? <span className="badge is-wrap">{v.tag}</span> : null}
          </p>
          <p className="card-source">
            {chrome(v.source)}
            {v.langName ? (
              <>
                {" · "}
                <span lang={v.lang}>{v.langName}</span>
              </>
            ) : null}
          </p>
        </div>
        {v.drift ? <p className="notice">{REVIEW.card.drift}</p> : null}
        {item}
        {main ? (
          <div className="rv-foot">
            <Say
              className={cx(
                "rv-line",
                v.line.empty && "is-empty",
                v.line.fail && "rv-line-fail",
              )}
              state={v.line.state}
              word={v.line.word}
              rest={v.line.rest}
            />
            <button
              type="button"
              className="btn btn-primary rv-main"
              data-rv-main=""
              data-busy={main.busy ? "true" : "false"}
              aria-busy={main.busy ? "true" : "false"}
              disabled={main.disabled}
              onClick={onMain}
            >
              <span className="hold">
                <span className={held(0)}>{F.check}</span>
                <span className={held(1)}>{F.next}</span>
                <span className={held(2)}>{F.saving}</span>
                <span className={held(3)}>{F.tryAgain}</span>
              </span>
            </button>
          </div>
        ) : null}
        {pair ? (
          <div className="hold">
            <div className={cx("stack gap-2", pair.failed && "is-held")}>
              <p className="rate-ask">{pair.ask}</p>
              <div className="rate-pair">
                {[pair.good, pair.again].map((b) => (
                  <button
                    key={b.rating}
                    type="button"
                    className="btn rate"
                    data-rv-main={
                      b.rating === "good" &&
                      v.form === "highlight" &&
                      !pair.failed
                        ? ""
                        : undefined
                    }
                    data-busy={b.busy ? "true" : "false"}
                    aria-busy={b.busy ? "true" : "false"}
                    disabled={pair.disabled}
                    onClick={() => props.onRate(b.rating)}
                  >
                    <span className="swap">
                      <span>{b.word}</span>
                      <span>{F.saving}</span>
                    </span>
                    <span className="rate-ivl">{b.ivl}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={cx("stack gap-2", !pair.failed && "is-held")}>
              <Say
                className="rv-line rv-line-fail"
                state="fail"
                word={F.notSavedWord}
                rest={F.notSavedRest}
              />
              <button
                type="button"
                className="btn btn-primary rv-main"
                data-rv-main={pair.failed ? "" : undefined}
                onClick={props.onRetry}
              >
                {F.tryAgain}
              </button>
            </div>
          </div>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {v.live}
        </p>
      </article>
      <div className="rv-where">
        <p className="label">{v.where.label}</p>
        <p lang={v.where.titleLang}>
          {hangulRuns(v.where.title, !isKorean(v.where.titleLang))}
        </p>
        {v.where.place ? <p className="meta">{chrome(v.where.place)}</p> : null}
        <div className="rv-where-go">
          <Link
            className={cx("link-row", !v.where.open.shown && "is-off")}
            href={v.where.open.href}
            prefetch={false}
            aria-hidden={v.where.open.shown ? undefined : "true"}
            tabIndex={v.where.open.shown ? undefined : -1}
          >
            {v.where.open.word}
          </Link>
          <button
            type="button"
            className="btn"
            disabled={v.where.suspendOff}
            onClick={props.onSuspend}
          >
            {REVIEW.where.suspend}
          </button>
        </div>
      </div>
    </div>
  );
}
