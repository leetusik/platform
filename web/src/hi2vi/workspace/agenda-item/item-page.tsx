"use client";

import { useEffect, useReducer, useRef, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AGENDA_ITEM } from "@/content/workspace/agenda-item";
import { WS_ACTIONS, WS_CHANGE, WS_STATES } from "@/content/workspace/frame";
import { Dialog, DialogActions } from "@/hi2vi/frame";
import { StateBlock, type StateModel } from "@/hi2vi/states";
import { Button, Swap } from "@/hi2vi/ui";
import {
  deferAgendaItems,
  deleteAgendaItems,
  discardChange,
  dropAgendaItems,
  editAgendaItem,
  reopenAgendaItems,
  retryChange,
  solveAgendaItems,
} from "@/lib/workspace/actions";
import { dates } from "@/lib/workspace/model";
import type { WriteAnswer } from "@/lib/workspace/types";

import {
  BackRow,
  ItemHead,
  wsNotFoundState,
  WsText,
  type WsBack,
  type WsSyncLine,
} from "../frame";

import { AgendaItemForm } from "./form";
import { HeadActions, HeadFacts, HeadMarks } from "./head";
import { JobsPanel, PhasesPanel } from "./lists";
import { itemView, retryLabel, type HeadAction, type ItemRead } from "./model";
import { formSend, INITIAL, reduce, type Busy } from "./state";

/** What the server page read: the item with its rows, or nothing (the project named for Not found). */
export type ItemPageRead =
  | ({ state: "ready" } & ItemRead)
  | { state: "not-found"; projectName: string | null };

/**
 * An agenda item's page (`AgendaItem.dc.html`; frame.md F35, F45, F81, F84, F303), in one column:
 *
 * 1. the back row: **Agenda** (the way back, at the page it was opened from) and the sync line;
 * 2. the head: the id and the title, the status and Waiting for sync as one group, the actions; the facts;
 * 3. the form slot (Edit, Solve or Drop, one at a time);
 * 4. a change the workspace refused: its line, then **Discard** and **Try again** at the notice's right end;
 * 5. **Phases** and **Deferred jobs**.
 *
 * Every write is one inbox entry through the Workspace's actions; it is laid over the read until a read shows
 * it applied or refused, and the page reads again after each one. After its own Delete the page says **Item
 * deleted** and the Agenda opens. An item the read does not hold is Not found, under the back row.
 */
