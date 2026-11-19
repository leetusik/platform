import Link from "next/link";

import { LIBRARY_PAGE } from "@/content/library-page";

/**
 * The library's head and the parts its loading and failed states share (`Library.dc.html`): the
 * `h1` **Library** and, at the head's end, **Public library** when the org has a public address. There
 * is no All documents link: it is a view (F320).
 */
export function LibraryHead({ publicHref }: { publicHref: string | null }) {
  return (
    <header className="page-top">
      <div className="page-head">
        <div className="page-title">
          <h1>{LIBRARY_PAGE.title}</h1>
        </div>
        {publicHref ? (
          <Link className="link-row" href={publicHref}>
            {LIBRARY_PAGE.publicLibrary}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

const SHELF_SKELETON: {
  head: [string, string];
  rows: [string, string, string][];
}[] = [
  {
    head: ["6em", "10em"],
    rows: [
      ["12em", "11em", "7em"],
      ["18em", "", "6em"],
      ["14em", "", "5em"],
      ["16em", "", "6em"],
    ],
  },
  {
    head: ["4em", "9em"],
    rows: [
      ["15em", "6em", "6em"],
      ["13em", "", "5em"],
      ["17em", "", "7em"],
    ],
  },
];

/** By project while the page loads: two sections of skeleton rows (`Library.dc.html` Loading). */
export function ShelvesLoading() {
  return (
    <div className="library-shelves">
      {SHELF_SKELETON.map((shelf) => (
        <div key={shelf.head.join()} className="section">
          <div className="section-head">
            <h2>
              <span className="skel" style={{ width: shelf.head[0] }} />
            </h2>
            <span className="meta">
              <span className="skel" style={{ width: shelf.head[1] }} />
            </span>
          </div>
          <div className="panel shelf-list">
            <ul>
              {shelf.rows.map(([title, facts, state]) => (
                <li key={title} className="row shelf-row">
                  <span className="link-strong">
                    <span className="skel" style={{ width: title }} />
                  </span>
                  <div className="shelf-meta">
                    <span className="shelf-facts">
                      {facts ? (
                        <span className="skel" style={{ width: facts }} />
                      ) : null}
                    </span>
                    <span>
                      <span className="skel" style={{ width: state }} />
                    </span>
                    <span className="shelf-date num">
                      <span className="skel" style={{ width: "3em" }} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The toolbar while the page loads: the count as a bar, no choice of view. */
export function LibraryBarLoading() {
  return (
    <div className="split library-bar">
      <p className="dim">
        <span className="skel" style={{ width: "12em" }} />
        <span className="sr-only">{LIBRARY_PAGE.loading}</span>
      </p>
    </div>
  );
}
