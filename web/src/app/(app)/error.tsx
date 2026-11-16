"use client";

import {
  boundaryRetry,
  type BoundaryRetryProps,
  errorState,
  StateBlock,
  useShellOrgName,
} from "@/hi2vi/states";

/**
 * The signed-in app's whole-page error (job 01 round 03-instrument, Shared states: Error).
 *
 * A segment's `error.tsx` renders inside its own segment's layout, so this boundary is a child of
 * `(app)/layout.tsx`'s `AppShell`: the Shell stays, and the block goes straight into `main.app-main`,
 * under `.ui`, above the route folders' `LegacyPage` layouts (so with no `Legacy`). The rail keeps the
 * failing page's item current (the Shell follows the path).
 *
 * Try again is `boundaryRetry`: Next 16.3's `retry` refreshes the route from the server and re-renders
 * the segment, so a server-side failure that has cleared shows the page again (`unstable_retry` on
 * 16.2; `reset`, a re-render only, where neither is passed). The reference line shows with a digest.
 *
 * It cannot catch a throw from `(app)/layout.tsx` itself (the session read): that is the root
 * `app/error.tsx`'s, which renders without the Shell (states:Q1, not drawn).
 */
export default function AppError({
  error,
  ...boundary
}: BoundaryRetryProps & {
  error: Error & { digest?: string };
}) {
  const orgName = useShellOrgName();
  return (
    <StateBlock
      state={errorState({ orgName, digest: error.digest })}
      onRetry={() => boundaryRetry(boundary)()}
    />
  );
}
