"use client";

import {
  createContext,
  useContext,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useQuiz, type QuizFocus } from "@/components/reader/quiz";
import { READER_AIDS } from "@/content/reader-aids";
import { Save } from "@/hi2vi/library";
import {
  fresh,
  type ItemState,
  type QuizAction,
  type QuizSpec,
} from "@/lib/reader/quiz";
import type { QuizSavedItem } from "@/lib/reader/quiz-saved";

import {
  blankState,
  optionView,
  quizCount,
  quizFoot,
  quizHint,
  quizWhere,
  quizWrote,
} from "./quiz-model";

/**
 * The quiz in the Library's reader (P63-fk.S10; job 03, Library round 02: `BlocksQuiz.dc.html`, `## Build` § Page:
 * blocks *The quiz*): `section.read.blocks-quiz`, a head line (**Quiz** and its count), then one row an item
 * (`.blocks-q`): the number, the prompt, the hint, the answer (choose one, a gap in the sentence, recall's card), the
 * foot (`.end-status`: the verdict, a member's save line, **Check** / **Try again**), the explanation, a visitor's
 * Sign in to save under the first item graded, and one polite live region.
 *
 * The state, the grading, the send of each graded answer and its landing are the old quiz's, unchanged
 * (`useQuiz`): the same action, the same payload, at the same moments; a visitor is graded with nothing sent.
 * The server renders the items' words (`render.tsx`), as for the old quiz; a blank is `LibraryBlank`, placed in the
 * sentence by the renderer and fed by its item here.
 */

const Q = READER_AIDS.quiz;

export interface LibraryQuizItem {
  spec: QuizSpec;
  /** `<block>--<item>`: the row's id, where Sign in to save returns to. */
  domId: string;
  prompt: ReactNode;
  options?: ReactNode[];
  answer?: ReactNode;
  explain?: ReactNode;
  signInHref: string | null;
  saved?: QuizSavedItem;
}

export interface LibraryQuizProps {
  id: string;
  /** The block's name ("Quiz", or "Quiz: {title}"). */
  name: string;
  items: LibraryQuizItem[];
  member: boolean;
  write: { org: string; project: string; doc: string } | null;
  version: number;
  /** The chapter's language, on what a reader typed and the accepted forms. */
  lang: string;
}

/** The board's next steps: Try again → the first control; Show answer → the card; a grade → the row's action. */
const FOCUS: QuizFocus = {
  retry: "[data-first]",
  reveal: "[data-answer]",
  self: "[data-action]",
  check: "[data-action]",
  signclose: "[data-action]",
};

interface BlankCtx {
  value: string;
  state: "" | "right" | "wrong";
  graded: boolean;
  domId: string;
  onType: (v: string) => void;
  onCheck: () => void;
}

/** An item's own id (its spec's), the key of its state. */
const idOf = (items: readonly LibraryQuizItem[], i: number): string => {
  const { spec } = items[i];
  return spec.id;
};

const BlankContext = createContext<BlankCtx | null>(null);

/**
 * A gap in its sentence: the system's `.input`, 7.5em wide (`.blocks-gap`). What touches its end (a comma, a
 * Korean particle) stays on its line with it (`.blocks-gap-w`).
 */
export function LibraryBlank({ n, tail }: { n: number; tail?: ReactNode }) {
  const c = useContext(BlankContext);
  if (!c) return null;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter is Check; an Enter that commits an IME composition (Korean) is not.
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!c.graded) c.onCheck();
    }
  };
  const input = (
    <input
      type="text"
      className="input"
      id={`${c.domId}-b${n}`}
      value={c.value}
      readOnly={c.graded}
      aria-label={Q.blank(n, 1)}
      aria-invalid={c.state === "wrong" ? "true" : "false"}
      data-state={c.state || undefined}
      data-first=""
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      onChange={(e) => c.onType(e.target.value)}
      onKeyDown={onKey}
    />
  );
  return tail ? (
    <span className="blocks-gap-w">
      {input}
      {tail}
    </span>
  ) : (
    input
  );
}

export function LibraryQuiz(props: LibraryQuizProps) {
  const { id, items, member } = props;
  const total = items.length;
  const { states, sign, saves, act, rootRef } = useQuiz(props, FOCUS);
  const answered = items.filter(
    ({ spec }) => states[spec.id]?.ph === "graded",
  ).length;
  return (
    <section
      ref={rootRef}
      className="read blocks-quiz"
      id={id}
      data-block={id}
      aria-label={props.name}
    >
      <div className="blocks-quiz-head">
        <b>{Q.label}</b>
        <span>{quizCount(answered, total)}</span>
      </div>
      <ol className="blocks-quiz-items">
        {items.map((item, i) => (
          <QuizRow
            key={idOf(items, i)}
            item={item}
            st={states[idOf(items, i)] ?? fresh()}
            total={total}
            saves={saves}
            lang={props.lang}
            ask={
              !member &&
              sign.at === idOf(items, i) &&
              !sign.closed &&
              !!item.signInHref
            }
            act={(a) => act(item, a)}
          />
        ))}
      </ol>
    </section>
  );
}

