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
 * - For the documents table only: each document's tags (`GET /app/documents`, 200 a read, until the
 *   total is read), and with a search the snippets of the documents whose text matched
 *   (`GET /app/search`, 50 a read). The listing has neither; both are matched to it by id, so a
 *   chapter variant or a superseded copy those reads also return is never a row.
 *
 * A fault is thrown: the page draws its failed state (the library's) or the table's.
 */
import "server-only";

import {
  getDocuments,
  getOrgLibrary,
  listProjects,
  searchDocuments,
} from "@/lib/knowledge/app";
import { getReaderLibrary, type KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbIdentity, KbOrgLibrary } from "@/lib/knowledge/types";
import { orgSegment } from "@/lib/reader-href";

import { loadContinue, type ContinueItem } from "./continue";
import type { DocsSource } from "./lists";

/** Reads of `/app/documents` (200 each) and of `/app/search` (50 each) a table may make at most. */
const TAG_READS = 25;
const TAG_LIMIT = 200;
const SEARCH_READS = 10;
const SEARCH_LIMIT = 50;

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

/** Every document's tags, by id. */
async function readTags(token: string): Promise<Map<number, string[]>> {
  const tags = new Map<number, string[]>();
  for (let read = 0; read < TAG_READS; read++) {
    const page = await getDocuments(token, {
      limit: TAG_LIMIT,
      offset: read * TAG_LIMIT,
    });
    for (const item of page.items) tags.set(item.id, item.tags ?? []);
    if (page.items.length < TAG_LIMIT || tags.size >= page.total) break;
  }
  return tags;
}

/** The snippets of the documents whose text matched `q`, by id. */
async function readText(
  token: string,
  q: string,
): Promise<Map<number, string>> {
  const text = new Map<number, string>();
  for (let read = 0; read < SEARCH_READS; read++) {
    const page = await searchDocuments(token, {
      q,
      limit: SEARCH_LIMIT,
      offset: read * SEARCH_LIMIT,
    });
    for (const hit of page.results)
      if (!text.has(hit.id)) text.set(hit.id, hit.snippet);
    if (
      page.results.length < SEARCH_LIMIT ||
      (read + 1) * SEARCH_LIMIT >= page.total
    )
      break;
  }
  return text;
}

/** What the documents table reads beside the listing (a member's org; the search is a member's). */
export async function loadDocsSource(
  token: string,
  q: string,
): Promise<DocsSource> {
  const query = q.trim();
  const [tags, text] = await Promise.all([
    readTags(token),
    query ? readText(token, query) : Promise.resolve(null),
  ]);
  return { tags, text };
}
