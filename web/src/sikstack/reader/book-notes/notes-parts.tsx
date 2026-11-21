import type { ReactNode } from "react";

import { BOOK_NOTES } from "@/content/book-notes";
import { Skeleton, UiRoot } from "@/sikstack/ui";

import { NOTES_FILTERS } from "./model";

/**
 * The page's frame, the Bar's (`BookNotes.dc.html`, frame.md F52): `.ui > .page > .app.bare > Bar +
 * main.app-main > .column.is-narrow`; with `state` (Not found) the block brings its own `.column`. One `main` a
 * page; the page, its loading state, Did not load and Not found all draw it, so the Bar is complete in every
 * state. The product's scheme, not the reader's; no Display. `nonce` is the request's (the reader routes' CSP).
 */
export function NotesFrame({
  bar,
  children,
  state = false,
  nonce,
}: {
  bar: ReactNode;
  children: ReactNode;
  state?: boolean;
  nonce?: string;
}) {
  return (
    <UiRoot nonce={nonce}>
      <div className="page">
        <div className="app bare">
          {bar}
          <main id="main-content" className="app-main">
            {state ? (
              children
            ) : (
              <div className="column is-narrow">{children}</div>
            )}
          </main>
        </div>
      </div>
    </UiRoot>
  );
}

/**
 * The head, the same in every choice (only its values change): `h1` and one line of facts: the book's title,
 * the count, `N unanchored`. Then the choice (`children`), 16 px under the title block. While loading the
 * facts are skeleton bars, `aria-busy`, with `Loading…` for a screen reader.
 */
export function NotesHead({
  bookTitle,
  count,
  unanchored,
  loading = false,
  children,
}: {
  bookTitle?: string;
  count?: string;
  unanchored?: string | null;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <header className="stack">
      <div className="row-stack">
        <div className="page-head">
          <h1>{BOOK_NOTES.title}</h1>
        </div>
        <p className="bn-facts" aria-busy={loading || undefined}>
          {loading ? (
            <>
              <span>
                <Skeleton width="11em" />
              </span>
              <span>
                <Skeleton width="9em" />
              </span>
              <span className="sr-only">{BOOK_NOTES.loading}</span>
            </>
          ) : null}
          {bookTitle ? <span className="strong">{bookTitle}</span> : null}
          {count ? <span>{count}</span> : null}
          {unanchored ? <span>{unanchored}</span> : null}
        </p>
      </div>
      {children}
    </header>
  );
}

/** The three choices while the list is not there (loading, did not load): disabled, with no count. */
export function NotesChoiceWaiting() {
  return (
    <div className="choice bn-filter" role="group" aria-label={BOOK_NOTES.show}>
      {NOTES_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          className="btn"
          aria-pressed={false}
          disabled
        >
          {BOOK_NOTES.choice[f]}
        </button>
      ))}
    </div>
  );
}

/** Did not load: one panel, `Notes did not load.` and Try again, which fetches the page again. */
export function NotesFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="panel">
      <div className="block">
        <p className="block-text">{BOOK_NOTES.failed}</p>
        <button type="button" className="btn" onClick={onRetry}>
          {BOOK_NOTES.retry}
        </button>
      </div>
    </section>
  );
}

/** Two panels of skeleton rows (a text line and a meta line each), at the widths the board draws. */
const SKELETON: readonly (readonly [
  string,
  readonly (readonly [string, string])[],
])[] = [
  [
    "14em",
    [
      ["28em", "14em"],
      ["9em", "6em"],
    ],
  ],
  [
    "19em",
    [
      ["24em", "12em"],
      ["30em", "16em"],
      ["7em", "10em"],
    ],
  ],
];

/** The page while it loads: the head with its skeleton facts, the choices disabled, two panels of skeleton rows. */
export function NotesLoading() {
  return (
    <>
      <NotesHead loading>
        <NotesChoiceWaiting />
      </NotesHead>
      {SKELETON.map(([title, rows], i) => (
        <section key={i} className="panel" aria-busy="true">
          <div className="panel-head">
            <h2>
              <Skeleton width={title} />
            </h2>
          </div>
          <div className="panel-body has-rule bn-rows">
            <div className="mark-list">
              {rows.map(([text, meta], j) => (
                <div key={j} className="mark-row">
                  <div className="mark-main">
                    <span>
                      <Skeleton width={text} />
                    </span>
                    <span className="meta">
                      <Skeleton width={meta} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <span className="sr-only">{BOOK_NOTES.loading}</span>
        </section>
      ))}
    </>
  );
}
