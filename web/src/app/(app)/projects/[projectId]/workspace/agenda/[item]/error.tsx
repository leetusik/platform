"use client";

import { useParams, useSearchParams } from "next/navigation";

import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/hi2vi/states";
import { wsErrorState } from "@/hi2vi/workspace/frame";

import { agendaItemBack } from "./back";

/**
 * An agenda item that did not load (`AgendaItem.dc.html`, Did not load; frame.md F49): under the back row, F5's
 * block, **Try again** (primary: it fetches the page again, `boundaryRetry`), **Back to Agenda** and the
 * reference when there is one. The read that carries the sync line failed with it, so the back row is the way
 * back alone. Inside the boundary a link is a plain `a` (a whole page load), as `StateBlock`'s are.
 */
export default function AgendaItemRouteError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const { projectId } = useParams<{ projectId: string }>();
  const back = agendaItemBack(projectId, useSearchParams().get("from"));
  return (
    <div className="column">
      <header className="page-top">
        <div className="ws-top">
          <a className="back" href={back.href}>
            {back.label}
          </a>
        </div>
        <StateBlock
          state={wsErrorState(back, error.digest)}
          onRetry={boundaryRetry(retry)}
        />
      </header>
    </div>
  );
}
