"use client";

import { useParams, useSearchParams } from "next/navigation";

import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { WsItemFailed } from "@/hi2vi/workspace/frame";

import { agendaItemBack } from "./back";

/**
 * An agenda item whose page threw (`AgendaItem.dc.html`, Did not load; frame.md F49), the frame's one failed state:
 * under the back row, F5's block, **Try again** (primary: it fetches the page again, `boundaryRetry`), **Back to
 * Agenda** and the reference when there is one. A boundary knows no sync line, so the row holds its bar only while
 * Try again reads the page again (F40). Inside the boundary a link is a plain `a` (a whole page load), as
 * `StateBlock`'s are. A read that fails is the page's own Error, with the sync line.
 */
export default function AgendaItemRouteError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const { projectId } = useParams<{ projectId: string }>();
  const back = agendaItemBack(projectId, useSearchParams().get("from"));
  return (
    <WsItemFailed
      back={back}
      line={null}
      digest={error.digest}
      retry={boundaryRetry(retry)}
    />
  );
}
