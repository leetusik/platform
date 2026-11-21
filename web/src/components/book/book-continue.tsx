import Link from "next/link";

import { BOOK_PAGE } from "@/content/book-page";
import { Skeleton } from "@/sikstack/ui";
import type { ContView } from "@/lib/book/view";

/**
 * BookContinue (`BookContinue.dc.html`): the way on, a panel named by its mode: the chapter's title, a line
 * of facts, in `next` and `start` its lede, then the page's one primary button (secondary when every
 * chapter is finished and none changed). Under it, for a reader whose book has marks, the way into the
 * book's notes with their count. `loading` keeps the block at its button's height.
 */
export function BookContinue({
  cont,
  notes = null,
  loading = false,
}: {
  cont?: ContView | null;
  notes?: { href: string; line: string } | null;
  loading?: boolean;
}) {
  if (loading || !cont) {
    return (
      <section className="panel book-cont" aria-busy="true">
        <div className="panel-body end-next">
          <div className="row-stack book-cont-wait">
            <p className="end-next-title">
              <Skeleton width="16em" />
            </p>
            <p>
              <Skeleton width="11em" />
            </p>
          </div>
        </div>
        <span className="sr-only">{BOOK_PAGE.states.loading}</span>
      </section>
    );
  }
  const lang = cont.lang ?? undefined;
  return (
    <section className="panel book-cont" aria-label={cont.name}>
      <div className="panel-body end-next">
        <div className="row-stack">
          <h2 className="end-next-title" lang={lang}>
            {cont.title}
          </h2>
          {cont.facts.length > 0 ? (
            <p className="dim book-cont-facts">
              {cont.facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </p>
          ) : null}
          {cont.lede ? (
            <p className="dim book-cont-lede" lang={lang}>
              {cont.lede}
            </p>
          ) : null}
        </div>
        <Link
          className={cont.primary ? "btn btn-primary" : "btn"}
          href={cont.href}
          prefetch={false}
        >
          {cont.action}
        </Link>
      </div>
      {notes ? (
        <div className="row book-notes">
          <Link className="link-strong" href={notes.href} prefetch={false}>
            {BOOK_PAGE.notes.title}
          </Link>
          <span className="book-notes-count">{notes.line}</span>
        </div>
      ) : null}
    </section>
  );
}
