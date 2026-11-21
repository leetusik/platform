/**
 * sikstack Library (`03-library` round 02, `PublicLibrary.dc.html`) — what an org's public library reads,
 * composed in the BFF from reads that already exist; no server route is added.
 *
 * - The org's listing of its PUBLIC projects (`GET /app/orgs/{org}/library?scope=public`, tokenless or
 *   with the reader's bearer). An unknown org and an org that shows this caller nothing are the
 *   server's one 404: the miss (`null`), never a 403.
 * - Signed in: the reader's own reading state (`GET /app/reader/library`), and, for a member of the
 *   org, its projects (`GET /app/projects`: a name's id, for the foot link to `/projects/{id}/library`).
 *
 * Any other fault is thrown (the route's Error). `cache`d, so the page and its metadata make one set of
 * reads a request.
 */
import "server-only";

import { cache } from "react";

import { getOrgLibrary, listProjects } from "@/lib/knowledge/app";
import { ApiError } from "@/lib/knowledge/client";
import { getReaderLibrary, type KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbOrgLibrary } from "@/lib/knowledge/types";

export interface PublicLibraryRead {
  listing: KbOrgLibrary;
  /** The signed-in reader's own state; null for a visitor. */
  state: KbReaderLibrary | null;
  /** A member's project ids by name; null for anyone else. */
  ids: Map<string, string> | null;
}

async function loadPublicLibrary(
  token: string | undefined,
  org: string,
): Promise<PublicLibraryRead | null> {
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
  if (!token) return { listing, state: null, ids: null };
  const [state, projects] = await Promise.all([
    getReaderLibrary(token),
    listing.member ? listProjects(token) : Promise.resolve(null),
  ]);
  return {
    listing,
    state,
    ids: projects ? new Map(projects.map((p) => [p.name, p.id])) : null,
  };
}

/** An org's public library reads (one set a request). */
export const loadPublicLibraryOnce = cache(loadPublicLibrary);
