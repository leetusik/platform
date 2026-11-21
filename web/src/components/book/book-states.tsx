import { BOOK_PAGE } from "@/content/book-page";
import { SIKSTACK_STATES } from "@/content/sikstack-states";
import { Skeleton } from "@/sikstack/ui";
import type { StateModel } from "@/sikstack/states";

import { BookChapters } from "./book-chapters";
import { BookContinue } from "./book-continue";
import { BookHead } from "./book-head";

/**
 * The book page while it loads (`Book.dc.html`, preset Loading): the Bar complete (the frame's), skeleton
 * bars in the real elements: the title's line, the description, the facts; the way on's two lines at its
 * button's height; Contents with five rows at a row's height. `aria-busy` and `Loading…` for a screen
 * reader.
 */
export function BookLoading() {
  return (
    <>
      <BookHead loading />
      <BookContinue loading />
      <section
        className="section"
        aria-labelledby="book-contents"
        aria-busy="true"
      >
        <div className="section-head">
          <h2 id="book-contents">{BOOK_PAGE.contents.title}</h2>
          <span className="meta">
            <Skeleton width="6em" />
          </span>
        </div>
        <BookChapters rows={[]} loading />
      </section>
    </>
  );
}

/**
 * Book not found (frame.md F71, F5's block): a member reads that the book does not exist or is not part of
 * their org, and goes back where they came from; a visitor reads that the link points at no shared book,
 * and is offered Sign in.
 */
export function bookNotFound({
  signedIn,
  back,
  signInHref,
}: {
  signedIn: boolean;
  back: { href: string; label: string };
  signInHref: string;
}): StateModel {
  const t = BOOK_PAGE.states.notFound;
  return {
    title: t.title,
    text: signedIn ? t.member : t.visitor,
    actions: [
      signedIn
        ? {
            kind: "link",
            label: SIKSTACK_STATES.back(back.label),
            href: back.href,
            variant: "default",
          }
        : {
            kind: "link",
            label: t.signIn,
            href: signInHref,
            variant: "default",
          },
    ],
    reference: null,
  };
}

/** Error (F5's whole): Try again (primary, re-fetches), the way back, and the reference when there is one. */
export function bookError({
  back,
  digest,
}: {
  back: { href: string; label: string };
  digest?: string | null;
}): StateModel {
  const e = SIKSTACK_STATES.error;
  return {
    title: e.title,
    text: e.text,
    actions: [
      { kind: "retry", label: e.retry, variant: "primary" },
      {
        kind: "link",
        label: SIKSTACK_STATES.back(back.label),
        href: back.href,
        variant: "default",
      },
    ],
    reference: digest ? e.reference(digest) : null,
  };
}
