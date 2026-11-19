"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  BACK_TO_FEEDBACK,
  FEEDBACK,
  NOT_FOUND,
} from "@/content/feedback-frame";
import { notFoundText } from "@/content/feedback-item";
import { HI2VI_STATES } from "@/content/hi2vi-states";
import {
  boundaryRetry,
  StateBlock,
  useShellOrgName,
  type BoundaryRetryProps,
  type StateModel,
} from "@/hi2vi/states";
import { zoneLabel } from "@/lib/feedback/format";
import {
  feedbackBackHref,
  FROM_PARAM,
  type FeedbackScope,
} from "@/lib/feedback/place";
import { readTimeZoneCookie } from "@/lib/time-zone";

import { FeedbackItemLoading } from "./item";
import { zoneMetaOf } from "./model";

/**
 * One piece of feedback's loading, not-found and error screens (`FeedbackItem.dc.html`'s Loading, Not
 * found and Error; frame.md F132), for both routes. Next gives these files no props, so the scope (the
 * project in the address) and the way back (`?from=`) come from the address here, as the page reads
 * them.
 */
function useItemBack(): string {
  const params = (useParams() ?? {}) as Record<string, string | string[]>;
  const search = useSearchParams();
  const project = params.projectId;
  const scope: FeedbackScope =
    typeof project === "string" && project !== "" ? project : null;
  // a repeated `from` stays an array, which the laundering refuses, as the page's own read does
  const from = search?.getAll(FROM_PARAM) ?? [];
  return feedbackBackHref(scope, from.length === 1 ? from[0] : from);
}

const noSubscribe = () => () => {};

/** The zone the page will say once loaded: from the time-zone cookie in the browser; unknown on the server. */
function useZoneMeta(): string {
  const raw = useSyncExternalStore(
    noSubscribe,
    () => readTimeZoneCookie(document.cookie),
    () => null,
  );
  return zoneMetaOf(raw, (tz) => zoneLabel(tz));
}

export function FeedbackItemLoadingState() {
  return <FeedbackItemLoading backHref={useItemBack()} zone={useZoneMeta()} />;
}

/**
 * The board's back row over a whole-page block: `div.page-top` with the way back, then the block
 * (`StateBlock`). Inside the error boundary the way back is a plain `a` (a whole page load), as
 * `StateBlock`'s own links are there.
 */
function ItemStatePage({
  backHref,
  state,
  onRetry,
}: {
  backHref: string;
  state: StateModel;
  onRetry?: () => void;
}) {
  return (
    <div className="column">
      <div className="page-top">
        {onRetry ? (
          <a className="back" href={backHref}>
            {FEEDBACK}
          </a>
        ) : (
          <Link className="back" href={backHref}>
            {FEEDBACK}
          </Link>
        )}
        <StateBlock state={state} onRetry={onRetry} />
      </div>
    </div>
  );
}

/** Feedback not found (F132): its sentence names the org; Back to Feedback is the way back. */
export function FeedbackItemNotFoundState() {
  const backHref = useItemBack();
  const orgName = useShellOrgName();
  return (
    <ItemStatePage
      backHref={backHref}
      state={{
        title: NOT_FOUND.item,
        text: notFoundText(orgName),
        actions: [
          {
            kind: "link",
            label: BACK_TO_FEEDBACK,
            href: backHref,
            variant: "default",
          },
        ],
        reference: null,
      }}
    />
  );
}

/** This page did not load (F132): Try again (re-fetch), Back to Feedback, the reference when there is one. */
export function FeedbackItemErrorState({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const backHref = useItemBack();
  const e = HI2VI_STATES.error;
  return (
    <ItemStatePage
      backHref={backHref}
      onRetry={boundaryRetry(retry)}
      state={{
        title: e.title,
        text: e.text,
        actions: [
          { kind: "retry", label: e.retry, variant: "primary" },
          {
            kind: "link",
            label: BACK_TO_FEEDBACK,
            href: backHref,
            variant: "default",
          },
        ],
        reference: error.digest ? e.reference(error.digest) : null,
      }}
    />
  );
}