function QuizRow({
  item,
  st,
  total,
  saves,
  lang,
  ask,
  act,
}: {
  item: LibraryQuizItem;
  st: ItemState;
  total: number;
  saves: boolean;
  lang: string;
  ask: boolean;
  act: (a: QuizAction | { t: "signclose" }) => void;
}) {
  const { spec, domId } = item;
  const graded = st.ph === "graded";
  const { where, heard } = quizWhere(spec, st, total);
  const foot = quizFoot(spec, st, saves);
  const wrote = quizWrote(spec, st);
  const n = spec.n;

  let answer: ReactNode = null;
  if (spec.type === "choice")
    answer = (
      <ul className="blocks-opts" aria-label={Q.options(n)}>
        {spec.options.map((o, j) => {
          const v = optionView(spec, st, j);
          return (
            <li key={o.id}>
              <button
                type="button"
                className="blocks-opt"
                data-first={j === 0 ? "" : undefined}
                data-state={v.state || undefined}
                aria-disabled={v.ariaDisabled}
                onClick={() => {
                  if (!graded) act({ t: "pick", opt: o.id });
                }}
              >
                <span className="blocks-opt-lead" aria-hidden="true">
                  <span className="blocks-opt-key">{v.key}</span>
                </span>
                <span>{item.options?.[j]}</span>
                {v.tag ? <span className="blocks-opt-tag">{v.tag}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  else if (spec.type === "recall") {
    const open = st.ph === "open";
    answer = (
      <div
        className="blocks-answer"
        role="group"
        aria-label={Q.answerOf(n)}
        tabIndex={-1}
        data-answer=""
      >
        <div className="blocks-answer-head">
          <span>{Q.answer}</span>
          {open ? (
            <button
              type="button"
              className="btn"
              aria-expanded="false"
              data-first=""
              onClick={() => act({ t: "reveal" })}
            >
              {Q.show}
            </button>
          ) : null}
        </div>
        {open ? null : (
          <div className="blocks-answer-text">
            <p>{item.answer}</p>
            {item.explain ? <p>{item.explain}</p> : null}
          </div>
        )}
      </div>
    );
  }

  const prompt =
    spec.type === "cloze" ? (
      <BlankContext.Provider
        value={{
          value: st.blanks[0] ?? "",
          state: blankState(spec, st),
          graded,
          domId,
          onType: (v) => act({ t: "type", n: 1, v }),
          onCheck: () => act({ t: "check" }),
        }}
      >
        <p className="blocks-q-prompt blocks-gap">{item.prompt}</p>
      </BlankContext.Provider>
    ) : (
      <p className="blocks-q-prompt">{item.prompt}</p>
    );

  return (
    <li className="blocks-q" id={domId}>
      <span className="blocks-q-n" aria-hidden="true">
        {n}
      </span>
      <div className="blocks-q-body">
        <div className="blocks-q-ask">
          <p className="blocks-q-where">
            {where}
            <span className="sr-only">{heard}</span>
          </p>
          {prompt}
          <p className="blocks-q-hint">{quizHint(spec)}</p>
          {/* A saved answer that cannot be shown starts fresh with the product's note (`04-quiz` *On return*). */}
          {st.note ? <p className="blocks-q-hint">{st.note}</p> : null}
        </div>
        {answer}
        {foot.shown ? (
          <div className="end-status blocks-q-foot">
            <p data-verdict={foot.kind || undefined}>
              <b>{foot.verdict}</b> <span>{foot.sub}</span>
            </p>
            {foot.asking ? (
              <div className="cluster">
                <button
                  type="button"
                  className="btn"
                  onClick={() => act({ t: "self", v: "got" })}
                >
                  {Q.got}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => act({ t: "self", v: "missed" })}
                >
                  {Q.missed}
                </button>
              </div>
            ) : null}
            {foot.action ? (
              <button
                type="button"
                className="btn"
                data-swap={graded ? "true" : "false"}
                data-action=""
                onClick={() => act(graded ? { t: "retry" } : { t: "check" })}
              >
                <span className="swap">
                  <span>{Q.check}</span>
                  <span>{Q.again}</span>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
        {wrote ? (
          <p className="blocks-q-wrote">
            {Q.wrote[0]}
            <b lang={lang}>{wrote.wrote}</b>
            {Q.wrote[1]}
            <b lang={lang}>{wrote.accepted}</b>
            {Q.wrote[2]}
          </p>
        ) : null}
        {graded && spec.type !== "recall" && item.explain ? (
          <p className="blocks-q-why">{item.explain}</p>
        ) : null}
        {ask && item.signInHref ? (
          <Save
            what="quiz"
            signInHref={item.signInHref}
            onNotNow={() => act({ t: "signclose" })}
          />
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {foot.live}
        </p>
      </div>
    </li>
  );
}
