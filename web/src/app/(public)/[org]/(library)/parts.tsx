import Link from "next/link";

import { HI2VI_STATES } from "@/content/hi2vi-states";
import { PUBLIC_LIBRARY } from "@/content/public-library";
import { Shelf } from "@/hi2vi/library/lists";
import type { StateModel } from "@/hi2vi/states";
import type { ListOrigin } from "@/lib/library/from";
import type { PublicShelf, PublicViewer } from "@/lib/public-library/model";
import { LIBRARY_HREF } from "@/lib/reader-href";

/**
 * An org's public library (job 03, Library round 02, `PublicLibrary.dc.html`, `PublicLibraryHead.dc.html`;
 * `## Build` § Page: public-library; frame.md F52, F71, F321), drawn in `main.app-main > .column` of its
 * frame (`./frame.tsx`): the head, then one `Shelf` per public project (no **Public** tag: every one is
 * public here), 24 px apart. Not shown here, by design: Continue reading, Your reading data, the Public
 * tag, the count of projects with nothing to read. Its sheet is
 * `src/hi2vi/styles/library/public-library.css` (the `publib-` classes).
 */

/** Where a member's **Personal’s projects** goes: org home, where the org's projects are listed. */
const ORG_HOME_HREF = HI2VI_STATES.orgHomeHref;

/**
 * `PublicLibraryHead` (`header.page-top`): a member's way back **Library** on its own line, the org's
 * name, `Public library` and the count, then one note: a visitor's (with **Sign in**), a member's, or
 * nothing public (a member's, with the link to the org's projects). Loading: the name and the facts as
 * bars in their own lines, no note.
 */
export function PublicLibraryHead({
  orgName = "",
  count = "",
  viewer,
  phase,
  signInHref,
}: {
  orgName?: string;
  count?: string;
  viewer: PublicViewer;
  phase: "ready" | "empty" | "loading";
  /** A visitor's **Sign in** in the note: to sign-in, returning here. */
  signInHref?: string;
}) {
  const t = PUBLIC_LIBRARY;
  const member = viewer === "member";
  const loading = phase === "loading";
  return (
    <header
      className="page-top publib-head"
      aria-busy={loading ? "true" : undefined}
    >
      {member ? (
        <Link className="back" href={LIBRARY_HREF}>
          {t.back}
        </Link>
      ) : null}
      <div className="publib-main">
        <div className="page-head">
          {loading ? (
            <h1>
              <span className="skel" aria-hidden="true" />
              <span className="sr-only">{t.loading}</span>
            </h1>
          ) : (
            <h1>{orgName}</h1>
          )}
        </div>
        <div className="publib-under">
          {loading ? (
            <p className="publib-facts" aria-hidden="true">
              <span className="skel" />
            </p>
          ) : (
            <p className="publib-facts">
              <span className="strong">{t.facts}</span>
              <span className="publib-count">{count}</span>
            </p>
          )}
          {phase === "ready" && !member ? (
            <p className="publib-note">
              {t.note.visitor.before}
              <Link className="link publib-in" href={signInHref ?? "/login"}>
                <span>{t.note.visitor.signIn}</span>
              </Link>
              {t.note.visitor.after}
            </p>
          ) : null}
          {phase === "ready" && member ? (
            <p className="publib-note">{t.note.member}</p>
          ) : null}
          {phase === "empty" && member ? (
            <p className="publib-note">
              {t.note.empty.before}
              <Link className="link publib-in" href={ORG_HOME_HREF}>
                <span>{t.note.empty.projects(orgName)}</span>
              </Link>
              {t.note.empty.after}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** The shelves: a project's section with its five newest documents and the foot link to its page. */
export function PublicShelves({
  shelves,
  from,
}: {
  shelves: readonly PublicShelf[];
  from: ListOrigin;
}) {
  return (
    <div className="publib-shelves">
      {shelves.map(({ shelf, moreHref }) => (
        <Shelf key={shelf.key} shelf={shelf} moreHref={moreHref} from={from} />
      ))}
    </div>
  );
}

const SKELETON_ROWS = ["16em", "13em", "9em", "14em", "11em", "12em"];

/**
 * Loading: the head's bars, then one shelf: its head as bars and six skeleton rows of a real row's
 * height (a state column for a member only).
 */
export function PublicLibraryLoading({ viewer }: { viewer: PublicViewer }) {
  const member = viewer === "member";
  return (
    <div className="column">
      <PublicLibraryHead viewer={viewer} phase="loading" />
      <section className="section shelf" aria-busy="true">
        <div className="section-head">
          <h2>
            <span className="skel" aria-hidden="true" />
            <span className="sr-only">{PUBLIC_LIBRARY.loading}</span>
          </h2>
          <span className="meta" aria-hidden="true">
            <span className="skel" />
          </span>
        </div>
        <div
          className={member ? "panel shelf-list" : "panel shelf-list no-state"}
          aria-hidden="true"
        >
          <ul>
            {SKELETON_ROWS.map((w, i) => (
              <li key={i} className="row shelf-row">
                <span className="link-strong">
                  <span className="skel" style={{ width: w }} />
                </span>
                <div className="shelf-meta">
                  <span className="shelf-facts" />
                  {member ? (
                    <span>
                      <span className="skel" style={{ width: "6em" }} />
                    </span>
                  ) : null}
                  <span className="shelf-date num">
                    <span className="skel" style={{ width: "3em" }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const backToLibrary = {
  kind: "link",
  label: PUBLIC_LIBRARY.backToLibrary,
  href: LIBRARY_HREF,
  variant: "default",
} as const;

/**
 * Library not found (F71): a visitor reads that the link points at no public library and is offered
 * **Sign in** (returning here); a member reads that the library does not exist or shows nothing public,
 * and goes back to the Library.
 */
export function libraryNotFound(
  who: { viewer: "member" } | { viewer: "visitor"; signInHref: string },
): StateModel {
  const t = PUBLIC_LIBRARY.notFound;
  return who.viewer === "member"
    ? {
        title: t.title,
        text: t.member,
        actions: [backToLibrary],
        reference: null,
      }
    : {
        title: t.title,
        text: t.visitor,
        actions: [
          {
            kind: "link",
            label: t.signIn,
            href: who.signInHref,
            variant: "default",
          },
        ],
        reference: null,
      };
}

/** Error (F5's whole): **Try again** (primary, re-fetches), a member's **Back to Library**, the reference. */
export function libraryError({
  viewer,
  digest,
}: {
  viewer: PublicViewer;
  digest?: string | null;
}): StateModel {
  const e = HI2VI_STATES.error;
  return {
    title: e.title,
    text: e.text,
    actions: [
      { kind: "retry", label: e.retry, variant: "primary" },
      ...(viewer === "member" ? [backToLibrary] : []),
    ],
    reference: digest ? e.reference(digest) : null,
  };
}
