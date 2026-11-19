import Link from "next/link";
import type { Ref } from "react";

import { ADD, AGENDA } from "@/content/feedback-agenda";
import { PARTS } from "@/content/feedback-frame";
import { Status } from "@/hi2vi/ui/marks";
import { agendaStatus } from "@/lib/feedback/agenda";
import { PAGE_LANG } from "@/lib/feedback/lang";

import { Waiting } from "../marks";
import type { AgendaPageState } from "./model";

/** The Agenda part's states: what the feedback became, or why the add is not offered. */
export type AgendaPartState = Exclude<AgendaPageState, { kind: "offered" }>;

/**
 * The Agenda part (`FeedbackItemAgenda.dc.html`; `result.md` § The Agenda part; frame.md F341, F342,
 * F344), between Comment and Details, only once the feedback was added (waiting, then filed) or when
 * the add is not offered. Waiting and filed: one row, the item's id in the second ink, its title as the
 * link to the item in the Workspace with `Waiting for sync` beside it while it waits, and its status in
 * the Workspace's word and shape; waiting adds the sync sentence under it. Not offered: the sentence
 * that says why. Presentational; renders on the server or in the add's island alike.
 *
 * Decided as drawn: the board's `button.link-strong.fi-item-open` (its `on-open-item`) is a link to the
 * item's own page (`item.href`), drawn in the board's classes.
 */
export function AgendaPart({ state }: { state: AgendaPartState }) {
  return (
    <section className="panel" aria-label={PARTS.agenda}>
      <div className="panel-head">
        <h2>{PARTS.agenda}</h2>
      </div>
      {state.kind === "not-offered" ? (
        <div className="panel-body has-rule block">
          <p className="block-text">{state.text}</p>
        </div>
      ) : (
        <AgendaItemRow state={state} />
      )}
    </section>
  );
}

function AgendaItemRow({
  state,
}: {
  state: Extract<AgendaPartState, { kind: "filed" | "waiting" }>;
}) {
  const { item } = state;
  const waiting = state.kind === "waiting";
  const status = agendaStatus(item.state);
  return (
    <>
      <ul className="fi-items">
        <li className="row fi-item">
          <span className="dim">{item.id}</span>
          <span className="fi-item-title">
            <Link
              className="link-strong fi-item-open"
              href={item.href}
              lang={item.lang !== PAGE_LANG ? item.lang : undefined}
            >
              {item.title}
            </Link>
            {waiting ? <Waiting /> : null}
          </span>
          <Status state={status.shape}>{status.word}</Status>
        </li>
      </ul>
      {waiting ? (
        <div className="panel-body has-rule">
          <p className="meta">{AGENDA.sync}</p>
        </div>
      ) : null}
    </>
  );
}

/**
 * The head's end once added (F341, F344): `Added to agenda` at weight 500, no badge, waiting or not. It
 * holds the button's place, one control tall (`div.fi-send`), and takes focus once after an add
 * (`tabindex=-1`, the add's island focuses it); a page that opens on a record already added moves none.
 */
export function AddedToAgenda({
  statusRef,
}: {
  statusRef?: Ref<HTMLParagraphElement>;
}) {
  return (
    <div className="fi-send">
      <p
        className="cluster baseline"
        role="status"
        tabIndex={-1}
        ref={statusRef}
      >
        <span className="strong">{ADD.added}</span>
      </p>
    </div>
  );
}
