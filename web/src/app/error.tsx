"use client";

import {
  boundaryRetry,
  type BoundaryRetryProps,
  errorState,
  StateBlock,
} from "@/sikstack/states";
import { UiRoot } from "@/sikstack/ui";

/**
 * The root error (job 01 round 03-instrument, Shared states: Error), for a throw no nearer boundary
 * catches: a throw in a route group's own layout (a segment's `error.tsx` never wraps the layout of its
 * own segment), above all the `(app)` layout's session and project reads (`requireIdentity()`, the
 * Shell's lists) when the API is down, and a page throw in a group with no `error.tsx` of its own.
 *
 * A layout that threw renders nothing, so there is no Shell to keep and no org to name: like the
 * signed-out root not-found, the block stands alone in its own `UiRoot`. It holds the signed title,
 * sentence and Try again, the reference line when there is a digest, and in place of Back to <org name>
 * the signed-out not-found's one link, "Go to sikstack" (`errorState({ orgName: null })`).
 *
 * Try again is `boundaryRetry`: the boundary's `retry` (Next 16.3: re-fetch, then re-render),
 * `unstable_retry` on 16.2, `reset` (re-render only) where neither is passed. A root-layout throw is
 * `global-error`'s, and there is none: the root layout reads no request data and makes no call.
 */
export default function RootError({
  error,
  ...boundary
}: BoundaryRetryProps & {
  error: Error & { digest?: string };
}) {
  return (
    <UiRoot>
      <div className="page">
        <div className="app">
          <main id="main-content" className="app-main">
            <StateBlock
              state={errorState({ orgName: null, digest: error.digest })}
              onRetry={() => boundaryRetry(boundary)()}
            />
          </main>
        </div>
      </div>
    </UiRoot>
  );
}
