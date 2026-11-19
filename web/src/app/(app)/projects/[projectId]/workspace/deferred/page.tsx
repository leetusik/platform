import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { PROJECT_HOME } from "@/content/project";
import { WS_HEAD } from "@/content/workspace/frame";
import {
  DeferredList,
  DeferredListFailed,
  readDeferredPlace,
} from "@/hi2vi/workspace/deferred";
import { loadDeferredList } from "@/hi2vi/workspace/deferred/load";
import { jobTriggers } from "@/hi2vi/workspace/deferred/prose";
import { WsNav, wsSyncLine, type WsSyncLine } from "@/hi2vi/workspace/frame";
import { requireIdentity } from "@/lib/auth-guards";
import { viewerTimeZone } from "@/lib/time-zone";
import {
  agendaHref,
  backlogHref,
  deferredHref,
  docsHref,
} from "@/lib/workspace/address";
import { dates } from "@/lib/workspace/model";

import { requestOrigin } from "../../model";

/**
 * A project's deferred jobs (`Deferred.dc.html`, the list; frame.md F300, F82): `/projects/{id}/workspace/deferred`
 * in the Shell. `WsNav` (Deferred current, the sync line), then the one panel `DeferredList`: the head's count,
 * the search and the status filter, the rows, fifty a page (`?q=`, `?status=`, `?page=N`). One read: the
 * Workspace's lists, its deferred jobs in the workspace's own order.
 *
 * A project the Workspace does not hold is Not found; a workspace not linked or never synced draws `WsNav`'s one
 * panel and nothing else (F40); a failed read keeps the head and the panel's `Deferred jobs did not load.` with
 * Try again (F49).
 */
type Params = { projectId: string };
type Search = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: WS_HEAD.title,
  robots: { index: false },
};

/** A line for a read that failed: the head stands and says nothing of a sync it could not read. */
const NO_LINE: WsSyncLine = { state: "fresh", text: "", cls: "", version: "" };

export default async function WorkspaceDeferredPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { projectId } = await params;
  const place = readDeferredPlace(await searchParams);
  const { token } = await requireIdentity();
  const read = await loadDeferredList(token, projectId);
  if (read.state === "not-found") notFound();

  const hrefs = {
    agenda: agendaHref(projectId),
    backlog: backlogHref(projectId),
    deferred: deferredHref(projectId),
    docs: docsHref(projectId),
  };

  if (read.state === "error")
    return (
      <div className="column">
        <WsNav current="deferred" line={NO_LINE} hrefs={hrefs} />
        <DeferredListFailed />
      </div>
    );

  const timeZone = viewerTimeZone(await cookies());
  if (read.state === "unlinked" || read.state === "never") {
    const origin = requestOrigin(await headers());
    return (
      <div className="column">
        <WsNav
          current="deferred"
          line={wsSyncLine(read.head.sync, read.head.version, { timeZone })}
          hrefs={hrefs}
          command={
            origin
              ? PROJECT_HOME.workspace.run.command(origin, projectId)
              : null
          }
        />
      </div>
    );
  }

  const ws = read.value;
  const d = dates(timeZone);
  const created: Record<string, string> = {};
  for (const job of ws.deferred) created[job.id] = d.date(job.created);
  return (
    <div className="column">
      <WsNav
        current="deferred"
        line={wsSyncLine(ws.sync, ws.version, { timeZone })}
        hrefs={hrefs}
      />
      <DeferredList
        project={projectId}
        jobs={ws.deferred}
        created={created}
        triggers={jobTriggers(ws.deferred)}
        place={place}
      />
    </div>
  );
}
