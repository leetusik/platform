import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { WS_HEAD } from "@/content/workspace/frame";
import { wsSyncLine } from "@/hi2vi/workspace/frame";
import { AgendaItemPage } from "@/hi2vi/workspace/agenda-item";
import { requireIdentity } from "@/lib/auth-guards";

import { agendaItemBack } from "./back";
import { loadAgendaItem, requestClock } from "./load";

/**
 * An agenda item (`AgendaItem.dc.html`; frame.md F303 and the carried page) at
 * `/projects/<id>/workspace/agenda/<item>`, in the Shell with Workspace current. The server reads (`load.ts`) and
 * hands the client page the item, its rows, the sync line and the viewer's zone; the client page writes.
 *
 * The tab title is the Workspace's (F36): a title from the item would cost the page a second read.
 */
export const metadata: Metadata = { title: WS_HEAD.title };

type Params = { projectId: string; item: string };
type Search = Record<string, string | string[] | undefined>;

export default async function AgendaItemRoute({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { projectId, item } = await params;
  const back = agendaItemBack(projectId, (await searchParams).from);
  const { token } = await requireIdentity();
  const read = await loadAgendaItem(token, projectId, item);
  // the route's boundary draws a failed read (`error.tsx`)
  if (read.state === "error") throw new Error("The agenda item did not load.");
  if (read.state === "not-found" && read.missing) notFound();
  const { timeZone, now } = requestClock(await cookies());
  const line = read.head
    ? wsSyncLine(read.head.sync, read.head.version, { timeZone, now })
    : null;
  return (
    <AgendaItemPage
      project={projectId}
      back={back}
      line={line}
      timeZone={timeZone}
      now={now}
      read={
        read.state === "ready"
          ? {
              state: "ready",
              item: read.item,
              phases: read.phases,
              jobs: read.jobs,
            }
          : { state: "not-found", projectName: read.projectName }
      }
    />
  );
}
