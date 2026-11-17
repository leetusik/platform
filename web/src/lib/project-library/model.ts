/**
 * hi2vi Library (`03-library` round 02, `ProjectLibrary.dc.html`, F321 to F324, F328) — a project's
 * library page as data: the head (the name, Public or Private, the count line), the project's books
 * (the frame's shelf rows), its documents table at a place, Continue reading within the project, and
 * the list's origin every link carries. Pure (no I/O), so the page and the tests read one source;
 * `load.ts` does the reads. The list parts' own models are `@/lib/library/lists`.
 */
import { LIBRARY_PAGE } from "@/content/library-page";
import type { FormatOptions } from "@/lib/format";
import type { ListOrigin } from "@/lib/library/from";
import {
  docsTable,
  nameBreaks,
  secondTitleLang,
  shelvesOf,
  type DocsSource,
  type DocsTable,
  type ShelfBook,
} from "@/lib/library/lists";
import type { ProjectPlace } from "@/lib/library/list-place";
import type { ContinueItem } from "@/lib/library/continue";
import type { KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbOrgLibrary } from "@/lib/knowledge/types";
import { orgSegment } from "@/lib/reader-href";

export type ProjectViewer = "member" | "visitor";

/** Who is looking at which project: a member by the project's id, a visitor by the org's address. */
export type ProjectAt =
  { viewer: "member"; id: string } | { viewer: "visitor"; org: string };

/** A project's page, ready to draw. */
export interface ProjectLibraryView {
  viewer: ProjectViewer;
  /** The project's name (the filter's key, the no-match sentence's scope). */
  project: string;
  /** The name with break points after `_ - /`; the head's `h1` also breaks anywhere. */
  name: string;
  isPublic: boolean;
  /** `1 book, 132 documents`, `58 documents`, `0 documents`. */
  count: string;
  books: ShelfBook[];
  docs: DocsTable;
  /** Nothing to read: no book and no document. */
  nothing: boolean;
  /** This list at its place: carried on every book and document link (F324). */
  from: ListOrigin;
}

/** A project page's place in its address, as `from` carries it: `page` and `q`. */
export function projectOrigin(
  at: ProjectAt,
  project: string,
  place: ProjectPlace,
): ListOrigin {
  const p = { page: place.page, q: place.q || null };
  return at.viewer === "member"
    ? { origin: "project-library", viewer: "member", project: at.id, place: p }
    : {
        origin: "project-library",
        viewer: "visitor",
        org: at.org,
        project,
        place: p,
      };
}

/**
 * A visitor's table (`LibraryDocsStates`, a visitor's rows; P63, OQ8): each document's tags from the
 * public listing itself (the server returns only the documents this reader may read, so a tag never
 * names a private one), and no search (a visitor cannot search).
 */
export function visitorSource(listing: KbOrgLibrary): DocsSource {
  return {
    tags: new Map(listing.documents.map((d) => [d.id, d.tags ?? []])),
    text: null,
  };
}

/**
 * The page's view of `project` in `listing`. `state` is the member's reading state (null for a
 * visitor: no reading state). A visitor cannot search, so their `q` is dropped.
 */
export function projectLibraryView(
  listing: KbOrgLibrary,
  state: KbReaderLibrary | null,
  project: string,
  at: ProjectAt,
  place: ProjectPlace,
  source: DocsSource,
  format: FormatOptions = {},
): ProjectLibraryView {
  const q = at.viewer === "member" ? place.q : "";
  const shelf = shelvesOf(listing, at.viewer === "member" ? state : null, {
    format,
    project,
  }).shelves[0];
  const books = shelf?.books ?? [];
  const docs = docsTable(listing, source, {
    q,
    filter: project,
    page: place.page,
    format,
  });
  const isPublic =
    listing.projects.find((p) => p.name === project)?.visibility === "public";
  return {
    viewer: at.viewer,
    project,
    name: nameBreaks(project),
    isPublic,
    count: LIBRARY_PAGE.countLine(books.length, docs.total),
    books,
    docs,
    nothing: books.length === 0 && docs.total === 0,
    from: projectOrigin(at, project, { page: docs.page, q }),
  };
}

/**
 * Continue reading within the project (F323): the member's items of this org's project only. Each
 * item names the org it is read under (the reader state's `org`: the segment, the label or the id).
 */
export function continueInProject(
  items: readonly ContinueItem[],
  listing: KbOrgLibrary,
  project: string,
): ContinueItem[] {
  const here = new Set([
    orgSegment({ id: listing.org.id, slug: listing.org.slug }),
    listing.org.label,
    listing.org.id,
  ]);
  return items.filter((it) => it.project === project && here.has(it.org));
}

/**
 * A second title's language: the manifest's `sub_lang` when given (P63, D248-j7), else `ko` when it
 * holds Hangul (S15's rule), else none.
 */
export function subLang(sub: string, lang?: string | null): string | undefined {
  return secondTitleLang(sub, lang);
}
