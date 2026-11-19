import { REVIEW } from "@/content/review";

/**
 * Review's loading and failed parts (job 07 frame.md F221; `ReviewCard.dc.html`'s skeleton, `Review.dc.html`'s
 * failed state). No `"use client"` and no hook: the page and the route's loading and error files draw them.
 */

/** The card's skeleton in the card's own shape: the kind and the source, two prompt lines (95%, 70%), four 44 px option bars. */
export function CardSkeleton() {
  return (
    <div className="card-page rv-sk" aria-hidden="true">
      <div className="stack gap-2">
        <span className="skel" style={{ width: "9em" }} />
        <span className="skel" style={{ width: "18em" }} />
      </div>
      <div className="stack gap-3">
        <span className="skel rv-sk-line" style={{ width: "95%" }} />
        <span className="skel rv-sk-line" style={{ width: "70%" }} />
      </div>
      <div className="stack gap-3">
        <span className="skel rv-sk-opt" />
        <span className="skel rv-sk-opt" />
        <span className="skel rv-sk-opt" />
        <span className="skel rv-sk-opt" />
      </div>
    </div>
  );
}

/**
 * A failed load (review FG1, F221): the head is `h1` Review alone (nothing loaded), then `Error · 500`, the
 * heading, the sentence, **Try again** (primary) and the request's reference. The page moves the focus to the
 * failure (`data-rv-end`), as it did before.
 */
export function ReviewFailed({
  reference,
  onRetry,
}: {
  reference: string | null;
  onRetry?: () => void;
}) {
  const E = REVIEW.end;
  return (
    <>
      <header className="due-head">
        <h1>{REVIEW.head.title}</h1>
      </header>
      <div className="rv-failed" role="alert" tabIndex={-1} data-rv-end="1">
        <p className="meta">{E.failedCode}</p>
        <h2>{E.failedTitle}</h2>
        <p className="rv-failed-text">{E.failedSub}</p>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          {E.retry}
        </button>
        {reference ? (
          <p className="meta">{`${E.refPrefix} · ${reference}`}</p>
        ) : null}
      </div>
    </>
  );
}
