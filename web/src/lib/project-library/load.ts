/**
 * hi2vi Library (`03-library` round 02, `ProjectLibrary.dc.html`) — what a project's library page
 * reads, composed in the BFF from reads that already exist; no server route is added.
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
  const known = listing.projects.find(
    (p) => p.name === project && p.visibility === "public",
  );
  if (!known) return null;
  return { project: known.name, orgName: listing.org.name, listing };
}

/** A public project's page reads (one set a request). */
export const loadPublicProjectOnce = cache(loadPublicProject);
