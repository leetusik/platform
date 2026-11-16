import type { ReactNode } from "react";

import { BOOK_PAGE } from "@/content/book-page";
import { Skeleton, Status } from "@/hi2vi/ui";
import type { HeadView } from "@/lib/book/view";

/** The head's id: the bar shows the book's title once this has scrolled away under it. */
export const BOOK_HEAD_ID = "book-head";

/**
 * BookHead (`BookHead.dc.html`): the title, and the second title beside it on its baseline when the read
 * carries one; at the head's end the place of Listen (a member only, `listen`); the description; one row
 * of facts: where the book lives, then a member's state and track, or a visitor's count and the line that
 * reading is not saved. No subject fact (frame.md F320). `loading` draws the skeleton in the same elements.
 */
export function BookHead({
  head,
  loading = false,
  listen = null,
}: {
  head?: HeadView | null;
  loading?: boolean;
  listen?: ReactNode;
}) {
  if (loading || !head) {
    return (
      <header className="book-head" id={BOOK_HEAD_ID} aria-busy="true">
        <div className="stack gap-1">
          <div className="page-head">
            <div className="page-title">
              <h1>
                <Skeleton width="9em" />
                <span className="sr-only">{BOOK_PAGE.states.loading}</span>
              </h1>
            </div>
          </div>
          <p className="book-desc">
            <Skeleton width="32em" />
          </p>
        </div>
        <div className="book-facts">
          <span>
            <Skeleton width="12em" />
          </span>
        </div>
      </header>
    );
  }
  return (
    <header className="book-head" id={BOOK_HEAD_ID}>
      <div className="stack gap-1">
        <div className="page-head">
          <div className="page-title">
            <h1>{head.title}</h1>
            {head.sub ? (
              <span className="book-sub" lang="ko">
                {head.sub}
              </span>
            ) : null}
          </div>
          {head.member && listen ? listen : null}
        </div>
        {head.description ? (
          <p className="book-desc">{head.description}</p>
        ) : null}
      </div>
      <div className="book-facts">
        <span className="dim">{head.place}</span>
        {head.member ? (
          <>
            <Status state={head.state.status}>{head.state.word}</Status>
            <span className="book-track" aria-hidden="true">
              <i
                style={{ width: `${Math.max(0, Math.min(100, head.pct))}%` }}
              />
            </span>
          </>
        ) : (
          <>
            <span>{head.count}</span>
            <span className="dim">{BOOK_PAGE.head.signedOut}</span>
          </>
        )}
      </div>
    </header>
  );
}
