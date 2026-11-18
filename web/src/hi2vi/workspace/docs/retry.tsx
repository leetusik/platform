"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { WS_STATES } from "@/content/workspace/frame";
import type { StateModel } from "@/hi2vi/states";
import { useWsRetry } from "@/hi2vi/workspace/frame";
import { Block, BlockText, BlockTitle, buttonClass, Cluster } from "@/hi2vi/ui";

import { DocsList } from "./list";

/**
 * Fetches the page again: the reads are server reads, never cached, so the route renders anew; meanwhile the
 * page's sync line is its bar (F40).
 */
function useRefresh(): [boolean, () => void] {
  const router = useRouter();
  const [busy, run] = useWsRetry();
  return [busy, () => run(() => router.refresh())];
}

/**
 * The docs list that did not load (`DocsList.dc.html`, failed): the panel keeps its head, `Docs did not load.` and
 * **Try again**. Pressed, the list's loading form while the page is fetched again; then the list, or this again.
 */
export function DocsListFailed() {
  const [busy, refresh] = useRefresh();
  if (busy) return <DocsList state={{ kind: "loading" }} />;
  return (
    <DocsList
      state={{
        kind: "failed",
        retry: (
          <button type="button" className={buttonClass()} onClick={refresh}>
            {WS_STATES.retry}
          </button>
        ),
      }}
    />
  );
}

/**
 * A doc's page that did not load, or names no doc (F49, `Docs.dc.html`): the page's block directly under the back
 * row, `h1` its title, its sentence, its actions (Try again, the primary, fetches the page again; the way back is a
 * link) and the reference when there is one. It sits in the page's own column, so it draws no column of its own.
 */
export function DocStateBlock({ state }: { state: StateModel }) {
  const [busy, refresh] = useRefresh();
  const actions = state.actions.map((action) =>
    action.kind === "retry" ? (
      <button
        key="retry"
        type="button"
        className={buttonClass(action.variant)}
        disabled={busy}
        onClick={refresh}
      >
        {action.label}
      </button>
    ) : (
      <Link
        key={action.href}
        href={action.href}
        className={buttonClass(action.variant)}
      >
        {action.label}
      </Link>
    ),
  );
  return (
    <Block page>
      <BlockTitle>{state.title}</BlockTitle>
      {state.text !== null ? <BlockText>{state.text}</BlockText> : null}
      {actions.length > 1 ? <Cluster>{actions}</Cluster> : actions}
      {state.reference !== null ? (
        <p className="meta">{state.reference}</p>
      ) : null}
    </Block>
  );
}
