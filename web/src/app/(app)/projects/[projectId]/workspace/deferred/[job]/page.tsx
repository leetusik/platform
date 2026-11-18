import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { WS_HEAD, WS_PLACES } from "@/content/workspace/frame";
import { StateBlock } from "@/hi2vi/states";
import {
  DeferredJob,
  jobItem,
  promotedPhase,
} from "@/hi2vi/workspace/deferred";
import { loadJob } from "@/hi2vi/workspace/deferred/load";
import {
  BackRow,
  wsFailedTitle,
  wsHeadOf,
  WsItemFailed,
  wsNotFoundState,
  wsSyncLine,
  type WsSyncLine,
} from "@/hi2vi/workspace/frame";
import { requireIdentity } from "@/lib/auth-guards";
import { getProject } from "@/lib/knowledge/app";
import { ApiError } from "@/lib/knowledge/client";
import { viewerTimeZone } from "@/lib/time-zone";
import {
  decodeWorkspaceFrom,
  FROM_PARAM,
  wayBack,
} from "@/lib/workspace/address";
import { dates } from "@/lib/workspace/model";
import { readWorkspace } from "@/lib/workspace/read";

/**
 * One deferred job (`Deferred.dc.html`, one job; `DeferredJob.dc.html`): `/projects/{id}/workspace/deferred/{job}`
 * in the Shell. The way back **Deferred** returns to the list's page, search and status (`?from=`, the
 * Workspace's own decoder). Reads: the job's route (its brief and the sync line), then the Workspace once only
 * when the job draws a row of another record (the phase it was promoted to, its agenda item).
 *
 * A job the workspace does not hold: **Deferred job not found** under the way back; a project the org does not
 * hold: Project not found. A failed read is the page's own Error under the way back with the sync line (F49,
 * F84); a render that throws is the route's (`error.tsx`). The tab title is the Workspace's, or the job's id when
 * it did not load (`<id> · hi2vi`; the read is shared, `loadOnce`).
 */
type Params = { projectId: string; job: string };
type Search = Record<string, string | string[] | undefined>;

/** The job's read, once a request: the tab title and the page share it. */
const loadOnce = cache(loadJob);

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { projectId, job } = await params;
  try {
    const { token } = await requireIdentity();
    const load = await loadOnce(token, projectId, job);
    if (load.job.state === "error")
      return { title: wsFailedTitle(job), robots: { index: false } };
  } catch (error) {
    unstable_rethrow(error);
  }
  return { title: WS_HEAD.title, robots: { index: false } };
}

/** A read that failed or found nothing says nothing of a sync it could not read. */
const NO_LINE: WsSyncLine = { state: "fresh", text: "", cls: "", version: "" };

/** The project's name for the not-found sentence; a project the org does not hold is Project not found. */
async function projectName(token: string, projectId: string): Promise<string> {
  try {
    return (await getProject(token, projectId)).name;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400 || error.status === 422)
    )
      notFound();
    throw error;
  }
}

export default async function WorkspaceJobPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { projectId, job: jobId } = await params;
  const search = await searchParams;
  const way = wayBack(
    projectId,
    { kind: "job" },
    decodeWorkspaceFrom(search[FROM_PARAM], projectId),
  );
  const back = { href: way.href, label: WS_PLACES.deferred };
  const { token } = await requireIdentity();
  const load = await loadOnce(token, projectId, jobId);

  if (load.job.state === "error") {
    const head = wsHeadOf(await readWorkspace(token, projectId));
    const timeZone = viewerTimeZone(await cookies());
    return (
      <WsItemFailed
        back={back}
        line={head ? wsSyncLine(head.sync, head.version, { timeZone }) : null}
      />
    );
  }
  if (load.job.state === "not-found") {
    const name = await projectName(token, projectId);
    return (
      <div className="column">
        <header className="page-top">
          <BackRow {...back} line={NO_LINE} />
          <StateBlock state={wsNotFoundState("job", name, back)} />
        </header>
      </div>
    );
  }

  const job = load.job.value;
  const timeZone = viewerTimeZone(await cookies());
  const ws = load.workspace?.state === "ready" ? load.workspace.value : null;
  return (
    <div className="column">
      <DeferredJob
        project={projectId}
        job={job}
        back={back}
        line={wsSyncLine(job.workspace.sync, job.workspace.version, {
          timeZone,
        })}
        created={dates(timeZone).date(job.created)}
        phase={ws ? promotedPhase(job, ws.phases) : null}
        item={ws ? jobItem(job, ws) : null}
      />
    </div>
  );
}
