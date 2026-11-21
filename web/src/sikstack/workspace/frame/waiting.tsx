import { WS_CHANGE } from "@/content/workspace/frame";
import { Swap } from "@/sikstack/ui";

import { WsText } from "./text";

/** A change made on the web that the workspace takes at its next sync (frame.md F45): the dashed badge. */
export function WaitingBadge() {
  return <span className="badge is-waiting">{WS_CHANGE.waiting}</span>;
}

/** In a list, a change the workspace refused: the plain badge; the notice is on the item's page (F45). */
export function RefusedBadge() {
  return <span className="badge">{WS_CHANGE.refusedBadge}</span>;
}

/**
 * A change the workspace refused (frame.md F45, `WsStatus.dc.html`): the system's danger notice at the top of the
 * item, `The workspace did not take this change. <what it said>.`, then **Try again** and **Discard**. While one
 * is sent it shows its pending label (`busy`: the change's own label for Try again, F36), at the same width.
 */
export function RefusedNotice({
  said,
  onRetry,
  onDiscard,
  busy = null,
  retryPending,
  discardPending,
}: {
  said: string;
  onRetry?: () => void;
  onDiscard?: () => void;
  busy?: "retry" | "discard" | null;
  retryPending?: string;
  discardPending?: string;
}) {
  const label = (text: string, pending: string | undefined) =>
    pending === undefined ? text : <Swap labels={[text, pending]} />;
  return (
    <div className="notice notice-danger stack gap-3" role="alert">
      <p>
        <WsText text={WS_CHANGE.refused(said)} />
      </p>
      <div className="cluster">
        <button
          type="button"
          className="btn"
          onClick={onRetry}
          disabled={busy !== null}
          data-busy={busy === "retry" ? "true" : undefined}
        >
          {label(WS_CHANGE.retry, retryPending)}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={onDiscard}
          disabled={busy !== null}
          data-busy={busy === "discard" ? "true" : undefined}
        >
          {label(WS_CHANGE.discard, discardPending)}
        </button>
      </div>
    </div>
  );
}
