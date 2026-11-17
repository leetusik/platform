import "server-only";

import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";

import { requireIdentity } from "@/lib/auth-guards";
import { listFeedbackPage } from "@/lib/feedback/app";
import {
  isInvalid,
  ratingValue,
  readFeedbackPlace,
  valid,
  type FeedbackPlace,
  type FeedbackScope,
} from "@/lib/feedback/place";
import type { FeedbackNumberedPage, FeedbackQuery } from "@/lib/feedback/types";
import { listProjects } from "@/lib/knowledge/app";
import { ApiError } from "@/lib/knowledge/client";
import type { KbProject } from "@/lib/knowledge/types";
import { viewerTimeZone } from "@/lib/time-zone";

import type { FeedbackListProps } from "./list";
import { listRows, PAGE_SIZE } from "./model";

type Search = Record<string, string | string[] | undefined>;

/** What the list's route draws: No such view, or the list (its rows, or its failed state). */
export type FeedbackListRead =
  | { kind: "no-view"; orgName: string }
  | { kind: "list"; list: FeedbackListProps };

/** A refusal of the address (a project outside the org, a malformed page or rating): No such view. */
const refused = (error: unknown) =>
  error instanceof ApiError && (error.status === 400 || error.status === 404);

/** The session's own failure: the guard's to answer, never the list's failed state. */
const session = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

async function readProjects(token: string): Promise<KbProject[] | null> {
  try {
    return await listProjects(token);
  } catch (error) {
    unstable_rethrow(error);
    if (session(error)) throw error;
    return null;
  }
}

function query(scope: FeedbackScope, place: FeedbackPlace) {
  const q: Omit<FeedbackQuery, "cursor" | "page"> = { limit: PAGE_SIZE };
  if (place.q) q.q = place.q;
  const project = scope ?? place.project;
  if (project) q.project_id = project;
  if (place.rating) q.feedback_value = ratingValue(place.rating);
  return q;
}

/**
 * The list's reads, for either route: the org's projects (the select, the Project column's names, the
 * scope's and the filter's check) and one numbered page of the list with its total.
 *
 * - With a project picked that is no project of the org: Not found (`notFound()`).
 * - An address the list does not answer (a page that is not a whole number from 1, a rating other than
 *   liked and disliked, a project filter outside the org, a page past the last, the API's 400 or 404):
 *   No such view.
 * - A read that failed (not the session's): the list's failed state, the head and the bar standing.
 */
export async function readFeedbackList(
  scope: FeedbackScope,
  search: Search,
): Promise<FeedbackListRead> {
  const { token, identity } = await requireIdentity();
  const orgName = identity.tenant?.name ?? "—";
  const place = readFeedbackPlace(search, scope);
  const projects = await readProjects(token);
  if (scope !== null && projects && !projects.some((p) => p.id === scope))
    notFound();
  if (isInvalid(place)) return { kind: "no-view", orgName };
  if (projects && !valid({ projects }, place))
    return { kind: "no-view", orgName };

  const shown = (projects ?? []).map((p) => ({ id: p.id, name: p.name }));
  const failed: FeedbackListRead = {
    kind: "list",
    list: { scope, place, projects: shown, rows: [], total: 0, failed: true },
  };
  if (projects === null) return failed;

  let read: FeedbackNumberedPage;
  try {
    read = await listFeedbackPage(token, query(scope, place), place.page);
  } catch (error) {
    unstable_rethrow(error);
    if (session(error)) throw error;
    if (refused(error)) return { kind: "no-view", orgName };
    return failed;
  }
  if (read.records.length === 0 && place.page > 1)
    return { kind: "no-view", orgName };

  const timeZone = viewerTimeZone(await cookies());
  return {
    kind: "list",
    list: {
      scope,
      place,
      projects: shown,
      rows: listRows(read.records, { scope, place, projects, timeZone }),
      total: read.total,
      failed: false,
    },
  };
}
