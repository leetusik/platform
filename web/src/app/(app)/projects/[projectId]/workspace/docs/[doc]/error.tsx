"use client";

import { useParams } from "next/navigation";

import { WS_PLACES, WS_STATES } from "@/content/workspace/frame";
import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { WsItemFailed } from "@/hi2vi/workspace/frame/failed";
import { docsHref } from "@/lib/workspace/address";

/**
 * A doc whose page threw (`Docs.dc.html`, Failed; frame.md F49), the frame's one failed state: under the back row,
 * **This page did not load**, F5's sentence, **Try again** (primary: it fetches the page again, `boundaryRetry`)
 * and **Back to Docs**, the reference when there is one. A boundary knows no sync line, so the row holds its bar
 * only while Try again reads the page again (F40). A read that fails is the page's own Error, with the sync line.
 */
export default function DocRouteError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const { projectId } = useParams<{ projectId: string }>();
  const back = { href: docsHref(projectId ?? ""), label: WS_PLACES.docs };
  return (
    <WsItemFailed
      back={back}
      backLabel={WS_STATES.back(back.label)}
      line={null}
      digest={error.digest}
      retry={boundaryRetry(retry)}
    />
  );
}
