import Link from "next/link";

import { BOOK_PAGE } from "@/content/book-page";
import { Badge, Skeleton, Status } from "@/hi2vi/ui";
import type { RowView } from "@/lib/book/view";

const T = BOOK_PAGE.contents;
const WAITS = ["14em", "11em", "17em", "9em", "13em"];

/**
 * BookChapters (`BookChapters.dc.html`; frame.md F63, the frame's chapter row): a book's contents in a
 * panel. A row: the number, the title (it opens the chapter), **Updated**, the state at the row's end (none
 * for a visitor). A chapter with two languages or an earlier version adds a line under the title: a link a
 * language (**Older translation** where the translation is behind), or `v2, published Oct 28` for one
 * language, and **Version history** at the line's end. Its region opens in place, one chapter at a time on
 * the page: the page holds `open` and hears `onVersions(key | null)`. View opens that version.
 */
export function BookChapters({
  rows,
  open = null,
  loading = false,
  onVersions,
}: {
  rows: readonly RowView[];
  open?: string | null;
  loading?: boolean;
  onVersions?: (key: string | null) => void;
}) {
  if (loading) {
    return (
      <div className="panel book-list" aria-busy="true">
        <ol className="chapters" aria-label={T.list}>
          {WAITS.map((w) => (
            <li key={w} className="chapter-row book-wait">
              <span className="chapter-n">
                <Skeleton width="1em" />
              </span>
              <span className="chapter-name">
                <span className="link-strong chapter-open">
                  <Skeleton width={w} />
                </span>
              </span>
              <span className="chapter-state">
                <Skeleton width="5em" />
              </span>
            </li>
          ))}
        </ol>
        <span className="sr-only">{BOOK_PAGE.states.loading}</span>
      </div>
    );
  }
  return (
    <div className="panel book-list">
      <ol className="chapters" aria-label={T.list}>
        {rows.map((row) => {
          const isOpen = row.multiVer && open === row.key;
          const hasVars = row.langs.length > 1 || row.multiVer;
          return (
            <li key={row.key} className="chapter-row">
              <span className="chapter-n">{row.n}</span>
              <span className="chapter-name">
                <Link
                  className="link-strong chapter-open"
                  href={row.href}
                  lang={row.lang}
                  prefetch={false}
                >
                  {row.title}
                </Link>
                {row.updated ? <Badge>{T.updated}</Badge> : null}
              </span>
              {row.state ? (
                <Status state={row.state.status} className="chapter-state">
                  {row.state.word}
                </Status>
              ) : null}
              {hasVars ? (
                <div className="book-vars">
                  <div className="book-langs">
                    {row.langs.length > 1
                      ? row.langs.map((l) => (
                          <span key={l.code} className="book-lang">
                            <Link
                              className="link-row"
                              href={l.href}
                              lang={l.code}
                              aria-label={l.aria}
                              prefetch={false}
                            >
                              {l.label}
                            </Link>
                            {l.stale ? (
                              <Badge>{T.olderTranslation}</Badge>
                            ) : null}
                          </span>
                        ))
                      : null}
                    {row.langs.length <= 1 && row.one ? (
                      <span className="book-one">{row.one}</span>
                    ) : null}
                  </div>
                  {row.multiVer ? (
                    <button
                      type="button"
                      className="link-row book-ver-btn"
                      aria-expanded={isOpen}
                      aria-label={T.versionHistoryAria(row.n)}
                      onClick={() => onVersions?.(isOpen ? null : row.key)}
                    >
                      {T.versionHistory}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {isOpen ? (
                <div
                  className="book-versions"
                  role="region"
                  aria-label={T.versionsOf(row.n)}
                >
                  {row.groups.map((g) => (
                    <div key={g.code} className="book-ver-group">
                      {row.groups.length > 1 ? (
                        <h3 lang={g.code}>{g.label}</h3>
                      ) : null}
                      <ol
                        className="version-list"
                        aria-label={T.groupAria(g.label)}
                      >
                        {g.rows.map((v) => (
                          <li key={v.n} className="row version-row">
                            <span className="version-name">
                              <span className="strong">{T.version(v.n)}</span>
                              {v.current ? <Badge>{T.current}</Badge> : null}
                            </span>
                            <span className="version-facts">
                              <span>{v.published}</span>
                              {v.from ? <span>{v.from}</span> : null}
                            </span>
                            <Link
                              className="btn"
                              href={v.href}
                              aria-label={v.aria}
                              prefetch={false}
                            >
                              {T.view}
                            </Link>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
