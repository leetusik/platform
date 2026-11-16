import Link from "next/link";
import type { ReactNode } from "react";

import { HI2VI_STATES } from "@/content/hi2vi-states";
import { PROJECT_LIBRARY } from "@/content/project-library";
import { Bar } from "@/hi2vi/library";
import {
  LibraryContinue,
  LibraryDocs,
  type LibraryDocsProps,
} from "@/hi2vi/library/lists";
import type { StateModel } from "@/hi2vi/states";
import { UiRoot } from "@/hi2vi/ui";
import { withFrom } from "@/lib/library/from";
import type { ContinueItem } from "@/lib/library/continue";
import type { ShelfBook } from "@/lib/library/lists";
import {
  subLang,
  type ProjectLibraryView,
  type ProjectViewer,
} from "@/lib/project-library/model";
import { LIBRARY_HREF } from "@/lib/reader-href";

/**
 * A project's library page (job 03, Library round 02, `ProjectLibrary.dc.html`; `## Build` § Page:
 * project-library; frame.md F321 to F325, F328), for its two viewers:
 *
 * - **A member** at `/projects/{id}/library`, in the Shell (the `(app)` layout): this folder's page.
 * - **A visitor** at `/@{org}/{project}`, in the bar's frame (`PublicProjectFrame`):
 *   `app/(public)/[org]/[project]/page.tsx`, which mounts these same parts.
 *
 * The parts, in `.column` (24 px apart, F97): the head, Continue reading (a member's, within the
 * project), **Books**, **Documents** (`LibraryDocs`: search and Delete a member's), or Nothing to read.
 * Its sheet is `src/hi2vi/styles/library/project-library.css` (the `projlib-` classes).
 */

/** The head (`header.page-top`): a member's way back **Library**, then the name, Public or Private, the count. */
export function ProjectHead({
  view,
  viewer,
  loading = false,
}: {
  view?: Pick<ProjectLibraryView, "name" | "isPublic" | "count">;
  viewer: ProjectViewer;
  loading?: boolean;
}) {
  const t = PROJECT_LIBRARY;
  return (
    <header className="page-top">
      {viewer === "member" ? (
        <Link className="back" href={LIBRARY_HREF}>
          {t.back}
        </Link>
      ) : null}
      <div className="page-head">
        {loading || !view ? (
          <div className="page-title projlib-title" aria-hidden="true">
            <h1>
              <span className="skel" style={{ width: "6em" }} />
            </h1>
            <span className="meta">
              <span className="skel" style={{ width: "10em" }} />
            </span>
          </div>
        ) : (
          <div className="page-title projlib-title">
            <h1>{view.name}</h1>
            <span className="badge">
              {view.isPublic ? t.public : t.private}
            </span>
            <span className="meta">{view.count}</span>
          </div>
        )}
      </div>
    </header>
  );
}

