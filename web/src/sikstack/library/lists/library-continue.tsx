import Link from "next/link";

import { CONTINUE } from "@/content/library-page";
import type { ContinueItem } from "@/lib/library/continue";
import { withFrom, type ListOrigin } from "@/lib/library/from";
import { cx } from "@/lib/cx";

import {
  continueRows,
  type ContinuePlace,
  type ContinueScope,
} from "./continue-model";

/**
 * LibraryContinue (`LibraryContinue.dc.html`, frame.md F323): Continue reading on a library. The text
 * last read leads: the panel's top edge is its progress line, its title at the title step, its facts,
 * and the page's one `.btn-primary`, **Continue reading** or **Read next**. The others in progress
 * follow, **Also in progress**, a row each: the title, then its facts on the columns a shelf row's
 * facts and state start on. `scope` `project` (a project's page): no row names the project, a
 * chapter's facts read `Chapter 13 of 40, How the workspace was built`, and the loading skeleton has
 * the lead only.
 *
 * Every item links to the reader at its place, carrying `from` (the list it is opened from) so the
 * way back returns there (F324, F328). The page leaves the part out when nothing is in progress.
 */
export interface LibraryContinueProps {
  items?: readonly ContinueItem[];
  loading?: boolean;
  scope?: ContinueScope;
  from?: ListOrigin | null;
}

const SKEL_MORE = [
  ["10em", "7em", "10em", "9em"],
  ["16em", "5em", "6em", "11em"],
];

function Place({ place }: { place: ContinuePlace }) {
  return (
    <span>
      {place.before}
      {place.section ? (
        <span lang={place.sectionLang ?? undefined}>{place.section}</span>
      ) : null}
      {place.after}
    </span>
  );
}

export function LibraryContinue({
  items = [],
  loading = false,
  scope = "org",
  from,
}: LibraryContinueProps) {
  const inProject = scope === "project";
  const rows = continueRows(items, scope);
  const lead = rows[0];
  const more = rows.slice(1);
  if (!loading && !lead) return null;
  return (
    <section
      className={cx("section library-continue", inProject && "is-project")}
      aria-label={CONTINUE.heading}
      aria-busy={loading ? true : undefined}
    >
      <div className="section-head">
        <h2>{CONTINUE.heading}</h2>
      </div>
      {loading ? (
        <div className="panel library-continue-panel">
          <div className="bar-line" aria-hidden="true" />
          <div className="library-lead">
            <div className="library-lead-text">
              <h3 className="library-lead-title">
                <span className="skel" style={{ width: "14em" }} />
              </h3>
              <p className="library-facts">
                <span>
                  <span className="skel" style={{ width: "20em" }} />
                </span>
              </p>
            </div>
            <button type="button" className="btn btn-primary" disabled>
              {CONTINUE.go}
            </button>
          </div>
          {inProject ? null : (
            <ul>
              {SKEL_MORE.map(([title, ...facts]) => (
                <li key={title} className="row library-also">
                  <span className="link-strong">
                    <span className="skel" style={{ width: title }} />
                  </span>
                  <div className="library-also-meta">
                    {facts.map((w, i) => (
                      <span key={i}>
                        <span className="skel" style={{ width: w }} />
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <span className="sr-only">{CONTINUE.loading}</span>
        </div>
      ) : (
        <div className="panel library-continue-panel">
          <div className="bar-line" aria-hidden="true">
            <i style={{ width: `${lead.pct}%` }} />
          </div>
          <div className="library-lead">
            <div className="library-lead-text">
              <h3 className="library-lead-title" lang={lead.lang}>
                {lead.title}
              </h3>
              <p className="library-facts">
                <span>{lead.where}</span>
                {lead.inName ? <span>{lead.inName}</span> : null}
                <Place place={lead.place} />
              </p>
            </div>
            <Link className="btn btn-primary" href={withFrom(lead.href, from)}>
              {lead.action}
            </Link>
          </div>
          {more.length > 0 ? (
            <ul aria-label={CONTINUE.also}>
              {more.map((it) => (
                <li key={it.key} className="row library-also">
                  <Link
                    className="link-strong"
                    lang={it.lang}
                    href={withFrom(it.href, from)}
                  >
                    {it.title}
                  </Link>
                  <div className="library-also-meta">
                    <span>{it.col1}</span>
                    {inProject ? null : <span>{it.inName}</span>}
                    <Place place={it.place} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
