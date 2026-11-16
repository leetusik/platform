"use client";

import { useState } from "react";

import { DocumentFailed } from "@/hi2vi/reader/document";
import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";

// P63-fk.S12 — Error, in the bar's frame (`Document.dc.html`, F5's words). Try again shows Loading, then the
// document: `boundaryRetry` re-fetches the route; a failure that persists arrives as a new error, which shows
// Error again (the retry is held for the error it was pressed on).
export default function DocumentError({
  error,
  ...boundary
}: BoundaryRetryProps & {
  error: Error & { digest?: string };
}) {
  const [retried, setRetried] = useState<Error | null>(null);
  return (
    <DocumentFailed
      digest={error.digest ?? null}
      retrying={retried === error}
      onRetry={() => {
        setRetried(error);
        boundaryRetry(boundary)();
      }}
    />
  );
}
