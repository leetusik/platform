import type { Metadata } from "next";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { LIBRARY_PAGE } from "@/content/library-page";
import {
  LibraryContinue,
  LibraryDocs,
  Shelf,
  type LibraryDocsProps,
} from "@/sikstack/library/lists";
import { requireIdentity } from "@/lib/auth-guards";
import type { FormatOptions } from "@/lib/format";
import type { ListOrigin } from "@/lib/library/from";
import {
  listPlace,
  readLibraryPlace,
  type LibraryPlace,
} from "@/lib/library/list-place";
import { docsTable, shelvesOf } from "@/lib/library/lists";
import {
  loadDocsSource,
  loadOrgLists,
  type OrgLists,
} from "@/lib/library/load-lists";
import { projectLibraryHref, publicLibraryHref } from "@/lib/reader-href";
import { viewerTimeZone } from "@/lib/time-zone";

import { LibraryFailed, LibraryReadingData, ViewChoice } from "./client-parts";
import { LibraryHead } from "./parts";

/**
 * The Library (job 03, Library round 02, `Library.dc.html`; frame.md F68, F320 to F323): a system page
 * in the Shell (`current` library, no project picked). The head and **Public library**; Continue
 * reading; the two views over the org's books and documents, **By project** (a section a project with
 * its five newest documents and the way to its page) and **All documents** (the documents table:
 * search, the Project filter, Delete, 25 a page); then Your reading data.
 *
 * The view, page, search and filter are the address's (`?view=all&page=3&q=…&filter=…`), so a link
 * to a document carries them (`withFrom`) and its way back returns to that view and page (F324).
 * The reads are `load-lists.ts`'s; a fault of the library's is its failed state (the head and Your
 * reading data stand), a fault of the table's own reads the table's. Dates are in the viewer's zone.
 */
export const metadata: Metadata = {
  title: LIBRARY_PAGE.title,
  robots: { index: false },
};

type Params = Record<string, string | string[] | undefined>;

async function readLists(
  token: string,
  identity: Awaited<ReturnType<typeof requireIdentity>>["identity"],
): Promise<OrgLists | null> {
  try {
    return await loadOrgLists(token, identity);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

async function readDocs(
  token: string,
  lists: OrgLists,
  place: LibraryPlace,
  format: FormatOptions,
): Promise<LibraryDocsProps> {
  const origin: ListOrigin = { origin: "library", place: listPlace(place) };
  const projects = lists.listing.projects.map((p) => ({
    id: p.name,
    name: p.name,
  }));
  try {
    const source = await loadDocsSource(token, lists.listing, {
      q: place.q,
      filter: place.filter,
      page: place.page,
    });
    const table = docsTable(lists.listing, source, {
      q: place.q,
      filter: place.filter,
      page: place.page,
      format,
    });
    return {
      items: table.items,
      phase: table.phase,
      count: table.count,
      q: place.q,
      scope: table.filter,
      page: table.page,
      pages: table.pages,
      range: table.range,
      projects,
      filter: table.filter,
      head: false,
      from: origin,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      phase: "failed",
      q: place.q,
      projects,
      filter: place.filter,
      head: false,
      from: origin,
    };
  }
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { token, identity } = await requireIdentity();
  const place = readLibraryPlace(await searchParams);
  const format: FormatOptions = { timeZone: viewerTimeZone(await cookies()) };
  const slug = identity.tenant?.slug?.trim() || null;
  const head = (
    <LibraryHead publicHref={slug ? publicLibraryHref(slug) : null} />
  );

  const lists = await readLists(token, identity);
  if (!lists)
    return (
      <div className="column">
        {head}
        <div className="library-parts">
          <LibraryFailed />
          <LibraryReadingData />
        </div>
      </div>
    );

  const origin: ListOrigin = { origin: "library", place: listPlace(place) };
  const shelves = shelvesOf(lists.listing, lists.state, { format });
  const nothing = shelves.shelves.length === 0;
  const docs =
    !nothing && place.view === "all"
      ? await readDocs(token, lists, place, format)
      : null;
  const count = docs
    ? docs.phase === "failed"
      ? ""
      : (docs.count ?? "")
    : shelves.count;

  return (
    <div className="column">
      {head}
      <div className="library-parts">
        <LibraryContinue items={lists.continue} scope="org" from={origin} />
        {nothing ? (
          <section className="panel" aria-label={LIBRARY_PAGE.views}>
            <div className="block">
              <p className="block-text">{LIBRARY_PAGE.nothing}</p>
            </div>
          </section>
        ) : (
          <section
            className="section library-view"
            aria-label={LIBRARY_PAGE.views}
          >
            <div className="split library-bar">
              <p className="dim">{count}</p>
              <ViewChoice place={place} />
            </div>
            {docs ? (
              <LibraryDocs {...docs} />
            ) : (
              <div className="library-shelves">
                {shelves.shelves.map((shelf) => {
                  const id = lists.projectIds[shelf.project];
                  return (
                    <Shelf
                      key={shelf.key}
                      shelf={shelf}
                      tag
                      moreHref={id ? projectLibraryHref(id) : null}
                      from={origin}
                    />
                  );
                })}
                {shelves.empty > 0 ? (
                  <p className="dim">
                    {LIBRARY_PAGE.emptyProjects(shelves.empty)}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        )}
        <LibraryReadingData />
      </div>
    </div>
  );
}
