"use client";

import { useParams } from "next/navigation";

import { wsSyncLine } from "@/hi2vi/workspace/frame";
import { SliceLoading } from "@/hi2vi/workspace/slice/loading";
import { segmentId, slicePhaseOf } from "@/hi2vi/workspace/slice/address";
import { phaseHref } from "@/lib/workspace/address";

/**
 * A slice while it loads (`Slice.dc.html`, Loading): the Shell stands; the back link (the phase's id) and the
 * slice's id stand, read from the address; bars for the name, the status, the sync line and each fact's value;
 * a Plan panel with six bars. It reads nothing.
 */
export default function SliceRouteLoading() {
  const params = useParams<{ projectId: string; sliceId: string }>();
  const project = params?.projectId ?? "";
  const full = segmentId(params?.sliceId);
  const phase = slicePhaseOf(full);
  return (
    <SliceLoading
      full={full}
      back={{ href: phaseHref(project, phase), label: phase }}
      line={wsSyncLine(null, null)}
    />
  );
}
