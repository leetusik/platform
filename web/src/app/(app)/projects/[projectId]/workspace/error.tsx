"use client";

import {
  boundaryRetry,
  type BoundaryRetryProps,
  errorState,
  StateBlock,
  useShellOrgName,
} from "@/sikstack/states";

/**
 * The Agenda's whole-page error (F49 falls back on F5): what the page's own failed part does not catch (the read's
 * own failure is the part's, `The agenda did not load.`). In the Shell: This page did not load, **Try again** (it
 * fetches the page again, `boundaryRetry`) and the way to the org, the reference when there is one.
 */
export default function AgendaError({
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
