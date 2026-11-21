import Link from "next/link";

import { BACKLOG } from "@/content/workspace/backlog";
import { WsProse } from "@/sikstack/workspace/frame/prose";

import type { BacklogWaitingItem } from "./model";
import { Ref } from "./parts";

/**
 * What waits on the operator, first on the page; drawn only when something waits (`BacklogWaiting.dc.html`, F83).
 * A stop's words are stored prose, drawn as their Markdown (`WsProse`): server-rendered, in a file of its own, so
 * the parts the backlog's client forms import (loading, failed) never carry the renderer.
 */
export function BacklogWaiting({ items }: { items: BacklogWaitingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-label={BACKLOG.waiting}>
      <div className="panel-head">
        <h2>
          <span className="status status-pending">{BACKLOG.waiting}</span>
        </h2>
      </div>
      <ul>
        {items.map((it, i) => (
          <li key={`${it.id}-${i}`} className="row backlog-wait">
            <div className="cluster gap-3">
              <Link className="link-strong" href={it.href}>
                <Ref refd={it} />
              </Link>
              {it.kind ? <span className="badge">{it.kind}</span> : null}
            </div>
            {it.what ? (
              <p className="ws-prose">
                <WsProse text={it.what} />
              </p>
            ) : null}
            {it.words ? (
              <p className="dim ws-prose">
                <WsProse text={it.words} />
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
