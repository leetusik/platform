"use client";

import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/hi2vi/states";

import { projectError } from "./parts";

/**
 * A project's library did not load (`ProjectLibrary.dc.html`, Error; F5's whole): in the Shell, This
 * page did not load, **Try again** (primary: it fetches the page again, `boundaryRetry`), **Back to
 * Library**, and the reference when there is one.
 */
export default function ProjectLibraryError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  return (
    <StateBlock
      state={projectError({ viewer: "member", digest: error.digest })}
      onRetry={boundaryRetry(retry)}
    />
  );
}
