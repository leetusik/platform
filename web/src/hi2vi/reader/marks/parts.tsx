"use client";

import Link from "next/link";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";

import { type SaveWhat } from "@/content/library-frame";
import { READER_MARKS } from "@/content/reader-marks";
import { MarkRow, Save, type Mark } from "@/hi2vi/library";

import {
  barAria,
  countLine,
  type BarKind,
  type BesideNote,
  type BoxKind,
  type Send,
} from "./model";

/**
 * The Library's marks, drawn (P63-fk.S11; job 03, Library round 02, `## Build` § Page: annotations; the boards
 * `AnnotationsBar`, `AnnotationsBox`, `AnnotationsPaint`, `AnnotationsPlace`, `AnnotationsNotes`). Presentational:
 * props and events, no data and no reads; the annotation layer (`components/reader/annotations.tsx`,
 * `look="library"`) owns every mark and wires these. The classes are `styles/library/annotations.css`'s.
 *
 * The signed sheet's names are built as its `an-*` with the prefix `marks-` (`.an-box` is `.marks-box`, …): the
 * old reader's sheet, still loaded on the page for Listen's old look, styles `.an-box`, `.an-float`, `.an-slot`,
 * `.an-pick`, `.an-place` and `.an-notes` with no scope, so the signed names would draw both looks at once. The
 * paint keeps the signed `mark.an-m` and `.an-pending`, which the old sheets style only under the old root
 * (`tests/reader-marks.test.ts`). Every floating part carries `data-an-ui`, which the layer reads as its own.
 */
const W = READER_MARKS;
const UI = { "data-an-ui": "" };

// --- the bar a selection shows ----------------------------------------------------------------------

export interface MarksBarProps {
  kind: BarKind;
  /** The section's title (cut, block), in `sectionLang`. */
  section?: string;
  sectionLang?: string;
  /** The word before a heading's title (`Section`). */
  word?: string;
  bookmarked?: boolean;
  onHighlight?: () => void;
  onNote?: () => void;
  onBookmark?: () => void;
  /** The bar never takes the selection away: a press on it keeps the text selected. */
  onMouseDown?: (e: MouseEvent) => void;
}

export function MarksBar({
  kind,
  section = "",
  sectionLang,
  word = W.bar.section,
  bookmarked = false,
  onHighlight,
  onNote,
  onBookmark,
  onMouseDown,
}: MarksBarProps) {
  const toggle = (off: string, on: string) => (
    <button
      type="button"
      className="btn marks-toggle"
      aria-pressed={bookmarked}
      data-swap={bookmarked}
      onClick={onBookmark}
    >
      <span className="swap">
        <span>{off}</span>
        <span>{on}</span>
      </span>
    </button>
  );
  return (
    <div
      className="marks-bar"
      role="toolbar"
      aria-label={barAria(kind)}
      onMouseDown={onMouseDown}
    >
      {kind === "cut" ? (
        <p className="marks-bar-line">
          {W.bar.cutLead}
          <strong lang={sectionLang}>{section}</strong>
          {W.bar.cutTail}
        </p>
      ) : null}
      {kind === "block" ? (
        <p className="marks-bar-line">
          <span className="dim">{word}</span>{" "}
          <strong lang={sectionLang}>{section}</strong>
        </p>
      ) : null}
      {kind === "refused" ? (
        <p className="marks-bar-line">{W.bar.refused}</p>
      ) : null}
      {kind === "plain" ? (
        <p className="marks-bar-line">{W.bar.plain}</p>
      ) : null}
      {kind === "passage" || kind === "cut" ? (
        <div className="cluster">
          <button type="button" className="btn" onClick={onHighlight}>
            {W.bar.highlight}
          </button>
          <button type="button" className="btn" onClick={onNote}>
            {W.bar.addNote}
          </button>
        </div>
      ) : null}
      {kind === "block" ? (
        <div className="cluster">
          <button type="button" className="btn" onClick={onNote}>
            {W.bar.addNote}
          </button>
          {toggle(W.bar.bookmark, W.bar.bookmarked)}
        </div>
      ) : null}
      {kind === "plain" ? (
        <div className="cluster">
          {toggle(W.bar.position, W.bar.positionOn)}
        </div>
      ) : null}
    </div>
  );
}

// --- the box of a mark --------------------------------------------------------------------------------

/** A quote listed in Text changed or another language's box, with its Delete. */
export interface BoxQuote {
  id: string;
  quote: string;
  lang: string;
  note: string;
  noteLang: string;
}

/** One group of Text changed or another language: its lead, its quotes, and the way to read them where they were made. */
export interface BoxList {
  key: string;
  lead: string;
  items: BoxQuote[];
  read: { href: string; name: string; lang: string };
}

