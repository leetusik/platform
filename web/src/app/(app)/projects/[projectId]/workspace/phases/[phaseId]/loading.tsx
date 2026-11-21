"use client";

import { useParams, useSearchParams } from "next/navigation";

import { WS_PLACES } from "@/content/workspace/frame";
import { PhaseLoading } from "@/sikstack/workspace/phase/loading-view";
import { PHASE_ID } from "@/sikstack/workspace/phase/model";
import { decodeWorkspaceFrom, FROM_PARAM, wayBack } from "@/lib/workspace/address";

/**
 * A phase while it loads (`Phase.dc.html`, Loading): the back link **Backlog** (to the page `?from=` names), the
 * sync line as a bar, the phase's id with bars, every part's head over skeleton lines. It reads nothing.
 */
export default function PhaseLoadingRoute() {
  const params = useParams<{ projectId: string; phaseId: string }>();
  const search = useSearchParams();
  const project = params.projectId ?? "";
  const way = wayBack(
    project,
    { kind: "phase" },
    decodeWorkspaceFrom(search.get(FROM_PARAM), project),
  );
  const id = params.phaseId && PHASE_ID.test(params.phaseId) ? params.phaseId : null;
  return <PhaseLoading back={{ href: way.href, label: WS_PLACES.backlog }} id={id} />;
}