/** **Books** (only when the project has one): the frame's shelf rows, split on the table's edges (F328). */
export function ProjectBooks({
  books,
  viewer,
  from,
}: {
  books: readonly ShelfBook[];
  viewer: ProjectViewer;
  from: ProjectLibraryView["from"];
}) {
  const t = PROJECT_LIBRARY;
  return (
    <section
      className="section projlib-books"
      aria-labelledby="projlib-books-h"
    >
      <div className="section-head">
        <h2 id="projlib-books-h">{t.books}</h2>
      </div>
      <div
        className={
          viewer === "member" ? "panel shelf-list" : "panel shelf-list no-state"
        }
      >
        <ul aria-label={t.books}>
          {books.map((b) => (
            <li key={b.key} className="row shelf-row">
              <div className="row-stack">
                <Link className="link-strong" href={withFrom(b.href, from)}>
                  {b.title}
                </Link>
                {b.sub ? (
                  <span className="meta shelf-sub" lang={subLang(b.sub)}>
                    {b.sub}
                  </span>
                ) : null}
              </div>
              <div className="shelf-meta">
                <span className="shelf-facts">
                  <span>{b.chapters}</span>
                  <span>{b.langs}</span>
                </span>
                {viewer === "member" && b.state ? (
                  <span className={b.state.cls}>{b.state.word}</span>
                ) : null}
                <span className="shelf-date num">{b.date}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Nothing to read (no book, no document): two sentences, each a line of its own (F328); a visitor's one. */
export function ProjectNothing({
  project,
  viewer,
}: {
  project: string;
  viewer: ProjectViewer;
}) {
  const t = PROJECT_LIBRARY.nothing;
  return (
    <section className="panel" aria-label={PROJECT_LIBRARY.views}>
      <div className="block">
        <p className="block-text projlib-nothing">
          {viewer === "member" ? (
            <>
              <span>{t.member(project)}</span>
              <span>{t.how}</span>
            </>
          ) : (
            <span>{t.visitor(project)}</span>
          )}
        </p>
      </div>
    </section>
  );
}

/** The documents table's props from the view; `failed` is the table's own failed state. */
export function docsProps(
  view: ProjectLibraryView,
  failed: boolean,
): LibraryDocsProps {
  const d = view.docs;
  const q = view.from.place.q ?? "";
  return failed
    ? {
        phase: "failed",
        viewer: view.viewer,
        q,
        scope: view.project,
        from: view.from,
      }
    : {
        items: d.items,
        phase: d.phase,
        viewer: view.viewer,
        count: d.count,
        q,
        scope: view.project,
        page: d.page,
        pages: d.pages,
        range: d.range,
        from: view.from,
      };
}

/** The page's parts once read: Continue reading, Books, Documents; or Nothing to read. */
export function ProjectParts({
  view,
  continueItems = [],
  docsFailed = false,
}: {
  view: ProjectLibraryView;
  continueItems?: readonly ContinueItem[];
  docsFailed?: boolean;
}) {
  if (view.nothing)
    return <ProjectNothing project={view.project} viewer={view.viewer} />;
  return (
    <>
      {view.viewer === "member" ? (
        <LibraryContinue
          items={continueItems}
          scope="project"
          from={view.from}
        />
      ) : null}
      {view.books.length > 0 ? (
        <ProjectBooks
          books={view.books}
          viewer={view.viewer}
          from={view.from}
        />
      ) : null}
      <LibraryDocs {...docsProps(view, docsFailed)} />
    </>
  );
}

/** The page while it loads: the head's bars, Continue reading's lead, one book row, the table's rows. */
export function ProjectLoading({ viewer }: { viewer: ProjectViewer }) {
  return (
    <div className="column">
      <ProjectHead viewer={viewer} loading />
      <LibraryContinue loading scope="project" />
      <section className="section projlib-books" aria-busy="true">
        <div className="section-head">
          <h2>{PROJECT_LIBRARY.books}</h2>
        </div>
        <div className="panel shelf-list" aria-hidden="true">
          <ul>
            <li className="row shelf-row">
              <span className="link-strong">
                <span className="skel" style={{ width: "12em" }} />
              </span>
              <div className="shelf-meta">
                <span className="shelf-facts">
                  <span className="skel" style={{ width: "11em" }} />
                </span>
                <span>
                  <span className="skel" style={{ width: "7em" }} />
                </span>
                <span className="shelf-date num">
                  <span className="skel" style={{ width: "3em" }} />
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>
      <LibraryDocs phase="loading" viewer={viewer} />
    </div>
  );
}

/**
 * A visitor's frame (frame.md F52): `.ui > .page > .app.bare > Bar + main.app-main`. The Bar: the way
 * back the org's name to its public library, the wordmark there too, no tools, not sticky; **Sign in**
 * for a reader who is signed out. `nonce` is the request's (`/@…` carries the reader routes' CSP).
 */
export function PublicProjectFrame({
  back,
  signInHref,
  nonce,
  children,
}: {
  back: { href: string; label: string };
  /** Sign in's link; none for a reader who is signed in. */
  signInHref?: string;
  nonce?: string;
  children: ReactNode;
}) {
  return (
    <UiRoot nonce={nonce}>
      <div className="page">
        <div className="app bare">
          <Bar
            back={back.label}
            backHref={back.href}
            homeHref={back.href}
            tools=""
            viewer={signInHref ? "visitor" : "member"}
            signInHref={signInHref}
            sticky={false}
          />
          <main id="main-content" className="app-main">
            {children}
          </main>
        </div>
      </div>
    </UiRoot>
  );
}

const backToLibrary = {
  kind: "link",
  label: PROJECT_LIBRARY.backToLibrary,
  href: LIBRARY_HREF,
  variant: "default",
} as const;

/**
 * Project not found (`ProjectLibrary.dc.html`, Not found; frame.md F71): a member reads that the
 * project does not exist or is not part of their org, and goes back to the Library; a visitor reads
 * that the link points at no public project, and is offered Sign in (a reader already signed in, the
 * Library instead).
 */
export function projectNotFound(
  who:
    | { viewer: "member"; orgName: string }
    | { viewer: "visitor"; signInHref: string | null },
): StateModel {
  const t = PROJECT_LIBRARY.notFound;
  if (who.viewer === "member")
    return {
      title: t.title,
      text: t.member(who.orgName),
      actions: [backToLibrary],
      reference: null,
    };
  return {
    title: t.title,
    text: t.visitor,
    actions: [
      who.signInHref
        ? {
            kind: "link",
            label: t.signIn,
            href: who.signInHref,
            variant: "default",
          }
        : backToLibrary,
    ],
    reference: null,
  };
}

/** Error (F5's whole): Try again (primary, re-fetches), a member's **Back to Library**, the reference. */
export function projectError({
  viewer,
  digest,
}: {
  viewer: ProjectViewer;
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