export interface BoxPick {
  id: string;
  quote: string;
  lang: string;
  /** The paint the highlight wears (`an-m`, with `has-note`). */
  paint: string;
  word: string;
}

export interface MarkBoxProps {
  kind: BoxKind;
  title: string;
  /** Another language's name after the title (`1 highlight in 한국어`), in its own language. */
  titleName?: { name: string; lang: string };
  aria: string;
  where: string;
  whereLang: string;
  note?: string;
  noteLang?: string;
  label?: string;
  labelLang?: string;
  /** A highlight's card: true (on), false (paused), null (never on). */
  card?: boolean | null;
  reviewLine?: string;
  goes?: string;
  delWord?: string;
  editing: boolean;
  draft: string;
  send: Send;
  lists?: BoxList[];
  picks?: BoxPick[];
  fieldId: string;
  hintId: string;
  boxRef: RefObject<HTMLElement | null>;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  labelRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDraft: (text: string) => void;
  onSave: () => void;
  onDeleteNote: () => void;
  onDelete: () => void;
  onReview: () => void;
  /** Save label, with the field's words. */
  onSaveLabel: (label: string) => void;
  /** Delete one of the quotes Text changed or another language lists. */
  onDeleteItem: (id: string) => void;
  /** Open one of the highlights that overlap. */
  onPick: (id: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export function MarkBox({ boxRef, fieldRef, labelRef, ...p }: MarkBoxProps) {
  const noteKind =
    p.kind === "highlight" || p.kind === "new" || p.kind === "section";
  const editing = p.kind === "new" || p.editing;
  const note = p.note ?? "";
  const count = countLine(p.draft.length);
  const failed = p.send === "failed";
  const saving = p.send === "saving";
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) p.onSave();
  };
  const fieldKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!saving) p.onSave();
    }
  };
  const labelSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    p.onSaveLabel(String(new FormData(e.currentTarget).get("label") ?? ""));
  };
  const end =
    (p.kind === "highlight" || p.kind === "section" || p.kind === "bookmark") &&
    !editing;
  return (
    <section
      ref={boxRef}
      className="marks-box"
      role="dialog"
      aria-label={p.aria}
      tabIndex={-1}
      onKeyDown={p.onKeyDown}
    >
      <div className="sheet-head">
        <div className="marks-box-title">
          <h2>
            {p.title}
            {p.titleName ? (
              <span lang={p.titleName.lang}>{p.titleName.name}</span>
            ) : null}
          </h2>
          {p.where ? (
            <span className="meta" lang={p.whereLang}>
              {p.where}
            </span>
          ) : null}
        </div>
        <button type="button" className="btn" onClick={p.onClose}>
          {W.box.close}
        </button>
      </div>
      <div className="marks-box-body">
        {noteKind && !editing ? (
          <>
            {note ? (
              <p className="marks-box-note" lang={p.noteLang}>
                {note}
              </p>
            ) : null}
            <div className="cluster">
              <button type="button" className="btn" onClick={p.onEdit}>
                {note ? W.box.editNote : W.box.addNote}
              </button>
            </div>
          </>
        ) : null}
        {noteKind && editing ? (
          <form className="stack gap-3" onSubmit={save}>
            <div className="field">
              <label className="label" htmlFor={p.fieldId}>
                {W.box.note}
              </label>
              <textarea
                ref={fieldRef}
                className="input marks-box-field"
                id={p.fieldId}
                rows={4}
                maxLength={2000}
                placeholder={W.box.placeholder}
                aria-describedby={p.hintId}
                aria-invalid={failed}
                lang={p.noteLang}
                value={p.draft}
                onChange={(e) => p.onDraft(e.target.value.slice(0, 2000))}
                onKeyDown={fieldKey}
              />
              {failed ? (
                <p className="field-error" role="alert">
                  {W.box.failed}
                </p>
              ) : null}
              <p className="hint" id={p.hintId}>
                {W.box.hint}
              </p>
              <p className="hint marks-box-count">
                <span className="marks-box-count-size" aria-hidden="true">
                  {W.box.countFull}
                </span>
                <span
                  className={count.full ? "is-full" : undefined}
                  aria-live="polite"
                >
                  {count.text}
                </span>
              </p>
            </div>
            <div className="split">
              <div className="cluster">
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-busy={saving}
                >
                  <span className="swap">
                    <span>{W.box.saveNote}</span>
                    <span>{W.box.saving}</span>
                  </span>
                </button>
                <button type="button" className="btn" onClick={p.onCancel}>
                  {W.box.cancel}
                </button>
              </div>
              {p.kind !== "new" && note ? (
                <button
                  type="button"
                  className="btn marks-end"
                  onClick={p.onDeleteNote}
                >
                  {W.box.deleteNote}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
        {p.kind === "bookmark" && !editing ? (
          <>
            {p.label ? (
              <p className="strong" lang={p.labelLang}>
                {p.label}
              </p>
            ) : (
              <p className="dim">{W.box.noLabel}</p>
            )}
            <div className="cluster">
              <button type="button" className="btn" onClick={p.onEdit}>
                {p.label ? W.box.editLabel : W.box.addLabel}
              </button>
            </div>
          </>
        ) : null}
        {p.kind === "bookmark" && editing ? (
          <form className="stack gap-3" onSubmit={labelSave}>
            <div className="field">
              <label className="label" htmlFor={p.fieldId}>
                {W.box.label}
              </label>
              <input
                ref={labelRef}
                className="input"
                id={p.fieldId}
                name="label"
                type="text"
                maxLength={120}
                placeholder={W.box.labelPlaceholder}
                defaultValue={p.label}
              />
            </div>
            <div className="cluster">
              <button type="submit" className="btn btn-primary">
                {W.box.saveLabel}
              </button>
              <button type="button" className="btn" onClick={p.onCancel}>
                {W.box.cancel}
              </button>
            </div>
          </form>
        ) : null}
        {(p.kind === "changed" || p.kind === "other") && p.lists
          ? p.lists.map((g) => (
              <BoxListView key={g.key} list={g} onDelete={p.onDeleteItem} />
            ))
          : null}
        {p.kind === "choose" && p.picks ? (
          <>
            <p>{W.box.overlap}</p>
            <div className="marks-box-items is-picks">
              {p.picks.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="marks-pick"
                  onClick={() => p.onPick(x.id)}
                >
                  <span className="marks-pick-quote" lang={x.lang}>
                    <mark className={x.paint}>{x.quote}</mark>
                  </span>
                  <span className="meta">{x.word}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {p.kind === "highlight" && !editing ? (
          <div className="marks-box-part">
            <label className="check">
              <input
                type="checkbox"
                role="switch"
                checked={p.card === true}
                onChange={p.onReview}
              />
              <span>{W.box.review}</span>
            </label>
            <p className="hint marks-box-under">{p.reviewLine}</p>
          </div>
        ) : null}
        {end ? (
          <div className="marks-box-end">
            {p.goes ? <p>{p.goes}</p> : null}
            <button type="button" className="btn" onClick={p.onDelete}>
              {p.delWord}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BoxListView({
  list,
  onDelete,
}: {
  list: BoxList;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <p>{list.lead}</p>
      <div className="marks-box-items">
        {list.items.map((it) => (
          <div key={it.id} className="marks-box-item">
            <div>
              {it.quote ? (
                <blockquote className="read-quote marks-quote" lang={it.lang}>
                  “{it.quote}”
                </blockquote>
              ) : null}
              {it.note ? (
                <p className="marks-box-note" lang={it.noteLang}>
                  {it.note}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn"
              aria-label={W.box.deleteAria(it.quote.slice(0, 60))}
              onClick={() => onDelete(it.id)}
            >
              {W.box.delete}
            </button>
          </div>
        ))}
      </div>
      <div className="cluster to-end">
        <Link className="link-row" href={list.read.href} prefetch={false}>
          <span>
            {W.box.readPre}
            <span lang={list.read.lang}>{list.read.name}</span>
          </span>
        </Link>
      </div>
    </>
  );
}

// --- the floating parts' box, the notes beside the text -------------------------------------------------

/** A floating part, placed by the layer under what it acts on (`is-box`, `is-save` widen it). */
export function MarksFloat({
  kind,
  floatRef,
  placed,
  style,
  children,
}: {
  kind: "bar" | "box" | "save";
  floatRef: RefObject<HTMLDivElement | null>;
  placed: boolean;
  style: CSSProperties;
  children: ReactNode;
}) {
  const cls =
    kind === "box"
      ? "marks-float is-box"
      : kind === "save"
        ? "marks-float is-save"
        : "marks-float";
  return (
    <div
      ref={floatRef}
      className={cls}
      data-placed={placed ? "1" : "0"}
      style={style}
      {...UI}
    >
      {children}
    </div>
  );
}

/** One note beside the text; the one whose box is open is current. */
export function BesideButton({
  note,
  current,
  onOpen,
}: {
  note: BesideNote;
  current: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className="marks-note"
      aria-current={current ? "true" : "false"}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      <span className="marks-note-kind">{note.kind}</span>
      {note.text || note.endonym ? (
        <span className="marks-note-text" lang={note.lang}>
          {note.text}
          {note.endonym ? (
            <span lang={note.endonym.lang}>{note.endonym.name}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

// --- the bottom slot ------------------------------------------------------------------------------------

export function PlaceBar({
  kind,
  label,
  lang,
  bookmarked,
  onNote,
  onBookmark,
}: {
  kind: "section" | "position";
  label: string;
  lang: string;
  bookmarked: boolean;
  onNote: () => void;
  onBookmark: () => void;
}) {
  const toggle = (off: string, on: string) => (
    <button
      type="button"
      className="link-row"
      aria-pressed={bookmarked}
      data-swap={bookmarked}
      onClick={onBookmark}
    >
      <span className="swap">
        <span>{off}</span>
        <span>{on}</span>
      </span>
    </button>
  );
  return (
    <div
      className="pill marks-place"
      role="group"
      aria-label={
        kind === "position" ? W.place.aria.position : W.place.aria.section
      }
      {...UI}
    >
      {kind === "section" ? (
        <>
          <span className="strong marks-place-label truncate" lang={lang}>
            {label}
          </span>
          <button type="button" className="link-row" onClick={onNote}>
            {W.bar.addNote}
          </button>
          {toggle(W.bar.bookmark, W.bar.bookmarked)}
        </>
      ) : (
        toggle(W.bar.position, W.bar.positionOn)
      )}
    </div>
  );
}

/** The undo line (and a write's failure): one status line, with its one way on. */
export function SlotLine({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="pill" role="status" {...UI}>
      <span>{text}</span>
      {action ? (
        <button type="button" className="link-row" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** Sign in to save, in the bottom slot or under the passage. */
export function SlotSave({
  what,
  signInHref,
  onNotNow,
}: {
  what: SaveWhat;
  signInHref: string;
  onNotNow: () => void;
}) {
  return <Save what={what} signInHref={signInHref} onNotNow={onNotNow} />;
}

// --- the Notes sheet's body -------------------------------------------------------------------------------

export interface SheetRow {
  mark: Mark;
  place: string;
  placeLang: string;
}

export interface NotesBodyProps {
  visitor: boolean;
  text: "chapter" | "document";
  here: SheetRow[];
  other: { lang: string; name: string; rows: SheetRow[] }[];
  lost: SheetRow[];
  /** The rows whose delete is waiting out its ten seconds: each is its own undo line. */
  waiting: ReadonlySet<string>;
  /** All notes in this book; null in a document. */
  allHref: string | null;
  signInHref: string;
  onOpen: (mark: Mark) => void;
  onLabel: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onUndo: (id: string) => void;
  onGone: (id: string) => Promise<unknown>;
  onNotNow: () => void;
  onAll: () => void;
}

export function NotesBody(p: NotesBodyProps) {
  const empty =
    !p.visitor && !p.here.length && !p.other.length && !p.lost.length;
  const row = (r: SheetRow, open: boolean) => (
    <MarkRow
      key={r.mark.id}
      mark={r.mark}
      place={r.place}
      placeLang={r.placeLang}
      phase={p.waiting.has(r.mark.id) ? "deleted" : undefined}
      onOpen={open ? p.onOpen : undefined}
      onLabel={p.onLabel}
      onDelete={p.onDelete}
      onUndo={p.onUndo}
      onGone={p.onGone}
    />
  );
  return (
    <div className="marks-notes-body">
      {p.visitor ? (
        <Save
          what="highlights"
          signInHref={p.signInHref}
          onNotNow={p.onNotNow}
        />
      ) : null}
      {empty ? (
        <p className="block-text">
          {p.text === "document"
            ? W.sheet.empty.document
            : W.sheet.empty.chapter}
        </p>
      ) : null}
      {!p.visitor && p.here.length ? (
        <div
          className="mark-list"
          role="list"
          aria-label={W.sheet.here[p.text]}
        >
          {p.here.map((r) => row(r, true))}
        </div>
      ) : null}
      {!p.visitor
        ? p.other.map((g) => (
            <section key={g.lang} className="section">
              <div className="stack gap-1">
                <h3>
                  {W.sheet.inLang}
                  <span lang={g.lang}>{g.name}</span>
                </h3>
                <p className="dim">{W.sheet.otherLead}</p>
              </div>
              <div
                className="mark-list"
                role="list"
                aria-label={W.sheet.otherAria}
              >
                {g.rows.map((r) => row(r, true))}
              </div>
            </section>
          ))
        : null}
      {!p.visitor && p.lost.length ? (
        <section className="section">
          <div className="stack gap-1">
            <h3>{W.sheet.lost}</h3>
            <p className="dim">{W.sheet.lostLead}</p>
          </div>
          <div className="mark-list" role="list" aria-label={W.sheet.lost}>
            {p.lost.map((r) => row(r, false))}
          </div>
        </section>
      ) : null}
      {!p.visitor && p.allHref ? (
        <div className="cluster">
          <Link
            className="link-row"
            href={p.allHref}
            prefetch={false}
            onClick={p.onAll}
          >
            {W.sheet.all}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** The Notes sheet's count (`9 items`), beside its title in the frame's sheet head. */
export function SheetCount({ count }: { count: string }) {
  return <span className="meta marks-sheet-count">{count}</span>;
}
