import type { MouseEvent } from "react";
import Link from "next/link";

import {
  COLUMNS,
  FEEDBACK,
  FILTER,
  RATING,
  PAGES_LABEL,
} from "@/content/feedback-frame";
import { LIST_BODY, LOADING, noMatch } from "@/content/feedback-list";
import { SIKSTACK_STATES } from "@/content/sikstack-states";
import {
  Absent,
  ClampLink,
  FilterBar,
  Rating,
  StackTable,
  type RatingFilter,
} from "@/sikstack/feedback";
import { Pager } from "@/sikstack/library/pager";
import { countLine } from "@/lib/feedback/format";
import {
  feedbackHref,
  feedbackPageHref,
  isFiltered,
  type FeedbackPlace,
  type FeedbackScope,
} from "@/lib/feedback/place";

import {
  filtersSet,
  isBusy,
  isCounting,
  listBody,
  listRange,
  pageCount,
  type FeedbackListRow,
  type ListPhase,
} from "./model";

/**
 * The Feedback list (`Feedback.dc.html` § the list, `FeedbackList.dc.html`, `FeedbackListStates.dc.html`):
 * the head (`h1` Feedback, the count line, Clear while a search or a filter is set), then the list's
 * panel (`section.panel[aria-label=Feedback]`): the bar, one body (the table, eight skeleton rows, or a
 * block), the Library's pager. Presentational: what to show and where a request is come in as props;
 * the handlers are the client island's (`./list.tsx`). Without them every way is a plain link or a GET.
 */
export interface FeedbackListViewProps {
  /** The project picked in the Shell, or null for the org's own list. */
  scope: FeedbackScope;
  place: FeedbackPlace;
  /** The org's projects: the select's options (left out with a project picked). */
  projects: readonly { id: string; name: string }[];
  rows: readonly FeedbackListRow[];
  /** The list's total as read (the matches under a search or a filter). */
  total: number;
  phase: ListPhase;
  /** The page asked for while it loads (`paging`): marked current at once. */
  pending?: number | null;
  onSearch?: (q: string) => void;
  onProject?: (project: string | null, q: string) => void;
  onRating?: (rating: RatingFilter | null, q: string) => void;
  onClear?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onPage?: (n: number, event: MouseEvent<HTMLAnchorElement>) => void;
  onRetry?: () => void;
}

/** The skeleton rows' message bars (`FeedbackList.dc.html`), one a row. */
const SKELETON = [
  "26em",
  "18em",
  "32em",
  "22em",
  "14em",
  "28em",
  "20em",
  "24em",
];

