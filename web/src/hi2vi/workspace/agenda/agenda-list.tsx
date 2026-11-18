"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

import { AGENDA } from "@/content/workspace/agenda";
import { Dialog, DialogActions } from "@/hi2vi/frame/dialog";
import { Pager } from "@/hi2vi/library/pager";
import { pagerRange } from "@/hi2vi/library/pager-model";
import { Swap } from "@/hi2vi/ui";
import { RefusedNotice, WaitingBadge, WsList } from "@/hi2vi/workspace/frame";
import { WS_CHANGE } from "@/content/workspace/frame";
import {
  addAgendaItem,
  deleteAgendaItems,
  discardChange,
  retryChange,
} from "@/lib/workspace/actions";
import { agendaHref, agendaItemHref } from "@/lib/workspace/address";
import { dates, phaseLookup } from "@/lib/workspace/model";
import {
  discarded,
  EMPTY_OVERLAY,
  reconcile,
  retried,
  view,
  written,
  type AgendaRead,
  type Overlay,
} from "@/lib/workspace/optimistic";
import { cleanTitle, titleError } from "@/lib/workspace/rules";
import type { PhaseRow, Unplaced } from "@/lib/workspace/types";

import {
  addIsPrimary,
  agendaFrom,
  agendaParts,
  AGENDA_SHOWN,
  deferredPlace,
  emptyText,
  endedShown,
  writeShown,
  type AgendaRowModel,
} from "./model";
import { AgendaLoading, AgendaRow, PartHead } from "./parts";

/** The phases an item's state and end cell need: their ids and status. */
export type AgendaPhase = Pick<PhaseRow, "id" | "short" | "status">;

