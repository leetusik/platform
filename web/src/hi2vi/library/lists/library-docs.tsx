"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { deleteDocumentAction } from "@/app/(app)/documents/actions";
import { DOCS, LIBRARY_PAGE } from "@/content/library-page";
import { Dialog, DialogActions } from "@/hi2vi/frame";
import { Pager } from "@/hi2vi/library/pager";
import { publishToast } from "@/hi2vi/shell";
import { Button } from "@/hi2vi/ui";
import { cx } from "@/lib/cx";
import { markIn, tagsShown } from "@/lib/library/excerpt";
import {
  encodeFrom,
  LIBRARY_ORIGIN,
  withFrom,
  type ListOrigin,
} from "@/lib/library/from";
import { nameBreaks, type DocItem } from "@/lib/library/lists";
import type { ListPlace } from "@/lib/reader-href";

/**
 * LibraryDocs (`LibraryDocs.dc.html`, frame.md F322, F328): the one documents table, for the library's
 * All documents and a project's page. A head with its count (or none, `head` false: the page's
 * toolbar carries the count), then one panel: the search (a member's), the rows, the pager.
 *
 * - **Search**: the field, **Project** when `projects` is given (it applies as it is picked, with what
 *   is typed), **Search** (a `.btn`, never primary) and **Reset**. Search trims and goes to page 1;
 *   Reset clears the search and the filter and goes to page 1. Each is an address (`from`'s list at
 *   its new place), so the way back from a document returns to it. Off while the list loads.
 * - **A row**: the title (the row's one link), the project with `projects`, up to three tags (those
 *   holding the query first, `+n` for the rest), the date, **Delete** (a member's). The query is
 *   marked in the title and the tags; a match only in the text adds the excerpt.
 * - **Delete** asks in F3's dialog (frame.md F69): **Cancel** first, **Yes, delete** → `Deleting…` at
 *   the same width. Done: the dialog closes, the toast reads `Document deleted.` and the page reads
 *   its lists again, so the row goes, every count drops by one and the document leaves Continue
 *   reading. Failed: the row stands with `Could not delete this document. Try again.` under it.
 *   The delete is the existing action (`deleteDocumentAction`), unchanged.
 * - **States**: `rows`, `loading` (eight skeleton rows in a real row's columns), `empty`, `none` (the
 *   query quoted; Reset is the way out), `failed` (**Try again** reads the page again).
 * - **The pager** closes the panel under a rule; none with one page.
 */
export type LibraryDocsPhase = "rows" | "loading" | "empty" | "none" | "failed";

export interface LibraryDocsProps {
  items?: readonly DocItem[];
  phase: LibraryDocsPhase;
  viewer?: "member" | "visitor";
  /** `132 documents`, `11 of 132 documents` (the head's; the library's toolbar carries its own). */
  count?: string;
  /** The query searched: marked in the rows, quoted when nothing matched. */
  q?: string;
  /** The project's name, for the no-match sentence (a project's page, or the library's filter). */
  scope?: string | null;
  page?: number;
  pages?: number;
  /** `26–50 of 240`. */
  range?: string;
  /** The org's projects: the Project filter and the project column (the library's All documents). */
  projects?: readonly { id: string; name: string }[] | null;
  /** The picked project's id, or null for All projects. */
  filter?: string | null;
  /** False: no head of its own (the section is named `Documents`). */
  head?: boolean;
  /** The list this table is (its address at its place): links carry it, and the search moves it. */
  from?: ListOrigin;
}

const SKEL: [string, string, string][] = [
  ["14em", "10em", "4em"],
  ["11em", "8em", "6em"],
  ["16em", "12em", "4em"],
  ["9em", "10em", "8em"],
  ["13em", "8em", "4em"],
  ["15em", "12em", "5em"],
  ["10em", "10em", "4em"],
  ["12em", "8em", "6em"],
];

/** The list's address at another place: the search, the filter, the page. */
function docsPlaceHref(from: ListOrigin, place: ListPlace): string {
  return encodeFrom({ ...from, place } as ListOrigin);
}

function Marked({ text, q }: { text: string; q: string | undefined }) {
  const cut = markIn(text, q);
  return (
    <>
      {cut.before}
      {cut.hit ? <mark className="libdocs-hit">{cut.hit}</mark> : null}
      {cut.after}
    </>
  );
}

