"use client";

import Link from "next/link";

import {
  BackRow,
  WsItemFailed,
  WsRetrySync,
  wsNotFoundState,
  type WsBack,
  type WsSyncLine,
} from "@/sikstack/workspace/frame";
import type { StateAction, StateModel } from "@/sikstack/states";
import { Block, BlockText, BlockTitle, buttonClass, Cluster } from "@/sikstack/ui";

import { PhaseLoading } from "./loading-view";

/**
 * The first row: the back link and, when the workspace's sync is known, the sync line (F84); unknown, the line's
 * bar alone while Try again reads the page again.
 */
function TopRow({ back, line }: { back: WsBack; line: WsSyncLine | null }) {
  if (line) return <BackRow {...back} line={line} />;
  return (
    <div className="ws-top">
      <Link className="back" href={back.href}>
        {back.label}
      </Link>
      <WsRetrySync />
    </div>
  );
}

/** F49's block under the back row, on the line a phase's title takes (`.block-page`). */
function StateUnderBack({
  back,
  line,
  state,
  onRetry,
}: {
  back: WsBack;
  line: WsSyncLine | null;
  state: StateModel;
  onRetry?: () => void;
}) {
  const action = (a: StateAction) =>
    a.kind === "retry" ? (
      <button
        key="retry"
        type="button"
        className={buttonClass(a.variant)}
        onClick={onRetry}
      >
        {a.label}
      </button>
    ) : (
      <Link key={a.href} className={buttonClass(a.variant)} href={a.href}>
        {a.label}
      </Link>
    );
  const actions = state.actions.map(action);
  return (
    <div className="column">
      <div className="page-top">
        <TopRow back={back} line={line} />
        <Block page>
          <BlockTitle>{state.title}</BlockTitle>
          {state.text !== null ? <BlockText>{state.text}</BlockText> : null}
          {actions.length > 1 ? <Cluster>{actions}</Cluster> : actions}
          {state.reference !== null ? (
            <p className="meta">{state.reference}</p>
          ) : null}
        </Block>
      </div>
    </div>
  );
}

/** Phase not found (`Phase.dc.html`, Not found; F49): under the back row, **Back to Backlog**. */
export function PhaseMissing({
  back,
  line,
  project,
}: {
  back: WsBack;
  line: WsSyncLine | null;
  project: string;
}) {
  return (
    <StateUnderBack
      back={back}
      line={line}
      state={wsNotFoundState("phase", project, back)}
    />
  );
}

/**
 * The phase did not load (`Phase.dc.html`, Error; F49, F5): the frame's one failed state for an item page, under
 * the back row, **Try again** (primary) and **Back to Backlog**, the reference when the error has one. Try again
 * shows Loading while the route renders again on the server (`router.refresh()`: the reads are `no-store`; an
 * error boundary's own retry the same way), the sync line a bar (F40), then the phase, or this block again.
 */
export function PhaseFailed({
  back,
  line,
  id,
  digest = null,
  retry,
}: {
  back: WsBack;
  line: WsSyncLine | null;
  id: string | null;
  digest?: string | null;
  /** An error boundary's own Try again (`boundaryRetry`); without it, the route renders again in place. */
  retry?: () => void;
}) {
  return (
    <WsItemFailed
      back={back}
      line={line}
      digest={digest}
      retry={retry}
      whileRetrying={<PhaseLoading back={back} id={id} />}
    />
  );
}
