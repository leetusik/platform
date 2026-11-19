import type { ReactNode } from "react";

import { BookDock } from "@/components/book/book-listen";
import { ListenPlayer } from "@/components/listen/player";
import { UiRoot } from "@/hi2vi/ui";

import { ListenHost } from "./listen-host";

/**
 * The book page's frame, the Bar's (`Book.dc.html`, frame.md F52): `.ui > .page > .app.bare > Bar +
 * main.app-main > .column.is-narrow` (`.column` for a state: Not found and Error are F5's block). One
 * `main` a page. The page, its loading state, Not found and Error all draw it, so the Bar is complete in
 * every state. `nonce` is the request's (the book's address carries the reader routes' nonce CSP).
 *
 * `listenSignInHref`, on the loaded page: Listen's dock and player in their old look (operator decision 3),
 * fixed to the window, outside the column; each renders nothing until a Listen lives.
 */
export function BookFrame({
  bar,
  children,
  state = false,
  nonce,
  listenSignInHref,
}: {
  bar: ReactNode;
  children: ReactNode;
  /** A whole-page state: the children bring their own `.column`. */
  state?: boolean;
  nonce?: string;
  listenSignInHref?: string;
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
              <div className="column is-narrow book-col">{children}</div>
            )}
          </main>
          {listenSignInHref ? (
            <ListenHost>
              <BookDock signInHref={listenSignInHref} />
              <ListenPlayer signInHref={listenSignInHref} />
            </ListenHost>
          ) : null}
        </div>
      </div>
    </UiRoot>
  );
}
