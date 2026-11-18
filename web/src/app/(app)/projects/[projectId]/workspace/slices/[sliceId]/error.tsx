"use client";

import { useParams } from "next/navigation";

import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { useWsRetry, wsErrorState } from "@/hi2vi/workspace/frame";
import { SliceMissing } from "@/hi2vi/workspace/slice/missing";
import { segmentId, slicePhaseOf } from "@/hi2vi/workspace/slice/address";
import { phaseHref } from "@/lib/workspace/address";

/**
 * A slice that did not load (`Slice.dc.html`, Error; F49 with F5's words): under the back row (the phase's id),
 * This page did not load, **Try again** (primary: it fetches the page again, `boundaryRetry`) and **Back to
 * P57-4q**, the reference when there is one. The workspace did not answer, so no sync line is drawn, but its bar
 * while Try again reads the page again (F40).
 */
export default function SliceRouteError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const params = useParams<{ projectId: string; sliceId: string }>();
  const project = params?.projectId ?? "";
  const full = segmentId(params?.sliceId);
  const phase = slicePhaseOf(full);
  const back = { href: phaseHref(project, phase), label: phase };
  const [, run] = useWsRetry();
  return (
    <SliceMissing
      back={back}
      line={null}
      state={wsErrorState(back, error.digest)}
      onRetry={() => run(boundaryRetry(retry))}
    />
  );
}
