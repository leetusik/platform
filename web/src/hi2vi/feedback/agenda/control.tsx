"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ADD } from "@/content/feedback-agenda";
import { Dialog, DialogActions } from "@/hi2vi/frame/dialog";
import { Button } from "@/hi2vi/ui/button";
import { Notice } from "@/hi2vi/ui/field";
import type { AgendaItem } from "@/lib/feedback/agenda";

import {
  answer,
  ask,
  cancel,
  focusBack,
  isLocked,
  isOpen,
  send,
  type AddPhase,
} from "./model";
import { AddedToAgenda, AgendaPart } from "./part";

/**
 * Add to agenda (`FeedbackItemSend.dc.html`; `result.md` § The add to the agenda; frame.md F143, F341
 * to F344), the client island for a record whose add is offered. `AgendaScope` holds the add's phase
 * and the item it filed and wraps the whole item, so its two places read one state: `AgendaHeadEnd`
 * at the head's end (the button and its confirm, then `Added to agenda`) and `AgendaSlot` between
 * Comment and Details (the Agenda part, once added). The page mounts the scope only when `canAdd`
 * offers the add, which today it never does.
 *
 * The confirm is the frame's `Dialog` (`dialog.dlg`, `showModal()`): it opens on Cancel; Cancel and
 * Escape close it and return focus to the button; while the add is in flight Cancel is disabled,
 * Escape does nothing and the primary reads `Adding…` in a swap; a failure keeps it open with the
 * notice; a success closes it, the head reads `Added to agenda` and focus lands once on that status.
 */
export interface AgendaScopeProps {
  /** The project's name: the confirm's title says it. */
  project: string;
  /** The add: files the record (the agenda seam's `fileAgendaItem`, through a server action). */
  add?: () => Promise<AgendaItem>;
  /** The phase to start in (`rest` on a page; the tests and the harness drive every state with it). */
  phase?: AddPhase;
  /** The item already added, with `phase="added"`. */
  item?: AgendaItem | null;
  children: ReactNode;
}

interface AgendaScopeValue {
  project: string;
  phase: AddPhase;
  item: AgendaItem | null;
  onAsk: () => void;
  onCancel: () => void;
  onSend: () => void;
}

const AgendaContext = createContext<AgendaScopeValue | null>(null);

export function AgendaScope({
  project,
  add,
  phase: initialPhase = "rest",
  item: initialItem = null,
  children,
}: AgendaScopeProps) {
  const [phase, setPhase] = useState<AddPhase>(initialPhase);
  const [item, setItem] = useState<AgendaItem | null>(initialItem);
  /** An answer lands only on the add that started it, and never after the page is left. */
  const ticket = useRef(0);
  useEffect(
    () => () => {
      ticket.current += 1;
    },
    [],
  );

  async function run() {
    const mine = ++ticket.current;
    let filed: AgendaItem | null = null;
    try {
      if (add) filed = await add();
    } catch {
      filed = null;
    }
    if (mine !== ticket.current) return;
    if (filed) setItem(filed);
    setPhase((current) => answer(current, filed !== null));
  }

  const value: AgendaScopeValue = {
    project,
    phase,
    item,
    onAsk: () => setPhase(ask),
    onCancel: () => setPhase(cancel),
    onSend: () => {
      if (send(phase) === phase) return;
      setPhase(send(phase));
      void run();
    },
  };
  return (
    <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>
  );
}

function useAgendaScope(): AgendaScopeValue {
  const value = useContext(AgendaContext);
  if (!value)
    throw new Error("AgendaHeadEnd and AgendaSlot need an AgendaScope");
  return value;
}

/** The head's end: the button and its confirm, then `Added to agenda`. */
export function AgendaHeadEnd() {
  const { project, phase, onAsk, onCancel, onSend } = useAgendaScope();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const title = ADD.title(project);
  const locked = isLocked(phase);

  if (phase === "added") return <AddedToAgenda statusRef={statusRef} />;
  return (
    <div className="fi-send">
      <Button ref={buttonRef} variant="primary" onClick={onAsk}>
        {ADD.action}
      </Button>
      {isOpen(phase) ? (
        <Dialog
          label={title}
          onClose={onCancel}
          initialFocus={cancelRef}
          returnFocus={() =>
            focusBack<HTMLElement>(statusRef.current, buttonRef.current)
          }
          locked={locked}
        >
          <h2>{title}</h2>
          {phase === "failed" ? (
            <Notice danger role="alert">
              {ADD.failed}
            </Notice>
          ) : null}
          <p>{ADD.text}</p>
          <DialogActions>
            <Button ref={cancelRef} disabled={locked} onClick={onCancel}>
              {ADD.cancel}
            </Button>
            <Button
              variant="primary"
              busy={locked}
              busyLabel={ADD.adding}
              onClick={onSend}
            >
              {ADD.action}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </div>
  );
}

/** The Agenda part's place: the item once added; nothing before. */
export function AgendaSlot() {
  const { item } = useAgendaScope();
  if (!item) return null;
  return (
    <AgendaPart
      state={
        item.sync === null ? { kind: "filed", item } : { kind: "waiting", item }
      }
    />
  );
}