export function FeedbackListView({
  scope,
  place,
  projects,
  rows,
  total,
  phase,
  pending = null,
  onSearch,
  onProject,
  onRating,
  onClear,
  onPage,
  onRetry,
}: FeedbackListViewProps) {
  const picked = scope !== null;
  const filtered = isFiltered(place);
  const body = listBody({
    phase,
    rows: rows.length,
    projects: projects.length,
    filtered,
  });
  const counting = isCounting(phase);
  const pages = pageCount(total);
  const asked =
    phase === "paging" && pending !== null && pending >= 1
      ? Math.min(pending, pages)
      : null;

  return (
    <div className="column">
      <header className="page-top">
        <div className="page-head">
          <h1>{FEEDBACK}</h1>
          <div className="cluster gap-4">
            <p className="meta" role="status">
              {counting ? (
                <>
                  <span className="skel" />
                  <span className="sr-only">{LOADING}</span>
                </>
              ) : phase !== "failed" ? (
                countLine(total, filtered)
              ) : null}
            </p>
            {filtered ? (
              <Link
                className="btn"
                aria-label={FILTER.clearLabel}
                href={feedbackHref(scope)}
                onClick={onClear}
              >
                {FILTER.clear}
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <section
        className="panel"
        aria-label={FEEDBACK}
        aria-busy={isBusy(phase) ? true : undefined}
      >
        <FilterBar
          action={feedbackHref(scope)}
          q={place.q}
          projects={picked ? null : projects}
          project={place.project}
          rating={place.rating}
          disabled={phase === "loading" || projects.length === 0}
          onSearch={onSearch}
          onProject={onProject}
          onRating={onRating}
        />
        {body === "rows" || body === "waiting" ? (
          <StackTable set>
            <thead>
              <tr>
                <th scope="col" className="stack-rating">
                  {COLUMNS.rating}
                </th>
                <th scope="col">{COLUMNS.feedback}</th>
                {picked ? null : (
                  <th scope="col" className="stack-project">
                    {COLUMNS.project}
                  </th>
                )}
                <th scope="col" className="stack-product">
                  {COLUMNS.product}
                </th>
                <th scope="col" className="num stack-when">
                  {COLUMNS.when}
                </th>
              </tr>
            </thead>
            <tbody>
              {body === "rows"
                ? rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">
                        <Rating value={r.value} />
                      </td>
                      <td className="has-control is-main">
                        <ClampLink href={r.href} lang={r.lang}>
                          {r.message}
                        </ClampLink>
                      </td>
                      {picked ? null : (
                        <td className="stack-wrap" lang={r.projectLang}>
                          {r.project ?? <Absent />}
                        </td>
                      )}
                      <td className="stack-wrap">{r.product ?? <Absent />}</td>
                      <td className="num dim to-end">
                        <time dateTime={r.at}>{r.when}</time>
                      </td>
                    </tr>
                  ))
                : SKELETON.map((width, i) => (
                    <tr key={i} aria-hidden="true">
                      <td className="nowrap">
                        <span className="swap fl-ghost">
                          <span className="skel" style={{ width: "100%" }} />
                          <span className="rating rating-disliked">
                            {RATING.disliked}
                          </span>
                        </span>
                      </td>
                      <td className="has-control is-main">
                        <span className="link-strong">
                          <span className="skel" style={{ width }} />
                        </span>
                      </td>
                      {picked ? null : (
                        <td className="nowrap">
                          <span>
                            <span className="skel" style={{ width: "5em" }} />
                          </span>
                        </td>
                      )}
                      <td className="nowrap">
                        <span>
                          <span className="skel" style={{ width: "4em" }} />
                        </span>
                      </td>
                      <td className="num to-end">
                        <span>
                          <span className="skel" style={{ width: "3em" }} />
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </StackTable>
        ) : null}
        {body === "none" ? (
          <div className="fl-body block">
            <p className="block-text">
              {LIST_BODY.none.before}
              <span className="fl-keep">{LIST_BODY.none.key}</span>
            </p>
          </div>
        ) : null}
        {body === "no-projects" ? (
          <div className="fl-body block">
            <p className="block-text">
              {LIST_BODY.noProjects.before}
              <span className="fl-keep">
                <Link
                  className="link fl-inline"
                  href={SIKSTACK_STATES.orgHomeHref}
                >
                  {LIST_BODY.noProjects.overview}
                </Link>
                {LIST_BODY.noProjects.comma}
              </span>
              {LIST_BODY.noProjects.middle}
              <span className="fl-keep">{LIST_BODY.noProjects.key}</span>
            </p>
          </div>
        ) : null}
        {body === "no-match" ? (
          <div className="fl-body block">
            <p className="block-text">{noMatch(place.q, filtersSet(place))}</p>
          </div>
        ) : null}
        {body === "failed" ? (
          <div className="fl-body block">
            <p className="block-text">{LIST_BODY.failed}</p>
            <button type="button" className="btn" onClick={onRetry}>
              {LIST_BODY.retry}
            </button>
          </div>
        ) : null}
        {body === "rows" && pages > 1 ? (
          <Pager
            page={asked ?? place.page}
            pages={pages}
            range={listRange(place.page, total)}
            label={PAGES_LABEL}
            hrefFor={(n) => feedbackPageHref(scope, place, n)}
            onPage={onPage}
          />
        ) : null}
      </section>
    </div>
  );
}
