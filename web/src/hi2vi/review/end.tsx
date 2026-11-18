"use client";

import Link from "next/link";
import { useId } from "react";

import { REVIEW } from "@/content/review";
import { Say } from "@/hi2vi/ui";
import { hangulRuns, isKorean } from "@/lib/reader/hangul";
import { LIBRARY_HREF } from "@/lib/reader-href";

import type { ContView, EndView } from "./end-model";

/**
 * The end of a review session (`ReviewEndBody.dc.html`; job 07 frame.md F214, F237, F241, F242), in the card's place
 * and form on `/review` under the head's held counts:
 *
 *   div.stack.gap-6
 *     > section.card-page.end-page[tabindex=-1] (focused when the queue ends: `[data-rv-end]`)
 *       > Done for today (not on none) + the title and its sentences, one span each
 *         + Change your daily limits → (the limits; opens Review settings) | Open the library → (none)
 *     + Continue reading (not on none; omitted with no pointer): the chapter's title, `{book} · Chapter n of N ·
 *       p% read` as its facts, and Continue reading → to the chapter, which opens at its kept place (the reader's
 *       resume, F242)
 *
 * The words and figures are `./end-model`'s; the page holds the queue, the sheets and the focus.
 */
export interface ReviewEndBodyProps {
  view: EndView;
  cont: ContView | null;
  onLimits: (opener: HTMLElement) => void;
}

export function ReviewEndBody({ view, cont, onLimits }: ReviewEndBodyProps) {
  const E = REVIEW.end;
  const uid = useId();
  const titleId = `${uid}-title`;
  const contId = `${uid}-cont`;
  const shown = view.library ? null : cont;
  return (
    <div className="stack gap-6">
      <section
        className="card-page end-page"
        tabIndex={-1}
        aria-labelledby={titleId}
        data-rv-end={view.kind}
      >
        {view.mark ? <Say state="done" word={E.mark} /> : null}
        <div className="stack gap-1">
          <div className="stack gap-2">
            <h2 id={titleId} className="end-title">
              {view.title}
            </h2>
            <p className="end-text">
              {view.sentences.map((s, i) => (
                <span key={i}>{s}</span>
              ))}
            </p>
          </div>
          {view.limits ? (
            <div className="cluster">
              <button
                type="button"
                className="link-row"
                aria-haspopup="dialog"
                onClick={(e) => onLimits(e.currentTarget)}
              >
                {E.changeLimits}
              </button>
            </div>
          ) : null}
        </div>
        {view.library ? (
          <div className="cluster">
            <Link
              className="btn btn-primary"
              href={LIBRARY_HREF}
              prefetch={false}
            >
              {E.openLibrary}
            </Link>
          </div>
        ) : null}
      </section>
      {shown ? (
        <section className="section end-cont" aria-labelledby={contId}>
          <div className="section-head">
            <h3 id={contId}>{E.continue.label}</h3>
          </div>
          <div className="panel">
            <div className="panel-body end-next">
              <div className="row-stack">
                <p className="end-next-title" lang={shown.lang}>
                  {hangulRuns(shown.title, !isKorean(shown.lang))}
                </p>
                <p className="dim end-facts">
                  <span className="end-facts-in">
                    <span className="end-fact">{shown.book}</span>
                    <span className="end-fact">
                      <span className="end-facts">
                        <span className="end-facts-in">
                          {shown.facts.map((f) => (
                            <span key={f} className="end-fact">
                              {f}
                            </span>
                          ))}
                        </span>
                      </span>
                    </span>
                  </span>
                </p>
              </div>
              <Link
                className="btn btn-primary"
                href={shown.href}
                prefetch={false}
              >
                {E.continue.go}
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
