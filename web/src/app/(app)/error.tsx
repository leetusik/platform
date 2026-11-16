"use client";

import { errorState, StateBlock, useShellOrgName } from "@/hi2vi/states";

/**
 * The signed-in app's whole-page error (job 01 round 03-instrument, Shared states: Error).
 *
 * A segment's `error.tsx` renders inside its own segment's layout, so this boundary is a child of
 * `(app)/layout.tsx`'s `AppShell`: the Shell stays, and the block goes straight into `main.app-main`,
 * under `.ui`, above the route folders' `LegacyPage` layouts (so with no `Legacy`). The rail keeps the
 * failing page's item current (the Shell follows the path).
 *
 * Try again is the boundary's retry: `unstable_retry` (Next 16.2+) re-fetches and re-renders the
 * segment, so a server-side failure shows the page's loading state, then the page; `reset` (re-render
 * only) where it is absent. The reference line shows only with a digest (Next omits it in development).
 *
 * It cannot catch a throw from `(app)/layout.tsx` itself (the session read): that is the root
 * `app/error.tsx`'s, which renders without the Shell (states:Q1, not drawn).
 */
export default function AppError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const orgName = useShellOrgName();
  return (
    <StateBlock
      state={errorState({ orgName, digest: error.digest })}
      onRetry={() => (unstable_retry ?? reset)()}
    />
  );
}
