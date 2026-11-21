import type { ReactNode } from "react";

import { ListenPlayerSheet } from "@/sikstack/listen/player";
import { UiRoot } from "@/sikstack/ui";

/**
 * The book page's frame, the Bar's (`Book.dc.html`, frame.md F52): `.ui > .page > .app.bare > Bar +
 * main.app-main > .column.is-narrow` (`.column` for a state: Not found and Error are F5's block). One
 * `main` a page. The page, its loading state, Not found and Error all draw it, so the Bar is complete in
 * every state. `nonce` is the request's (the book's address carries the reader routes' nonce CSP).
 *
 * `own`, on the loaded page: the body brings its own column, inside `.listen-book` with the dock's track (job 07
 * F208, F234 FG2; `BookBody`). `listenSignInHref`, on the loaded page: Listen's opened player (F211,
 * `ListenPlayerSheet`), once a page; it renders nothing until a Listen lives.
 */
export function BookFrame({
  bar,
  children,
  state = false,
  own = false,
  nonce,
  listenSignInHref,
}: {
  bar: ReactNode;
  children: ReactNode;
  /** A whole-page state: the children bring their own `.column`. */
  state?: boolean;
  /** The loaded page: the body brings its own `.column` (in `.listen-book`). */
  own?: boolean;
  nonce?: string;
  listenSignInHref?: string;
}) {
  return (
    <UiRoot nonce={nonce}>
      <div className="page">
        <div className="app bare">
          {bar}
          <main id="main-content" className="app-main">
            {state || own ? (
              children
            ) : (
              <div className="column is-narrow book-col">{children}</div>
            )}
          </main>
          {listenSignInHref ? (
            <ListenPlayerSheet signInHref={listenSignInHref} />
          ) : null}
        </div>
      </div>
    </UiRoot>
  );
}
