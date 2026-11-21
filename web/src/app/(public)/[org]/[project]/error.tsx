"use client";

import { usePathname } from "next/navigation";

import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/sikstack/states";
import { publicBack } from "@/lib/project-library/place";

import {
  projectError,
  PublicProjectFrame,
} from "@/app/(app)/projects/[projectId]/library/parts";

/**
 * A public project's library did not load (`ProjectLibrary.dc.html`, Error, a visitor; F5's whole): in
 * the bar's frame, This page did not load, **Try again** (primary: it fetches the page again,
 * `boundaryRetry`) and the reference when there is one; no Back to Library (a member's). The boundary
 * renders on the client and knows no session: the Bar offers no Sign in.
 */
export default function PublicProjectError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const pathname = usePathname() ?? "/";
  return (
    <PublicProjectFrame back={publicBack(pathname)}>
      <StateBlock
        state={projectError({ viewer: "visitor", digest: error.digest })}
        onRetry={boundaryRetry(retry)}
      />
    </PublicProjectFrame>
  );
}
