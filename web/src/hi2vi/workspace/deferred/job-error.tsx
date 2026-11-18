"use client";

import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/hi2vi/states";
import {
  BackRow,
  useWsRetry,
  wsErrorState,
  type WsSyncLine,
} from "@/hi2vi/workspace/frame";

import { useJobBack } from "./loading";

/** A failed read says nothing of a sync it could not read: the back row's line is left empty. */
const NO_LINE: WsSyncLine = { state: "fresh", text: "", cls: "", version: "" };

/**
 * One job that did not load (`DeferredJob.dc.html`, Failed; frame.md F49), under the way back and on the line a
 * job's title sits on: **This page did not load**, F5's sentence, **Try again** (primary: the page is read
 * again, `boundaryRetry`) and **Back to Deferred** (to the list's page, search and status), and the reference
 * when the error has one. While Try again reads the page again the back row's line is its bar (F40).
 */
export function DeferredJobError({
  digest,
  ...retry
}: BoundaryRetryProps & { digest?: string }) {
  const back = useJobBack();
  const [, run] = useWsRetry();
  return (
    <div className="column">
      <header className="page-top">
        <BackRow {...back} line={NO_LINE} />
        <StateBlock
          state={wsErrorState(back, digest)}
          onRetry={() => run(boundaryRetry(retry))}
        />
      </header>
    </div>
  );
}
