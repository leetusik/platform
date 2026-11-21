"use client";

import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/sikstack/states";

import { libraryError } from "../parts";
import { usePublicViewer } from "../viewer";

/**
 * The public library did not load (`PublicLibrary.dc.html`, Error; F5's whole), inside the layout's
 * frame: This page did not load, **Try again** (primary: it fetches the page again, `boundaryRetry`),
 * **Back to Library** for a signed-in reader, and the reference when there is one.
 */
export default function PublicLibraryError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const viewer = usePublicViewer();
  return (
    <StateBlock
      state={libraryError({ viewer, digest: error.digest })}
      onRetry={boundaryRetry(retry)}
    />
  );
}
