"use client";

import { useId } from "react";

import { REVIEW } from "@/content/review";
import { cx } from "@/lib/cx";
import { hangulRuns } from "@/lib/reader/hangul";

import type { DueRow } from "./model";

/**
 * DueHead (`DueHead.dc.html`, job 07 frame.md F215): Review's head, on `/review` and above the end of a session.
 * `h1` **Review**; the day's three counts (figures 600 in `--ink`, words in `--ink-2`); **By book**, a read-only
 * disclosure (each book, then the documents not in a book, then one note); then the saved line, always laid out
 * (hidden while empty), so the card under it never moves. `loading`: the counts are a skeleton and
 * `Loading your cards…` is said; By book waits (`aria-disabled`).
 */
export interface Saved {
  word: string;
  rest: string;
}

export interface DueHeadProps {
  counts: { due: number; nw: number; done: number };
  rows: readonly DueRow[];
  open: boolean;
  note: string;
  saved: Saved | null;
  loading?: boolean;
  onBooks?: (open: boolean) => void;
}

export function DueHead({
  counts,
  rows,
  open,
  note,
  saved,
  loading = false,
  onBooks,
}: DueHeadProps) {
  const H = REVIEW.head;
  const regionId = useId();
  const isOpen = open && !loading;
  return (
    <header className="due-head" aria-busy={loading ? "true" : undefined}>
      <h1>{H.title}</h1>
      {loading ? (
        <p className="due-counts">
          <span className="skel" style={{ width: "18em" }} />
          <span className="sr-only">{H.loadingLabel}</span>
        </p>
      ) : (
        <p className="due-counts">
          <span>
            <strong>{counts.due}</strong> {H.due}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{counts.nw}</strong> {H.newHighlight(counts.nw)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{counts.done}</strong> {H.doneToday}
          </span>
        </p>
      )}
      <div className="by-book">
        <button
          type="button"
          className="link-row by-book-btn"
          aria-expanded={open}
          aria-controls={regionId}
          aria-disabled={loading}
          onClick={() => {
            if (!loading) onBooks?.(!open);
          }}
        >
          {H.byBook}
        </button>
        {isOpen ? (
          <div id={regionId} role="region" aria-label={H.booksLabel}>
            {rows.length > 0 ? (
              <ul className="by-book-list">
                {rows.map((r) => (
                  <li className="by-book-row" key={r.key}>
                    <span className="by-book-name">
                      <span className="strong">
                        {hangulRuns(r.title, true)}
                      </span>
                      {r.sub ? (
                        <span className="meta">{hangulRuns(r.sub, true)}</span>
                      ) : null}
                    </span>
                    <span className="by-book-figs">
                      <span>{r.dueText}</span>
                      <span>{r.newText}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="by-book-note">{note}</p>
          </div>
        ) : null}
      </div>
      <p className={cx("say saved-line", !saved && "is-empty")} role="status">
        <span className="status status-done">{saved?.word ?? H.saved}</span>
        <span className="say-rest">{saved?.rest ?? ""}</span>
      </p>
    </header>
  );
}