export function LibraryDocs({
  items = [],
  phase: phaseIn,
  viewer = "member",
  count = "",
  q = "",
  scope = null,
  page = 1,
  pages = 1,
  range = "",
  projects = null,
  filter = null,
  head = true,
  from = LIBRARY_ORIGIN,
}: LibraryDocsProps) {
  const router = useRouter();
  const uid = useId();
  const [moving, startMove] = useTransition();
  const [draft, setDraft] = useState({ q, value: q });
  const [asking, setAsking] = useState<DocItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState<number | null>(null);
  const [gone, setGone] = useState<readonly number[]>([]);
  const [, startRefresh] = useTransition();
  const cancel = useRef<HTMLButtonElement>(null);

  const member = viewer !== "visitor";
  const phase: LibraryDocsPhase = moving ? "loading" : phaseIn;
  const off = phase === "loading";
  const value = draft.q === q ? draft.value : q;
  const hasProject = !!projects;
  const place = from.place;

  const go = (next: ListPlace) =>
    startMove(() => {
      router.push(docsPlaceHref(from, next));
    });
  const search = () => go({ ...place, q: value.trim() || null, page: 1 });
  const pick = (id: string) =>
    go({ ...place, filter: id || null, q: value.trim() || null, page: 1 });
  const reset = () => {
    setDraft({ q, value: "" });
    go({ ...place, q: null, filter: null, page: 1 });
  };
  const retry = () =>
    startMove(() => {
      router.refresh();
    });

  const confirm = async () => {
    if (!asking || deleting) return;
    const target = asking;
    setDeleting(true);
    const form = new FormData();
    form.set("documentId", String(target.id));
    let ok = false;
    try {
      const result = await deleteDocumentAction({ error: null }, form);
      ok = result.error === null;
    } catch {
      ok = false;
    }
    setDeleting(false);
    setAsking(null);
    if (!ok) {
      setFailed(target.id);
      return;
    }
    setFailed(null);
    // The row goes now; the page then reads its lists again, so every count drops by one and the
    // document leaves Continue reading and its section.
    setGone((ids) => [...ids, target.id]);
    publishToast(LIBRARY_PAGE.deleted);
    startRefresh(() => {
      router.refresh();
    });
  };

  const headId = `${uid}-h`;
  const listAt = (n: number) => docsPlaceHref(from, { ...place, page: n });

  return (
    <section
      className="section libdocs"
      aria-labelledby={head ? headId : undefined}
      aria-label={head ? undefined : DOCS.heading}
      aria-busy={off ? true : undefined}
    >
      {head ? (
        <div className="section-head libdocs-head">
          <h2 id={headId}>{DOCS.heading}</h2>
          {!off && phase !== "failed" && count ? (
            <span className="meta">{count}</span>
          ) : null}
          {off ? (
            <span className="meta" aria-hidden="true">
              <span className="skel" style={{ width: "7em" }} />
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={cx(
          "panel libdocs-panel",
          !member && "is-visitor",
          hasProject && "has-project",
        )}
      >
        {member && phase !== "empty" ? (
          <form
            className="libdocs-tools"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (!off) search();
            }}
          >
            <label className="sr-only" htmlFor={`${uid}-q`}>
              {DOCS.searchLabel}
            </label>
            <input
              className="input libdocs-q"
              id={`${uid}-q`}
              type="search"
              placeholder={DOCS.placeholder}
              value={value}
              disabled={off}
              onChange={(event) => setDraft({ q, value: event.target.value })}
            />
            {hasProject && projects ? (
              <>
                <label className="sr-only" htmlFor={`${uid}-p`}>
                  {DOCS.project}
                </label>
                <select
                  className="input libdocs-pick"
                  id={`${uid}-p`}
                  value={filter ?? ""}
                  disabled={off}
                  onChange={(event) => pick(event.target.value)}
                >
                  <option value="">{DOCS.allProjects}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <div className="cluster libdocs-go">
              <button type="submit" className="btn" disabled={off}>
                {DOCS.search}
              </button>
              <button
                type="button"
                className="btn"
                disabled={off}
                onClick={reset}
              >
                {DOCS.reset}
              </button>
            </div>
          </form>
        ) : null}

        {phase === "rows" ? (
          <ul aria-label={DOCS.heading}>
            {items
              .filter((d) => !gone.includes(d.id))
              .map((d) => {
                const tags = tagsShown(d.tags, q);
                const text = d.match?.where === "text" ? d.match.excerpt : null;
                return (
                  <li key={d.key} className="row libdocs-row">
                    <div className="row-stack libdocs-name">
                      <Link
                        className="link-strong libdocs-open"
                        lang={d.lang}
                        href={withFrom(d.href, from)}
                      >
                        <span>
                          <Marked text={d.title} q={q} />
                        </span>
                      </Link>
                      {text ? (
                        <p className="meta libdocs-snippet" lang={d.lang}>
                          {text.before}
                          <mark className="libdocs-hit">{text.hit}</mark>
                          {text.after}
                        </p>
                      ) : null}
                    </div>
                    <div className="libdocs-facts">
                      {hasProject ? (
                        <span className="libdocs-project">
                          {nameBreaks(d.project)}
                        </span>
                      ) : null}
                      <ul className="libdocs-tags" aria-label={DOCS.tags}>
                        {tags.shown.map((t, i) => (
                          <li key={`${i}-${t.before}${t.hit}${t.after}`}>
                            {t.before}
                            {t.hit ? (
                              <mark className="libdocs-hit">{t.hit}</mark>
                            ) : null}
                            {t.after}
                            {tags.rest.length > 0 &&
                            i === tags.shown.length - 1 ? (
                              <>
                                <span
                                  className="libdocs-more"
                                  aria-hidden="true"
                                >
                                  {DOCS.more(tags.rest.length)}
                                </span>
                                <span className="sr-only">
                                  {DOCS.moreLabel(tags.rest)}
                                </span>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <span className="libdocs-date">{d.date}</span>
                    </div>
                    {member ? (
                      <button
                        type="button"
                        className="btn libdocs-delete"
                        aria-label={DOCS.deleteLabel(d.title)}
                        onClick={() => setAsking(d)}
                      >
                        {DOCS.delete}
                      </button>
                    ) : null}
                    {failed === d.id ? (
                      <p className="field-error libdocs-error" role="alert">
                        {DOCS.deleteFailed}
                      </p>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        ) : null}

        {phase === "loading" ? (
          <>
            <p className="sr-only">{DOCS.loading}</p>
            <ul aria-hidden="true">
              {SKEL.map(([title, tags, project]) => (
                <li key={title + tags + project} className="row libdocs-row">
                  <span className="libdocs-wait">
                    <span className="skel" style={{ width: title }} />
                  </span>
                  <div className="libdocs-facts">
                    {hasProject ? (
                      <span className="libdocs-project">
                        <span className="skel" style={{ width: project }} />
                      </span>
                    ) : null}
                    <span className="libdocs-tags">
                      <span className="skel" style={{ width: tags }} />
                    </span>
                    <span className="libdocs-date">
                      <span className="skel" style={{ width: "3em" }} />
                    </span>
                  </div>
                  {member ? (
                    <span className="btn libdocs-delete is-off">
                      {DOCS.delete}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {phase === "empty" ? (
          <div className="block">
            <p className="block-text">{DOCS.empty}</p>
          </div>
        ) : null}

        {phase === "none" ? (
          <div className="block">
            <p className="block-text">{DOCS.none(q, scope)}</p>
          </div>
        ) : null}

        {phase === "failed" ? (
          <div className="block">
            <p className="block-text" role="alert">
              {DOCS.failed}
            </p>
            <button type="button" className="btn" onClick={retry}>
              {DOCS.retry}
            </button>
          </div>
        ) : null}

        {phase === "rows" && pages > 1 ? (
          <Pager
            page={page}
            pages={pages}
            range={range}
            label={DOCS.pagesLabel}
            hrefFor={listAt}
          />
        ) : null}
      </div>

      {asking ? (
        <Dialog
          label={DOCS.dialog.title(asking.title)}
          initialFocus={cancel}
          locked={deleting}
          onClose={() => {
            if (!deleting) setAsking(null);
          }}
        >
          <h2>
            {DOCS.dialog.before}
            <span lang={asking.lang}>{asking.title}</span>
            {DOCS.dialog.after}
          </h2>
          <p>{DOCS.dialog.text}</p>
          <DialogActions>
            <Button
              ref={cancel}
              disabled={deleting}
              onClick={() => {
                if (!deleting) setAsking(null);
              }}
            >
              {DOCS.dialog.cancel}
            </Button>
            <Button
              variant="danger"
              busy={deleting}
              busyLabel={DOCS.dialog.deleting}
              onClick={() => {
                void confirm();
              }}
            >
              {DOCS.dialog.confirm}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </section>
  );
}
