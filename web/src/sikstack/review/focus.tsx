"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { BAR } from "@/content/library-frame";
import { REVIEW } from "@/content/review";
import { LIBRARY_HREF } from "@/lib/reader-href";

/**
 * Focus (`Focus.dc.html`, job 07 frame.md F201): Review's top bar, the reader's bar (03-library F53, F100) with
 * Review's controls. The wordmark and **Library** go to the library; **Settings** and **Display** at its end open
 * their sheet (`onOpen`) and are filled while it is open (`open`). 56 px, sticky. The 3 px line on its last 3 px
 * is the day's progress (`progress`, 0 to 100); `loading` keeps the bar whole and only empties the line. Without
 * `onOpen` (the route's loading and error files) the two controls are drawn and do nothing yet.
 */
export type FocusSheet = "settings" | "display";

export interface FocusProps {
  progress: number;
  loading?: boolean;
  open?: FocusSheet | null;
  onOpen?: (what: FocusSheet, from: HTMLElement) => void;
}

export function Focus({
  progress,
  loading = false,
  open = null,
  onOpen,
}: FocusProps) {
  const T = REVIEW.top;
  const pct = loading
    ? 0
    : Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const press = (what: FocusSheet) => (e: MouseEvent<HTMLButtonElement>) =>
    onOpen?.(what, e.currentTarget);
  return (
    <div className="bar-wrap is-sticky">
      <header className="top bar">
        <div className="top-row">
          <Link
            className="mark"
            href={LIBRARY_HREF}
            prefetch={false}
            aria-label={BAR.homeLabel}
          >
            {BAR.wordmark}
          </Link>
          {/* the account's place, kept at no width, so the wordmark sits on the Shell's line (03-library F33) */}
          <span className="bar-ghost" aria-hidden="true">
            <span className="avatar">J</span>
          </span>
          <Link className="back bar-back" href={LIBRARY_HREF} prefetch={false}>
            <span>{T.library}</span>
          </Link>
          <div className="bar-mid" />
          <div className="top-end">
            <button
              type="button"
              className="btn"
              aria-haspopup="dialog"
              aria-expanded={open === "settings"}
              onClick={press("settings")}
            >
              {T.settings}
            </button>
            <button
              type="button"
              className="btn"
              aria-haspopup="dialog"
              aria-expanded={open === "display"}
              aria-label={T.display}
              onClick={press("display")}
            >
              <span className="bar-long">{T.display}</span>
              <span className="bar-short" aria-hidden="true">
                {BAR.displayShort}
              </span>
            </button>
          </div>
        </div>
      </header>
      <div
        className="bar-line"
        role="progressbar"
        aria-label={T.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={loading ? T.progressLoading : T.progressText(pct)}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