export interface AgendaListProps {
  project: string;
  /** The Workspace's agenda (the operator's order) and its unplaced changes, as the page read them. */
  read: AgendaRead;
  phases: readonly AgendaPhase[];
  /** The viewer's zone: a day a change is made under, and F2's dates. */
  timeZone: string;
  /** The Deferred part's page the address names (`?deferred=N`), or null. */
  deferredPage: number | null;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

export type AgendaForm = null | {
  title: string;
  note: string;
  phase: "edit" | "adding" | "title-error" | "failed";
  /** Over the fields when the send failed: F45's sentence or the route's line. */
  notice: string | null;
};

type Ask = null | {
  ids: string[];
  title: string;
  lang: "en" | "ko";
  busy: boolean;
  notice: string | null;
};

/**
 * The Agenda's list (`AgendaList.dc.html`, frame.md F301 to F303), at rest: the three parts in a `.stack.gap-5`.
 *
 * - **Open and in progress** (always drawn): its head with the count and **Add item** (primary only while the
 *   agenda holds nothing; away while the form is open); the add form in place under the head; the open web changes
 *   no row carries (`unplaced`, F45's own notice); the rows in the operator's order, or the empty sentence; the
 *   list's status line.
 * - **Deferred** (when any): newest first by `changed`, ten a page, the pager in its foot (`?deferred=N`).
 * - **Solved and dropped** (when any): newest first, five, then **Show all N**.
 *
 * Every row's **Delete** asks (`Delete “<title>”?`, Cancel first, **Yes, delete**). Every write is one inbox entry
 * through the agenda's actions; the page keeps what it wrote (`Overlay`) over each read until a read shows it
 * applied or refused, and reads again after a write (`router.refresh()`).
 */
export function AgendaList({
  project,
  read,
  phases,
  timeZone,
  deferredPage,
}: AgendaListProps) {
  const router = useRouter();
  const uid = useId();
  const ids = {
    open: `${uid}-open`,
    deferred: `${uid}-deferred`,
    ended: `${uid}-ended`,
    title: `${uid}-title`,
    note: `${uid}-note`,
    error: `${uid}-error`,
  };

  // What this page wrote, laid over every read until a read shows it taken or refused.
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [seen, setSeen] = useState(read);
  if (seen !== read) {
    setSeen(read);
    setOverlay(reconcile(overlay, read));
  }

  const [form, setForm] = useState<AgendaForm>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [said, setSaid] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<Record<string, "retry" | "discard">>({});

  const addRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focus = useRef<"add" | "title" | "more" | null>(null);
  const deleted = useRef(false);

  useEffect(() => {
    if (focus.current === "add" && addRef.current) {
      focus.current = null;
      addRef.current.focus();
    } else if (focus.current === "title" && titleRef.current) {
      focus.current = null;
      titleRef.current.focus();
    }
  });

  const phaseOf = useMemo(() => phaseLookup(phases), [phases]);
  const fmt = useMemo(() => dates(timeZone), [timeZone]);
  const shown = view(read, overlay);
  const parts = agendaParts(shown.agenda, phaseOf, fmt.date);
  const place = deferredPlace(deferredPage, parts.deferred.length);
  const deferredRows = parts.deferred.slice(place.from, place.to);
  const ended = endedShown(parts.ended, all);
  const from = agendaFrom(place.page);
  const hrefOf = (row: AgendaRowModel) => agendaItemHref(project, row.id, from);

  // -- the add form --------------------------------------------------------------------------

  const openForm = () => {
    focus.current = "title";
    setForm({ title: "", note: "", phase: "edit", notice: null });
  };
  const closeForm = () => {
    focus.current = "add";
    setForm(null);
  };
  const adding = form?.phase === "adding";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || adding) return;
    if (titleError(form.title) !== null) {
      focus.current = "title";
      setForm({ ...form, phase: "title-error", notice: null });
      return;
    }
    const typed = form;
    setForm({ ...typed, phase: "adding", notice: null });
    const answer = await addAgendaItem(project, {
      title: typed.title,
      note: typed.note,
    });
    const result = writeShown(answer, AGENDA.form.failed);
    if (answer.ok) {
      setOverlay((o) => written(o, answer.entry, timeZone));
      setSaid(AGENDA.said.added(cleanTitle(typed.title) ?? typed.title));
      closeForm();
      router.refresh();
      return;
    }
    if (result.kind === "signed-out") {
      router.refresh();
      setForm({ ...typed, phase: "edit", notice: null });
    } else if (result.kind === "title") {
      focus.current = "title";
      setForm({ ...typed, phase: "title-error", notice: null });
    } else if (result.kind === "notice") {
      setForm({ ...typed, phase: "failed", notice: result.message });
    }
  };

  const formKey = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !adding) {
      event.preventDefault();
      closeForm();
    }
  };

  // -- Delete on a row -----------------------------------------------------------------------

  const askDelete = (row: AgendaRowModel) => {
    deleted.current = false;
    setAsk({
      ids: [row.id],
      title: row.title,
      lang: row.lang,
      busy: false,
      notice: null,
    });
  };
  const confirmDelete = async () => {
    if (!ask || ask.busy) return;
    const asked = ask;
    setAsk({ ...asked, busy: true, notice: null });
    const answer = await deleteAgendaItems(project, asked.ids);
    if (answer.ok) {
      deleted.current = true;
      setOverlay((o) => written(o, answer.entry, timeZone));
      setSaid(
        asked.ids.length === 1
          ? AGENDA.said.deleted(asked.title)
          : AGENDA.said.deletedMany(asked.ids.length),
      );
      setAsk(null);
      router.refresh();
      return;
    }
    const result = writeShown(answer, AGENDA.confirmDelete.failed);
    if (result.kind === "signed-out") router.refresh();
    setAsk({
      ...asked,
      busy: false,
      notice: result.kind === "notice" ? result.message : null,
    });
  };

  // -- the open changes no row carries ---------------------------------------------------------

  const discard = async (u: Unplaced) => {
    setBusy((b) => ({ ...b, [u.entry]: "discard" }));
    const answer = await discardChange(project, u.entry);
    setBusy((b) => without(b, u.entry));
    if (answer.ok) setOverlay((o) => discarded(o, answer.entry));
    router.refresh();
  };
  const retry = async (u: Unplaced) => {
    setBusy((b) => ({ ...b, [u.entry]: "retry" }));
    const answer = await retryChange(project, u.entry);
    setBusy((b) => without(b, u.entry));
    if (answer.ok)
      setOverlay((o) => retried(o, u.entry, answer.entry, timeZone));
    router.refresh();
  };

  // -- drawing ---------------------------------------------------------------------------------

  const open = parts.open;

  return (
    <div className="stack gap-5">
      <section className="panel agenda-part" aria-labelledby={ids.open}>
        <PartHead
          headId={ids.open}
          head={AGENDA.heads.open}
          count={AGENDA.count(open.length)}
        >
          {form === null ? (
            <div className="cluster agenda-head-acts agenda-add">
              <button
                type="button"
                className={addIsPrimary(parts) ? "btn btn-primary" : "btn"}
                ref={addRef}
                onClick={openForm}
              >
                {AGENDA.addItem}
              </button>
            </div>
          ) : null}
        </PartHead>
        {form !== null ? (
          <AddForm
            ids={ids}
            form={form}
            titleRef={titleRef}
            onChange={setForm}
            onSubmit={submit}
            onKeyDown={formKey}
            onCancel={closeForm}
          />
        ) : null}
        {shown.unplaced.length > 0 ? (
          <div className="panel-body has-rule stack gap-3">
            {shown.unplaced.map((u) =>
              u.refused !== null ||
              (u.sync !== null && typeof u.sync === "object") ? (
                <RefusedNotice
                  key={u.entry}
                  said={
                    u.refused ??
                    (typeof u.sync === "object" ? u.sync.refused : "")
                  }
                  busy={busy[u.entry] ?? null}
                  onRetry={() => retry(u)}
                  onDiscard={() => discard(u)}
                />
              ) : (
                <div key={u.entry} className="notice stack gap-3">
                  <p className="cluster">
                    {u.items.map((id) => (
                      <span key={id} className="ws-id">
                        {id}
                      </span>
                    ))}
                    <WaitingBadge />
                  </p>
                  <div className="cluster">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy[u.entry] !== undefined}
                      data-busy={busy[u.entry] ? "true" : undefined}
                      onClick={() => discard(u)}
                    >
                      {WS_CHANGE.discard}
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : null}
        {open.length > 0 ? (
          <WsList>
            {open.map((row) => (
              <AgendaRow
                key={row.id}
                row={row}
                href={hrefOf(row)}
                onDelete={() => askDelete(row)}
              />
            ))}
          </WsList>
        ) : (
          <div className="panel-body has-rule block">
            <p className="block-text">{emptyText(parts)}</p>
          </div>
        )}
        <p className="sr-only" role="status">
          {said}
        </p>
      </section>

      {parts.deferred.length > 0 ? (
        <section className="panel agenda-part" aria-labelledby={ids.deferred}>
          <PartHead
            headId={ids.deferred}
            head={AGENDA.heads.deferred}
            count={AGENDA.count(parts.deferred.length)}
          />
          <WsList>
            {deferredRows.map((row) => (
              <AgendaRow
                key={row.id}
                row={row}
                href={hrefOf(row)}
                onDelete={() => askDelete(row)}
              />
            ))}
          </WsList>
          {place.paged ? (
            <div className="panel-foot agenda-foot">
              <Pager
                page={place.page}
                pages={place.pages}
                range={pagerRange(
                  place.page,
                  AGENDA.pager.per,
                  parts.deferred.length,
                )}
                label={AGENDA.pager.label}
                pageKey="deferred"
                hrefFor={(n) => agendaHref(project, { deferred: n })}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {parts.ended.length > 0 ? (
        <section className="panel agenda-part" aria-labelledby={ids.ended}>
          <PartHead
            headId={ids.ended}
            head={AGENDA.heads.ended}
            count={AGENDA.count(parts.ended.length)}
          />
          <WsList>
            {ended.rows.map((row, i) => (
              <AgendaRow
                key={row.id}
                row={row}
                href={hrefOf(row)}
                linkRef={
                  i === AGENDA_SHOWN
                    ? (el) => {
                        if (el && focus.current === "more") {
                          focus.current = null;
                          el.focus();
                        }
                      }
                    : undefined
                }
                onDelete={() => askDelete(row)}
              />
            ))}
          </WsList>
          {ended.more !== null ? (
            <div className="panel-foot">
              <button
                type="button"
                className="link link-row"
                onClick={() => {
                  focus.current = "more";
                  setAll(true);
                }}
              >
                {AGENDA.showAll(ended.more)}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {ask !== null ? (
        <AgendaConfirm
          ask={ask}
          cancelRef={cancelRef}
          onCancel={() => setAsk(null)}
          onConfirm={confirmDelete}
          returnFocus={() => (deleted.current ? addRef.current : null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The add form, in place under the open part's head (`AgendaList.dc.html`, F81): **Title** (one line, its
 * placeholder), **Note (optional)** (two rows), then **Cancel** and **Add** (`Adding…` while it is sent; both
 * fields and Cancel are disabled then). A title the route would refuse puts the signed sentence under the field
 * (`.field-error`, `aria-invalid`, `aria-describedby`), gone when the field is edited; a send that failed puts its
 * sentence over the fields (`role="alert"`), the form open with what was typed.
 */
export function AddForm({
  ids,
  form,
  titleRef,
  onChange,
  onSubmit,
  onKeyDown,
  onCancel,
}: {
  ids: { title: string; note: string; error: string };
  form: NonNullable<AgendaForm>;
  titleRef?: RefObject<HTMLInputElement | null>;
  onChange: (form: NonNullable<AgendaForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const adding = form.phase === "adding";
  const fieldError = form.phase === "title-error";
  const noted = form.notice;
  return (
    <form
      className="panel-body has-rule"
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      noValidate
    >
      <div className="stack agenda-form">
        {noted !== null ? (
          <p className="notice notice-danger" role="alert">
            {noted}
          </p>
        ) : null}
        <div className="field">
          <label className="label" htmlFor={ids.title}>
            {AGENDA.form.title}
          </label>
          <input
            className="input"
            id={ids.title}
            type="text"
            autoComplete="off"
            placeholder={AGENDA.form.titlePlaceholder}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? ids.error : undefined}
            value={form.title}
            disabled={adding}
            ref={titleRef}
            onChange={(e) =>
              onChange({
                ...form,
                title: e.target.value,
                phase: fieldError ? "edit" : form.phase,
              })
            }
          />
          {fieldError ? (
            <p className="field-error" id={ids.error}>
              {AGENDA.form.titleError}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label className="label" htmlFor={ids.note}>
            {AGENDA.form.note}
          </label>
          <textarea
            className="input"
            id={ids.note}
            rows={2}
            value={form.note}
            disabled={adding}
            onChange={(e) => onChange({ ...form, note: e.target.value })}
          />
        </div>
        <div className="cluster to-end">
          <button
            type="button"
            className="btn"
            disabled={adding}
            onClick={onCancel}
          >
            {AGENDA.form.cancel}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            data-busy={adding ? "true" : undefined}
            aria-busy={adding ? true : undefined}
          >
            <Swap labels={[...AGENDA.form.add]} />
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Delete asks first (F303; the system's `Dialog`, F3): `Delete “<title>”?`, the sentence, **Cancel** and **Yes,
 * delete** (`.btn-danger`, `Deleting…` while it is sent; Escape does nothing then). Focus opens on Cancel; Cancel or
 * Escape closes it and focus goes back to the button that opened it (`returnFocus()` null). After a delete is
 * sent, focus goes to `returnFocus()`: the opener is gone with its row.
 */
export function AgendaConfirm({
  ask,
  cancelRef,
  onCancel,
  onConfirm,
  returnFocus,
}: {
  ask: NonNullable<Ask>;
  cancelRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const w = AGENDA.confirmDelete;
  const one = ask.ids.length === 1;
  const cancel = () => {
    if (!ask.busy) onCancel();
  };
  return (
    <Dialog
      label={one ? w.title(ask.title) : w.titleMany(ask.ids.length)}
      onClose={cancel}
      initialFocus={cancelRef}
      returnFocus={returnFocus}
      locked={ask.busy}
    >
      <h2>
        {one ? (
          <>
            {w.before}
            <span lang={ask.lang}>{ask.title}</span>
            {w.after}
          </>
        ) : (
          w.titleMany(ask.ids.length)
        )}
      </h2>
      <p>{one ? w.text : w.textMany}</p>
      {ask.notice !== null ? (
        <p className="notice notice-danger" role="alert">
          {ask.notice}
        </p>
      ) : null}
      <DialogActions>
        <button
          type="button"
          className="btn"
          data-cancel="true"
          ref={cancelRef}
          disabled={ask.busy}
          onClick={cancel}
        >
          {w.cancel}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          data-busy={ask.busy ? "true" : undefined}
          aria-busy={ask.busy ? true : undefined}
          onClick={onConfirm}
        >
          <Swap labels={[...w.yes]} />
        </button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The agenda did not load (F49: a part that failed keeps its head): the first part's title alone, `The agenda did
 * not load.` and **Try again**, which shows the loading part while the page reads again.
 */
export function AgendaFailed() {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  if (pending) return <AgendaLoading headId={`${uid}-open`} />;
  return (
    <div className="stack gap-5">
      <section className="panel agenda-part" aria-labelledby={`${uid}-open`}>
        <PartHead
          headId={`${uid}-open`}
          head={AGENDA.heads.open}
          count={null}
        />
        <div className="panel-body has-rule block">
          <p className="block-text">{AGENDA.failed}</p>
          <button
            type="button"
            className="btn"
            onClick={() => start(() => router.refresh())}
          >
            {AGENDA.retry}
          </button>
        </div>
      </section>
    </div>
  );
}