export function AgendaItemPage({
  project,
  back,
  line,
  timeZone,
  now,
  read,
}: {
  project: string;
  back: WsBack;
  /** The sync line; null when no read could say it. */
  line: WsSyncLine | null;
  timeZone: string;
  now: number;
  read: ItemPageRead;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const root = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const readItem = read.state === "ready" ? read.item : null;

  // a new read folds in: what it shows applied or refused leaves the overlay
  useEffect(() => {
    if (readItem) dispatch({ type: "read", item: readItem });
  }, [readItem]);

  // the button (or field) the page asked for takes the focus, once
  const focusN = state.focus?.n;
  useEffect(() => {
    const on = state.focus?.on;
    if (on)
      root.current?.querySelector<HTMLElement>(`[data-focus="${on}"]`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusN]);

  const fmt = dates(timeZone, now);

  const top = <TopRow back={back} line={line} />;

  if (state.gone !== null) {
    return (
      <div className="column">
        <header className="page-top">
          {top}
          <StateBlock state={deletedState(state.gone, back)} />
        </header>
      </div>
    );
  }
  const view = read.state === "ready" ? itemView(read, state.overlay) : null;
  if (read.state !== "ready" || !view) {
    const projectName = read.state === "not-found" ? read.projectName : null;
    return (
      <div className="column">
        <header className="page-top">
          {top}
          <StateBlock
            state={wsNotFoundState(
              "item",
              projectName ?? AGENDA_ITEM.thisProject,
              back,
            )}
          />
        </header>
      </div>
    );
  }

  const item = view.item;
  const id = item.id;
  const busy = state.busy;

  async function sendHead(
    kind: Exclude<Busy, "form">,
    send: () => Promise<WriteAnswer>,
    extra: { refusedEntry?: string; title?: string } = {},
  ) {
    if (state.busy) return;
    dispatch({ type: "send", busy: kind });
    const answer = await send();
    dispatch({ type: "answer", answer, timeZone, ...extra });
    if (answer.ok && kind === "delete") router.push(back.href);
    else router.refresh();
  }

  async function submitForm() {
    if (!state.form || state.busy) return;
    const out = formSend(state.form, state.draft);
    dispatch({ type: "submit" });
    if (!out) return;
    const answer =
      out.kind === "edit"
        ? await editAgendaItem(project, id, {
            title: out.title,
            note: out.note,
          })
        : out.kind === "solve"
          ? await solveAgendaItems(project, [id], out.outcome)
          : await dropAgendaItems(project, [id], out.reason);
    dispatch({ type: "answer", answer, timeZone });
    if (answer.ok || answer.reason !== "title") router.refresh();
  }

  const open = (form: "edit" | "solve" | "drop") => () =>
    dispatch({ type: "open", form, item });
  const on: Partial<Record<HeadAction, () => void>> = {
    edit: open("edit"),
    solve: open("solve"),
    drop: open("drop"),
    defer: () => void sendHead("defer", () => deferAgendaItems(project, [id])),
    reopen: () =>
      void sendHead("reopen", () => reopenAgendaItems(project, [id])),
    delete: () => dispatch({ type: "ask" }),
  };
  const title = item.title ?? id;
  const refused = view.refused;
  const deleting = busy === "delete";

  return (
    <div className="column" ref={root}>
      <ItemHead
        back={back}
        line={line ?? NO_LINE}
        id={id}
        name={title}
        lang={item.lang === "ko" ? "ko" : null}
        after={<HeadMarks view={view} />}
        headClass="agendaitem-row"
        actions={
          <HeadActions
            actions={view.actions}
            allDone={view.allDone}
            opened={state.form !== null}
            busy={busy}
            on={on}
          />
        }
      >
        <HeadFacts
          view={view}
          created={fmt.date(item.created)}
          changed={fmt.date(item.changed)}
        />
      </ItemHead>
      {state.form ? (
        <AgendaItemForm
          key={state.form}
          kind={state.form}
          phase={state.phase}
          notice={state.notice}
          failed={state.failed}
          draft={state.draft}
          onChange={(field, value) =>
            dispatch({ type: "change", field, value })
          }
          onSubmit={() => void submitForm()}
          onCancel={() => dispatch({ type: "cancel" })}
        />
      ) : null}
      {state.asking ? (
        <Dialog
          label={AGENDA_ITEM.confirm.title(title)}
          initialFocus={cancelRef as RefObject<HTMLElement | null>}
          locked={deleting}
          onClose={() => dispatch({ type: "ask-cancel" })}
        >
          <h2>{AGENDA_ITEM.confirm.title(title)}</h2>
          <p>{AGENDA_ITEM.confirm.text}</p>
          <DialogActions>
            <Button
              ref={cancelRef}
              disabled={deleting}
              onClick={() => dispatch({ type: "ask-cancel" })}
            >
              {WS_ACTIONS.cancel}
            </Button>
            <Button
              variant="danger"
              busy={deleting}
              busyLabel={AGENDA_ITEM.confirm.pending}
              onClick={() =>
                void sendHead(
                  "delete",
                  () => deleteAgendaItems(project, [id]),
                  {
                    title,
                  },
                )
              }
            >
              {AGENDA_ITEM.confirm.yes}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
      {refused ? (
        <div className="notice notice-danger stack gap-3" role="alert">
          <p>
            <WsText text={WS_CHANGE.refused(refused.said)} />
          </p>
          <div className="cluster to-end">
            <button
              type="button"
              className="btn"
              disabled={busy === "retry"}
              onClick={() =>
                void sendHead("discard", () =>
                  discardChange(project, refused.entry),
                )
              }
            >
              {WS_CHANGE.discard}
            </button>
            <button
              type="button"
              className="btn"
              data-busy={busy === "retry" ? "true" : undefined}
              aria-busy={busy === "retry" ? true : undefined}
              onClick={() =>
                void sendHead(
                  "retry",
                  () => retryChange(project, refused.entry),
                  { refusedEntry: refused.entry },
                )
              }
            >
              <Swap
                labels={[
                  WS_CHANGE.retry,
                  retryLabel(state.kinds[refused.entry] ?? refused.kind),
                ]}
              />
            </button>
          </div>
        </div>
      ) : null}
      <PhasesPanel project={project} view={view} />
      <JobsPanel project={project} view={view} date={fmt.date} />
    </div>
  );
}

/** A back row with no sync line to say (the reads that carry it failed): the way back alone. */
const NO_LINE: WsSyncLine = {
  state: "unlinked",
  text: "",
  cls: "",
  version: "",
};

function TopRow({ back, line }: { back: WsBack; line: WsSyncLine | null }) {
  if (line) return <BackRow {...back} line={line} />;
  return (
    <div className="ws-top">
      <Link className="back" href={back.href}>
        {back.label}
      </Link>
    </div>
  );
}

/** After the page's own Delete (F303): Item deleted, its sentence, **Back to Agenda**. */
export function deletedState(title: string, back: WsBack): StateModel {
  return {
    title: AGENDA_ITEM.deleted.title,
    text: AGENDA_ITEM.deleted.text(title),
    actions: [
      {
        kind: "link",
        label: WS_STATES.back(back.label),
        href: back.href,
        variant: "default",
      },
    ],
    reference: null,
  };
}
