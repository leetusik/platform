"use client";

import type { BoundaryRetryProps } from "@/sikstack/states";
import { DeferredJobError } from "@/sikstack/workspace/deferred/job-error";

/** One deferred job that did not load (`DeferredJob.dc.html`, Failed; frame.md F49). */
export default function WorkspaceJobError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  return <DeferredJobError digest={error.digest} {...retry} />;
}
