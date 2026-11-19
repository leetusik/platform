"use client";

import { useState } from "react";

import { ReaderFailed } from "@/hi2vi/reader";
import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";

// P63-fk.S8 — Error, in the bar's frame (`Chapter.dc.html`, F5's words). Try again shows Loading, then
// the chapter: `boundaryRetry` re-fetches the route (Next 16.3's `retry`); a failure that persists
// arrives as a new error, which shows Error again (the retry is held for the error it was pressed on).
export default function ChapterError({
  error,
  ...boundary
}: BoundaryRetryProps & {
  error: Error & { digest?: string };
}) {
  const [retried, setRetried] = useState<Error | null>(null);
  return (
    <ReaderFailed
      digest={error.digest ?? null}
      retrying={retried === error}
      onRetry={() => {
        setRetried(error);
        boundaryRetry(boundary)();
      }}
    />
  );
}
