/**
 * sikstack Library (`03-library` round 02, `ProjectLibrary.dc.html`) — what a project's library page
 * reads, composed in the BFF from reads that already exist; no server route is added.
 * (P63, OQ7: a member of the org at the public address is told the project's id, for the redirect;
 * OQ27: the address is read once here, `projectAt` and `exactProjectSearch`, for the page and its layout.)
 *
 * - A member (`/projects/{id}/library`): the active org's projects (`GET /app/projects`: the id is
 *   one of them, else Project not found, as the Shell's own list says), the org's listing
 *   (`GET /app/orgs/{org}/library`), their reading state and Continue reading (this project's books).
 * - A visitor (`/@{org}/{project}`): the org's listing of its PUBLIC projects
 *   (`?scope=public`, tokenless or with the reader's bearer); a private project, an unknown one and
 *   an unknown org are the same miss (404-never-403).
 *
 * `null` is the miss (the page's `notFound()`); any other fault is thrown (the route's error).
 * Each is `cache`d, so the page and its metadata make one set of reads a request.
 */
import "server-only";

import { cache } from "react";

import { continueOf } from "@/lib/library/load-lists";
import { loadContinue, type ContinueItem } from "@/lib/library/continue";
import { getOrgLibrary, listProjects } from "@/lib/knowledge/app";
import { ApiError } from "@/lib/knowledge/client";
import { getReaderLibrary, type KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbIdentity, KbOrgLibrary } from "@/lib/knowledge/types";
import { orgSegment } from "@/lib/reader-href";

import { continueInProject } from "./model";

export interface MemberProject {
  /** The project's name: its key in the listing. */
  project: string;
  /** The active org's name (Not found's words). */
  orgName: string;
  listing: KbOrgLibrary;
  state: KbReaderLibrary;
  continue: ContinueItem[];
}

export interface PublicProject {
  project: string;
  /** The org's display name: the Bar's way back. */
  orgName: string;
  listing: KbOrgLibrary;
  /**
   * The project's id when the reader is a member of this org (P63, OQ7): the page sends them to
   * `/projects/{id}/library` instead. Null for anyone else (a visitor, a reader of another org).
   */
  memberId: string | null;
}

const EMPTY: KbOrgLibrary = {
  org: { id: "", slug: null, name: "", label: "" },
  member: true,
  projects: [],
  books: [],
  documents: [],
};

async function loadMemberProject(
  token: string,
  identity: KbIdentity,
  projectId: string,
): Promise<MemberProject | null> {
  const tenant = identity.tenant;
  const [projects, listing, state] = await Promise.allSettled([
    listProjects(token),
    tenant
      ? getOrgLibrary(token, orgSegment(tenant), "all")
      : Promise.resolve(EMPTY),
    getReaderLibrary(token),
  ]);
  if (projects.status === "rejected") throw projects.reason;
  const project = projects.value.find((p) => p.id === projectId);
  if (!project) return null;
  if (listing.status === "rejected") throw listing.reason;
  if (state.status === "rejected") throw state.reason;
  const books = listing.value.books
    .filter((b) => b.project === project.name)
    .map((b) => ({ project: b.project, slug: b.slug }));
  const items = await loadContinue(token, books);
  return {
    project: project.name,
    orgName: tenant?.name ?? listing.value.org.name,
    listing: listing.value,
    state: state.value,
    continue: continueInProject(
      continueOf(items, listing.value),
      listing.value,
      project.name,
    ),
  };
}

/** A member's project page reads (one set a request). */
export const loadMemberProjectOnce = cache(loadMemberProject);

async function loadPublicProject(
  token: string | undefined,
  org: string,
  project: string,
): Promise<PublicProject | null> {
  let listing: KbOrgLibrary;
  try {
    listing = await getOrgLibrary(token, org, "public");
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400 || error.status === 422)
    )
      return null;
    throw error;
  }
  // A member of the org (the listing says so for the reader's active org) reads the project in the
  // Shell: its id comes from the member's own projects, which hold the private ones too.
  if (token && listing.member) {
    const mine = (await listProjects(token)).find((p) => p.name === project);
    if (mine) {
      return {
        project: mine.name,
        orgName: listing.org.name,
        listing,
        memberId: mine.id,
      };
    }
  }
  const known = listing.projects.find(
    (p) => p.name === project && p.visibility === "public",
  );
  if (!known) return null;
  return {
    project: known.name,
    orgName: listing.org.name,
    listing,
    memberId: null,
  };
}

/** A public project's page reads (one set a request). */
export const loadPublicProjectOnce = cache(loadPublicProject);

// ---- the address (P63, OQ27): one reading for the page and the layout ---------------------------------------

/** A public project's address params, as the route hands them. */
export type ProjectParams = { org: string; project: string };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The address's org (without its `@`) and project, or null for anything else: our public namespace is
 * `@`-prefixed, so an address without it is no public address and is rejected before any read. The page and
 * its layout both read it here, so they ask `loadPublicProjectOnce` with the same arguments (one set of reads).
 */
export function projectAt(
  params: ProjectParams,
): { org: string; project: string } | null {
  const org = safeDecode(params.org);
  const project = safeDecode(params.project);
  if (!org.startsWith("@") || org.length < 2 || project === "") return null;
  return { org: org.slice(1), project };
}

/**
 * The request's path and query (`REQUEST_PATH_HEADER`) when it is a project's own library, exactly
 * `/@{org}/{project}` (two segments; a trailing slash allowed): its query, for the place a member's
 * redirect keeps. Null for every page beneath it (a book, a chapter, notes, a document) and without a path.
 */
export function exactProjectSearch(
  path: string | null | undefined,
): Record<string, string> | null {
  if (!path || !path.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(path, "http://address.invalid");
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !safeDecode(segments[0]).startsWith("@"))
    return null;
  return Object.fromEntries(url.searchParams);
}
