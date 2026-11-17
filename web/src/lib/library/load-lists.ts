/**
 * hi2vi Library (`03-library` round 02) — what the list pages read, composed in the BFF from reads
 * that already exist; no server route is added for them.
 *
 * - The org's listing (`GET /app/orgs/{org}/library`): the books and the loose documents, over the
 *   projects the viewer may read. It is the one truth of what is on a list and of every count.
 * - The reader's own state (`GET /app/reader/library`) and Continue reading (`continue.ts`), for a
 *   member.
 * - The projects' ids (`GET /app/projects`), for the address of a project's page
 *   (`/projects/{id}/library`), for a member.
 * - For the documents table: each document's tags come from the listing itself (no read). With a
 *   search, two reads at most, whatever the library's size (P63): the ids of every document whose
 *   text matched (`GET /app/search/text`), which the table counts and pages with its own title and tag
 *   matches, then the snippets of the rows on the page drawn that matched only in their text
 *   (`GET /app/search/snippets`), for their excerpts. Both are keyword-only, so a render never pays
 *   for a query embedding (the ranked `/app/search` would, once a call). Both are matched to the
 *   listing by id, so a chapter variant or a superseded copy they also name is never a row.
 *
 * A fault is thrown: the page draws its failed state (the library's) or the table's.
 */
import "server-only";

import {
  getOrgLibrary,
  listProjects,
  searchSnippets,
  searchText,
} from "@/lib/knowledge/app";
import { getReaderLibrary, type KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbIdentity, KbOrgLibrary } from "@/lib/knowledge/types";
import { orgSegment } from "@/lib/reader-href";

import { loadContinue, type ContinueItem } from "./continue";
import { excerptOf } from "./excerpt";
import {
  docsTable,
  listingTags,
  type DocsOptions,
  type DocsSource,
} from "./lists";

export interface OrgLists {
  listing: KbOrgLibrary;
  state: KbReaderLibrary;
  continue: ContinueItem[];
  /** A project's id by its name: the address of its page. */
  projectIds: Record<string, string>;
}

const EMPTY: KbOrgLibrary = {
  org: { id: "", slug: null, name: "", label: "" },
  member: true,
  projects: [],
  books: [],
  documents: [],
};

/**
 * Continue reading less the documents of this org that are no longer in its listing (a document
 * deleted since its place was kept): a deleted document leaves Continue reading (F322).
 */
export function continueOf(
  items: ContinueItem[],
  listing: KbOrgLibrary,
): ContinueItem[] {
  const here = new Set([
    orgSegment({ id: listing.org.id, slug: listing.org.slug }),
    listing.org.label,
    listing.org.id,
  ]);
  const ids = new Set(listing.documents.map((d) => d.id));
  return items.filter(
    (it) =>
      it.kind !== "doc" ||
      it.docId === null ||
      !here.has(it.org) ||
      ids.has(it.docId),
  );
}

/** The member's own org: its listing, their reading state, Continue reading and the project ids. */
export async function loadOrgLists(
  token: string,
  identity: KbIdentity,
): Promise<OrgLists> {
  const tenant = identity.tenant;
  const [listing, state, projects] = await Promise.all([
    tenant ? getOrgLibrary(token, orgSegment(tenant), "all") : EMPTY,
    getReaderLibrary(token),
    listProjects(token),
  ]);
  const items = await loadContinue(
    token,
    listing.books.map((b) => ({ project: b.project, slug: b.slug })),
  );
  return {
    listing,
    state,
    continue: continueOf(items, listing),
    projectIds: Object.fromEntries(projects.map((p) => [p.name, p.id])),
  };
}

/**
 * What the documents table reads beside `listing` for one render (a member's; the search is a
 * member's): the tags from the listing, and with a search its text matches and the excerpts of the
 * page drawn. `options` are the table's own (`q`, `filter`, `page`), so the page read here is the
 * page `docsTable` draws.
 */
export async function loadDocsSource(
  token: string,
  listing: KbOrgLibrary,
  options: Pick<DocsOptions, "q" | "filter" | "page"> = {},
): Promise<DocsSource> {
  const tags = listingTags(listing);
  const q = (options.q ?? "").trim();
  if (!q) return { tags, text: null };
  const matches = await searchText(token, q);
  const text = new Map<number, string | null>(
    matches.ids.map((id) => [id, null]),
  );
  // The page drawn, and its rows that matched only in their text: their excerpts.
  const page = docsTable(listing, { tags, text }, { ...options, q });
  const want = page.items
    .filter((d) => d.match?.where === "text")
    .map((d) => d.id);
  if (want.length === 0) return { tags, text };
  const read = await searchSnippets(token, q, want);
  for (const id of want) {
    const snippet = read.snippets[String(id)];
    // A row stays the match the first read made it (the count and the pager hold); a snippet the
    // excerpt cannot be cut from leaves it without one.
    text.set(id, snippet && excerptOf(snippet, q) ? snippet : null);
  }
  return { tags, text };
}
