"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";

import { BAR } from "@/content/library-frame";
import { cx } from "@/lib/cx";

import {
  barLanguages,
  barProgress,
  barScroll,
  barTools,
  readPercent,
  type BarScroll,
  type BarTool,
  type BarViewer,
} from "./bar-model";
import { Choice } from "./choice";

/**
 * Bar (`Bar.dc.html`, frame.md F53, F59, F89, F100): the one bar of every page outside the Shell
 * (a visitor's public library, the book, a book's notes, the reader). Complete in every state: the
 * wordmark at the Shell's place, the way back, then the controls at the end, each a bordered 44 px `.btn`.
 *
 * - `back`, `backShort`, `backHref`: the way back, named for where it goes (its short label under 40em
 *   of the bar); with no `backHref` it is a button. `onBack`, when given, is heard instead of the link.
 * - `title`, `meta`, `showTitle`: the page's title and one fact, beside the way back once the head has
 *   scrolled away. `tag`: one `.badge` before the controls (`Older version`, `Original layout`).
 * - `langs`, `lang`: the language choice, only when the text has two. `tools`: a space list of
 *   `notes ask display`, drawn in that order; **Ask is never drawn** until the assistant ships
 *   (operator decision 3), and then for a member only (F327). `asking` is kept for it.
 * - `viewer`: a visitor gets **Sign in** last. `sticky` false lets it scroll away (the visitor's public
 *   library). `reading`: it hides on the way down past 80 px and comes back near the top, at the end or
 *   after 64 px up (`onBars(hidden)`; `hidden` forces it); the progress line (`progress`, 0 to 100) lies
 *   on its last 3 px and stays; **Show reading controls** is the first Tab stop while it is hidden.
 *   `onProgress(pct)` reports how far the text has been read.
 * - `homeHref` makes the wordmark a link home (else it is a button heard by `onHome`); `signInHref`
 *   makes Sign in a link.
 */
export interface BarProps {
  back?: string;
  backShort?: string;
  backHref?: string;
  title?: string;
  meta?: string;
  showTitle?: boolean;
  tag?: string;
  langs?: readonly string[];
  lang?: string;
  tools?: string | readonly BarTool[];
  viewer?: BarViewer;
  reading?: boolean;
  hidden?: boolean;
  progress?: number | null;
  sticky?: boolean;
  /** Ask reads pressed while the assistant's panel is open (F93); kept for when Ask is drawn. */
  asking?: boolean;
  homeHref?: string;
  signInHref?: string;
  onHome?: () => void;
  onBack?: () => void;
  onLang?: (code: string) => void;
  onOpen?: (what: BarTool) => void;
  onSignIn?: () => void;
  onBars?: (hidden: boolean) => void;
  onProgress?: (pct: number) => void;
}

export function Bar({
  back = "",
  backShort,
  backHref,
  title = "",
  meta = "",
  showTitle = false,
  tag,
  langs,
  lang,
  tools,
  viewer = "member",
  reading = false,
  hidden: hiddenProp,
  progress,
  sticky = true,
  asking = false,
  homeHref,
  signInHref,
  onHome,
  onBack,
  onLang,
  onOpen,
  onSignIn,
  onBars,
  onProgress,
}: BarProps) {
  const [hiddenOwn, setHiddenOwn] = useState(false);
  const hidden = hiddenProp ?? hiddenOwn;
  const latest = useRef({ hidden, progress, onBars, onProgress });
  useEffect(() => {
    latest.current = { hidden, progress, onBars, onProgress };
  });

  useEffect(() => {
    if (!reading) return;
    let state: BarScroll = {
      hidden: latest.current.hidden,
      last: window.scrollY,
      up: 0,
    };
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      state = barScroll({ ...state, hidden: latest.current.hidden }, y, max);
      if (state.hidden !== latest.current.hidden) {
        if (latest.current.onBars) latest.current.onBars(state.hidden);
        else setHiddenOwn(state.hidden);
      }
      const pct = readPercent(y, max);
      if (latest.current.onProgress && pct !== latest.current.progress)
        latest.current.onProgress(pct);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reading]);

  const show = () => {
    if (onBars) onBars(false);
    else setHiddenOwn(false);
  };
  const shown = barTools(tools, viewer);
  const languages = barLanguages(langs, lang);
  const line = barProgress(progress);
  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onBack) {
      event.preventDefault();
      onBack();
    }
  };
  const backLabel = (
    <>
      <span className="bar-long">{back}</span>
      <span className="bar-short">{backShort || back}</span>
    </>
  );

  return (
    <div
      className={cx("bar-wrap", sticky && "is-sticky", hidden && "is-hidden")}
    >
      {hidden && (
        <button type="button" className="btn bar-show" onClick={show}>
          {BAR.showControls}
        </button>
      )}
      <header className="top bar">
        <div className="top-row">
          {homeHref ? (
            <Link
              className="mark"
              href={homeHref}
              aria-label={BAR.homeLabel}
              onClick={onHome}
            >
              {BAR.wordmark}
            </Link>
          ) : (
            <button
              type="button"
              className="mark"
              aria-label={BAR.homeLabel}
              onClick={onHome}
            >
              {BAR.wordmark}
            </button>
          )}
          {/* the account's place, kept at no width, so the wordmark sits on the Shell's line (frame.md F33) */}
          <span className="bar-ghost" aria-hidden="true">
            <span className="avatar">J</span>
          </span>
          {back &&
            (backHref ? (
              <Link className="back bar-back" href={backHref} onClick={goBack}>
                {backLabel}
              </Link>
            ) : (
              <button type="button" className="back bar-back" onClick={onBack}>
                {backLabel}
              </button>
            ))}
          <div className="bar-mid">
            {showTitle && title && (
              <>
                <span className="bar-title truncate">{title}</span>
                <span className="meta bar-meta">{meta}</span>
              </>
            )}
          </div>
          <div className="top-end">
            {tag && <span className="badge">{tag}</span>}
            {languages.length > 0 && (
              <Choice
                label={BAR.language}
                value={languages.find((l) => l.pressed)?.code}
                onChange={onLang}
                options={languages.map((l) => ({
                  value: l.code,
                  content: l.short,
                  ariaLabel: l.name,
                  lang: l.code,
                }))}
              />
            )}
            {shown.includes("notes") && (
              <button
                type="button"
                className="btn"
                onClick={() => onOpen?.("notes")}
              >
                {BAR.notes}
              </button>
            )}
            {shown.includes("ask") && (
              <button
                type="button"
                className="btn"
                aria-pressed={asking}
                onClick={() => onOpen?.("ask")}
              >
                {BAR.ask}
              </button>
            )}
            {shown.includes("display") && (
              <button
                type="button"
                className="btn"
                aria-label={BAR.display}
                onClick={() => onOpen?.("display")}
              >
                <span className="bar-long">{BAR.display}</span>
                <span className="bar-short" aria-hidden="true">
                  {BAR.displayShort}
                </span>
              </button>
            )}
            {viewer === "visitor" &&
              (signInHref ? (
                <Link className="btn" href={signInHref} onClick={onSignIn}>
                  {BAR.signIn}
                </Link>
              ) : (
                <button type="button" className="btn" onClick={onSignIn}>
                  {BAR.signIn}
                </button>
              ))}
          </div>
        </div>
      </header>
      {line !== null && (
        <div className="bar-line" aria-hidden="true">
          <i style={{ width: `${line}%` }} />
        </div>
      )}
    </div>
  );
}
