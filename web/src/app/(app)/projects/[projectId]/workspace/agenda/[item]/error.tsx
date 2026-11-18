"use client";

import { useParams, useSearchParams } from "next/navigation";

import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/hi2vi/states";
import { useWsRetry, WsRetrySync, wsErrorState } from "@/hi2vi/workspace/frame";

import { agendaItemBack } from "./back";

/**
 * An agenda item that did not load (`AgendaItem.dc.html`, Did not load; frame.md F49): under the back row, F5's
 * block, **Try again** (primary: it fetches the page again, `boundaryRetry`), **Back to Agenda** and the
 * reference when there is one. The read that carries the sync line failed with it, so the back row is the way
 * back alone, and the line's bar while Try again reads the page again (F40). Inside the boundary a link is a
 * plain `a` (a whole page load), as `StateBlock`'s are.
 */
export default function AgendaItemRouteError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const { projectId } = useParams<{ projectId: string }>();
  const back = agendaItemBack(projectId, useSearchParams().get("from"));
  const [, run] = useWsRetry();
  return (
    <div className="column">
      <header className="page-top">
        <div className="ws-top">
          <a className="back" href={back.href}>
            {back.label}
          </a>
          <WsRetrySync />
        </div>
        <StateBlock
          state={wsErrorState(back, error.digest)}
          onRetry={() => run(boundaryRetry(retry))}
        />
      </header>
    </div>
  );
}
