"use client";

import { useState, useSyncExternalStore } from "react";

import { ReviewLoading, ReviewRouteFailed } from "@/hi2vi/review/route-states";
import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { readReaderCookie } from "@/lib/reader-cookie";

// P64-3y.S7 — Failed in Review's focused frame (job 07 frame.md F221, review FG1), when the page itself could
// not render: `h1` Review alone, `Error · 500`, "Something on our side stopped reading.", the sentence, Try
// again and the request's reference. Try again shows Loading, then the page: `boundaryRetry` re-fetches the
// route; a failure that persists arrives as a new error, which shows Failed again. This boundary renders on the
// client, so the `kb_reader` cookie is read through `useSyncExternalStore`.
const subscribe = () => () => {};

export default function ReviewError({
  error,
  ...boundary
}: BoundaryRetryProps & {
  error: Error & { digest?: string };
}) {
  const [retried, setRetried] = useState<Error | null>(null);
  const jar = useSyncExternalStore(
    subscribe,
    () => document.cookie,
    () => "",
  );
  const settings = readReaderCookie(jar);
  if (retried === error) return <ReviewLoading settings={settings} />;
  return (
    <ReviewRouteFailed
      settings={settings}
      reference={error.digest ?? null}
      onRetry={() => {
        setRetried(error);
        boundaryRetry(boundary)();
      }}
    />
  );
}
