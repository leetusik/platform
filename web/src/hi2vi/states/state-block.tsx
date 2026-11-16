import Link from "next/link";

import { Block, BlockText, BlockTitle, buttonClass, Cluster } from "@/hi2vi/ui";

import type { StateAction, StateModel } from "./model";

/**
 * A whole page's state block (`Block.dc.html`, `States.dc.html`), rendered into the main column:
 *
 *   .column > .block.block-page > h1.block-title + p.block-text + [actions] + p.meta
 *
 * Two or more actions sit in a `.cluster`; one sits alone, as the Not found board draws it. The title
 * sits on a page title's line through `.block-page` (frame.md F32). A retry needs `onRetry`, so a block
 * with one renders only from a client component (the error boundary).
 */
export function StateBlock({
  state,
  onRetry,
}: {
  state: StateModel;
  onRetry?: () => void;
}) {
  const actions = state.actions.map((action) => (
    <StateActionControl key={action.kind} action={action} onRetry={onRetry} />
  ));
  return (
    <div className="column">
      <Block page>
        <BlockTitle>{state.title}</BlockTitle>
        {state.text !== null ? <BlockText>{state.text}</BlockText> : null}
        {actions.length > 1 ? <Cluster>{actions}</Cluster> : actions}
        {state.reference !== null ? (
          <p className="meta">{state.reference}</p>
        ) : null}
      </Block>
    </div>
  );
}

function StateActionControl({
  action,
  onRetry,
}: {
  action: StateAction;
  onRetry?: () => void;
}) {
  if (action.kind === "retry") {
    return (
      <button
        type="button"
        className={buttonClass(action.variant)}
        onClick={onRetry}
      >
        {action.label}
      </button>
    );
  }
  return (
    <Link href={action.href} className={buttonClass(action.variant)}>
      {action.label}
    </Link>
  );
}
