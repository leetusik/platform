"use client";

import { useParams, useSearchParams } from "next/navigation";

import { AgendaItemLoading } from "@/hi2vi/workspace/agenda-item";

import { agendaItemBack } from "./back";

/**
 * An agenda item while it loads (`AgendaItem.dc.html`, Loading): the way back stands, the rest are bars. It reads
 * nothing; the way back comes from the address.
 */
export default function AgendaItemRouteLoading() {
  const { projectId } = useParams<{ projectId: string }>();
  const from = useSearchParams().get("from");
  return <AgendaItemLoading back={agendaItemBack(projectId, from)} />;
}
