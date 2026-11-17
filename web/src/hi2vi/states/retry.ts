// The error boundary's Try again, in one place for every system route's boundary (`app/error.tsx`,
// `(app)/error.tsx`). Pure, so it is tested on its own (tests/hi2vi-states.test.ts).

/** What Next passes an `error.tsx` besides the error: the functions Try again can call. */
export interface BoundaryRetryProps {
  /** Clears the boundary and re-renders its children from the payload it has (no new request). */
  reset: () => void;
  /** Next 16.3+: refreshes the route from the server, then resets (re-fetch, then re-render). */
  retry?: () => void;
  /** Next 16.2's name for `retry`. */
  unstable_retry?: () => void;
}

/**
 * The function Try again calls: the one that fetches the failed page again, so a server failure that
 * has cleared shows the page. `retry` (Next 16.3+, `error-boundary.js`), then `unstable_retry` (16.2),
 * then `reset`, which only re-renders and so keeps showing a server-side failure.
 */
export function boundaryRetry({
  retry,
  unstable_retry,
  reset,
}: BoundaryRetryProps): () => void {
  return retry ?? unstable_retry ?? reset;
}
