import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { itemHeading, NOT_FOUND } from "@/content/feedback-frame";
import { requireIdentity } from "@/lib/auth-guards";
import { canAdd, sent } from "@/lib/feedback/agenda";
import { getFeedbackDetail } from "@/lib/feedback/app";
import { zoneLabel } from "@/lib/feedback/format";
import { feedbackBackHref, type FeedbackScope } from "@/lib/feedback/place";
import type { FeedbackDetail } from "@/lib/feedback/types";
import { listProjects } from "@/lib/knowledge/app";
import { ApiError } from "@/lib/knowledge/client";
import type { KbProject } from "@/lib/knowledge/types";
import { TIME_ZONE_COOKIE, viewerTimeZone } from "@/lib/time-zone";

import {
  AddedToAgenda,
  AgendaHeadEnd,
  AgendaPart,
  AgendaScope,
  AgendaSlot,
  agendaPageState,
} from "../agenda";
import { FeedbackItem } from "./item";
import { feedbackItemView, inScope, isFeedbackId, zoneMetaOf } from "./model";

/**
 * One piece of feedback's server body, shared by its two routes (P65-nh.S3's addresses):
 * `/feedback/[feedbackId]` (the org's, `scope` null) and `/projects/[projectId]/feedback/[feedbackId]`
 * (`scope` the project). Each route's `page.tsx` only reads its params and renders this.
 *
 * Feedback not found (`notFound()`, the route's `not-found.tsx`) for: an id that is no UUID (never
 * sent), a record the API does not return to this org (its 404; a 400 alike), and in a project's
 * route a record of another project or of none. Any other failure throws to the route's `error.tsx`.
 */

/** What the page read: the record and the org's projects (the record names its project by id only). */
export interface FeedbackItemRead {
  record: FeedbackDetail;
  projects: KbProject[];
  /** The record's project's name, or null for none. */
  projectName: string | null;
}

/**
 * The record at this address, or null for Feedback not found. One read per request (`cache`), so the
 * tab title and the page share it.
 */
export const readFeedbackItem = cache(
  async (
    scope: FeedbackScope,
    feedbackId: string,
  ): Promise<FeedbackItemRead | null> => {
    if (!isFeedbackId(feedbackId)) return null;
    const { token } = await requireIdentity();
    let record: FeedbackDetail;
    let projects: KbProject[];
    try {
      [record, projects] = await Promise.all([
        getFeedbackDetail(token, feedbackId),
        listProjects(token),
      ]);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 400)
      )
        return null;
      throw error;
    }
    if (!inScope(record, scope)) return null;
    const projectName =
      (record.project_id &&
        projects.find((p) => p.id === record.project_id)?.name) ||
      null;
    return { record, projects, projectName };
  },
);

/** The tab title, through the site's template: `Feedback on platform`, `Feedback`, or Feedback not found. */
export async function feedbackItemMetadata(
  scope: FeedbackScope,
  feedbackId: string,
): Promise<Metadata> {
  try {
    const read = await readFeedbackItem(scope, feedbackId);
    return {
      title: read ? itemHeading(read.projectName) : NOT_FOUND.item,
      robots: { index: false },
    };
  } catch (error) {
    unstable_rethrow(error);
    // the page renders the failure itself
    return { robots: { index: false } };
  }
}

export async function FeedbackItemBody({
  scope,
  feedbackId,
  from,
}: {
  scope: FeedbackScope;
  feedbackId: string;
  /** The item address's `?from=`: the list it was opened from (laundered by `feedbackBackHref`). */
  from: string | string[] | undefined;
}) {
  const read = await readFeedbackItem(scope, feedbackId);
  if (!read) notFound();
  const store = await cookies();
  const view = feedbackItemView(read.record, {
    projectName: read.projectName,
    zone: zoneMetaOf(store.get(TIME_ZONE_COOKIE)?.value, (tz) => zoneLabel(tz)),
    format: { timeZone: viewerTimeZone(store) },
  });
  const backHref = feedbackBackHref(scope, from);
  // The two slots (P65-nh.S6): Add to agenda at the head's end and the Agenda part, from the agenda
  // seam, in the board's order: filed, else waiting, else not offered, else the add. Today no project
  // has a workspace linked, so the head's end stays empty and the part says why.
  const agenda = agendaPageState(
    canAdd(read.record, read.projectName),
    sent(read.record),
  );
  if (agenda.kind === "offered") {
    // Never today. The phase that links workspaces passes `add`: a server action over `fileAgendaItem`.
    return (
      <AgendaScope project={agenda.project}>
        <FeedbackItem
          view={view}
          backHref={backHref}
          headEnd={<AgendaHeadEnd />}
          agenda={<AgendaSlot />}
        />
      </AgendaScope>
    );
  }
  return (
    <FeedbackItem
      view={view}
      backHref={backHref}
      headEnd={agenda.kind === "not-offered" ? null : <AddedToAgenda />}
      agenda={<AgendaPart state={agenda} />}
    />
  );
}
