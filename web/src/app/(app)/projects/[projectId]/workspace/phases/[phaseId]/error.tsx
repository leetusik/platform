"use client";

import { useParams } from "next/navigation";

import { WS_PLACES } from "@/content/workspace/frame";
import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { PhaseFailed } from "@/hi2vi/workspace/phase/states";
import { PHASE_ID } from "@/hi2vi/workspace/phase/model";
import { backlogHref } from "@/lib/workspace/address";

/**
 * A phase whose page threw (`Phase.dc.html`, Error; F49): the back link **Backlog**, then F5's block with
 * **Try again** (it renders the route again on the server) and **Back to Backlog**, and the reference when the
 * error has one. A read that fails is the page's own Error, with the sync line; this is the route's last guard.
 */
export default function PhaseError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const params = useParams<{ projectId: string; phaseId: string }>();
  const id = params.phaseId && PHASE_ID.test(params.phaseId) ? params.phaseId : null;
  return (
    <PhaseFailed
      back={{ href: backlogHref(params.projectId ?? ""), label: WS_PLACES.backlog }}
      line={null}
      id={id}
      digest={error.digest ?? null}
      retry={boundaryRetry(retry)}
    />
  );
}
