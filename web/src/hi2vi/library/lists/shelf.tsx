import Link from "next/link";

import { SHELF } from "@/content/library-page";
import { withFrom, type ListOrigin } from "@/lib/library/from";
import type { ShelfModel } from "@/lib/library/lists";

/**
 * Shelf (`Shelf.dc.html`, frame.md F68, F321): one project's section of a library. Its name (breaking
 * after `_ - /`), **Public** or **Private** when `tag` (the member's library; the public library has
 * none), its count line, its books, its five newest documents, and the foot link to the project's
 * page: `All 132 documents`, `The one document`, or `Open <name>`. Nothing unfolds in place. A row
 * without a reading state (a visitor) makes the list `.no-state`.
 *
 * `from` is the list the section is on, carried to a book or a document so its way back returns
 * there (F324); `moreHref` is the project's page (a member's `/projects/{id}/library`, a visitor's
 * `/@{org}/{project}`), none when it has no address.
 */
export interface ShelfProps {
  shelf: ShelfModel;
  tag?: boolean;
  moreHref?: string | null;
  from?: ListOrigin | null;
}

export function Shelf({ shelf, tag = false, moreHref, from }: ShelfProps) {
  const member =
    shelf.books.some((b) => b.state !== null) ||
    shelf.docs.some((d) => d.state !== null);
  return (
    <section className="section shelf" aria-label={shelf.project}>
      <div className="section-head">
        <div className="page-title">
          <h2>{shelf.name}</h2>
          {tag ? (
            <span className="badge">
              {shelf.isPublic ? SHELF.public : SHELF.private}
            </span>
          ) : null}
        </div>
        <span className="meta">{shelf.count}</span>
      </div>
      <div
        className={member ? "panel shelf-list" : "panel shelf-list no-state"}
      >
        {shelf.books.length > 0 ? (
          <ul aria-label={SHELF.books(shelf.project)}>
            {shelf.books.map((b) => (
              <li key={b.key} className="row shelf-row">
                <div className="row-stack">
                  <Link className="link-strong" href={withFrom(b.href, from)}>
                    {b.title}
                  </Link>
                  {b.sub ? (
                    <span className="meta shelf-sub">{b.sub}</span>
                  ) : null}
                </div>
                <div className="shelf-meta">
                  <span className="shelf-facts">
                    <span>{b.chapters}</span>
                    <span>{b.langs}</span>
                  </span>
                  {b.state ? (
                    <span className={b.state.cls}>{b.state.word}</span>
                  ) : null}
                  <span className="shelf-date num">{b.date}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {shelf.docs.length > 0 ? (
          <ul aria-label={SHELF.documents(shelf.project)}>
            {shelf.docs.map((d) => (
              <li key={d.key} className="row shelf-row">
                <Link
                  className="link-strong"
                  lang={d.lang}
                  href={withFrom(d.href, from)}
                >
                  {d.title}
                </Link>
                <div className="shelf-meta">
                  <span className="shelf-facts">
                    {d.legacy ? (
                      <span className="badge">{SHELF.originalLayout}</span>
                    ) : null}
                  </span>
                  {d.state ? (
                    <span className={d.state.cls}>{d.state.word}</span>
                  ) : null}
                  <span className="shelf-date num">{d.date}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {moreHref ? (
          <div className="shelf-more">
            <Link className="link-row" href={moreHref}>
              {SHELF.more(shelf.docCount, shelf.project)}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
