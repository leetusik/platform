"use client";

import { useParams } from "next/navigation";

import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { WsItemFailed } from "@/hi2vi/workspace/frame";
import { WS_SLICE } from "@/content/workspace/slice";
import { segmentId, slicePhaseOf } from "@/hi2vi/workspace/slice/address";
import { phaseHref } from "@/lib/workspace/address";

/**
 * A slice whose page threw (`Slice.dc.html`, Error; F49 with F5's words), the frame's one failed state: under the
 * back row (the phase's id), This page did not load, **Try again** (primary: it fetches the page again,
 * `boundaryRetry`) and **Back to P57-4q**, the reference when there is one. A boundary knows no sync line, so the
 * row holds its bar only while Try again reads the page again (F40). A read that fails is the page's own Error.
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
  return (
    <WsItemFailed
      back={back}
      backLabel={WS_SLICE.back(back.label)}
      line={null}
      digest={error.digest}
      retry={boundaryRetry(retry)}
    />
  );
}
