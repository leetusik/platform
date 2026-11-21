"use client";

import { boundaryRetry, type BoundaryRetryProps } from "@/sikstack/states";
import { WsItemFailed } from "@/sikstack/workspace/frame";

import { useJobBack } from "./loading";

/**
 * One job whose page threw (`DeferredJob.dc.html`, Failed; frame.md F49), the frame's one failed state: under the
 * way back, **This page did not load**, F5's sentence, **Try again** (primary: the page is read again,
 * `boundaryRetry`) and **Back to Deferred** (to the list's page, search and status), and the reference when the
 * error has one. A boundary knows no sync line, so the row holds its bar only while Try again reads the page again
 * (F40). A read that fails is the page's own Error, with the sync line.
 */
export function DeferredJobError({
  digest,
  ...retry
}: BoundaryRetryProps & { digest?: string }) {
  const back = useJobBack();
  return (
    <WsItemFailed
      back={back}
      line={null}
      digest={digest}
      retry={boundaryRetry(retry)}
    />
  );
}
