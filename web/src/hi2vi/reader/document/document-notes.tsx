"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { READER_DOCUMENT } from "@/content/reader-document";
import { MarkRow, Save, type Mark } from "@/hi2vi/library";
import {
  bookmarkWire,
  labelWire,
  cleanLabel,
  removeBookmarkWire,
  undoClock,
  type UndoClock,
  type Wire,
} from "@/hi2vi/reader/marks";
import {
  editBookmark,
  removeBookmark,
  saveBookmark,
  type BookmarkResult,
} from "@/lib/reader/actions";
import { progressPercent } from "@/lib/reader/chrome";
import { snippetOf } from "@/lib/reader/note-list";
import { newId } from "@/lib/reader/notes";
import type { ReaderWrite } from "@/lib/reader/types";

import {
  hereAction,
  hereMarked,
  markOf,
  markPlace,
  readingOrder,
  type DocMark,
  type Here,
} from "./model";

/**
 * DocumentNotes (`DocumentNotes.dc.html`; `## Build` § Page: document): the body of a loose document's Notes
 * sheet. A loose document takes bookmarks only: no highlight, no note. A `.split` row with the count and one
 * button named for what it makes (**Bookmark this position**; **Bookmarked here** at the same width when that
 * place already has one), then the `MarkRow` list in reading order, or the empty line; a visitor's button
 * offers Sign in to save in place.
 */
export interface DocumentNotesProps {
  count: string;
  action: string;
  hereMarked: boolean;
  asking: boolean;
  rows: readonly { mark: Mark; place: string }[];
  /** The text's language, the language a place is read in. */
  placeLang?: string;
  signInHref: string;
  onBookmark: () => void;
  onOpen: (mark: Mark) => void;
  onLabel: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onUndo: (id: string) => void;
  onGone: (id: string) => Promise<unknown> | void;
  onDismiss: () => void;
}

export function DocumentNotes({
  count,
  action,
  hereMarked: marked,
  asking,
  rows,
  placeLang,
  signInHref,
  onBookmark,
  onOpen,
  onLabel,
  onDelete,
  onUndo,
  onGone,
  onDismiss,
}: DocumentNotesProps) {
  return (
    <div className="stack gap-3">
      <div className="split">
        <span className="meta" role="status">
          {count}
        </span>
        <button
          type="button"
          className="btn"
          data-swap={marked ? "true" : "false"}
          aria-disabled={marked ? "true" : "false"}
          onClick={() => {
            if (!marked) onBookmark();
          }}
        >
          <span className="swap">
            <span>{action}</span>
            <span>{READER_DOCUMENT.notes.here}</span>
          </span>
        </button>
      </div>
      {asking ? (
        <Save what="bookmarks" signInHref={signInHref} onNotNow={onDismiss} />
      ) : null}
      {rows.length > 0 ? (
        <div className="mark-list" role="list">
          {rows.map((r) => (
            <MarkRow
              key={r.mark.id}
              mark={r.mark}
              place={r.place}
              placeLang={placeLang}
              onOpen={onOpen}
              onLabel={onLabel}
              onDelete={onDelete}
              onUndo={onUndo}
              onGone={onGone}
            />
          ))}
        </div>
      ) : null}
      {rows.length === 0 && !asking ? (
        <p className="block-text">{READER_DOCUMENT.notes.empty(action)}</p>
      ) : null}
    </div>
  );
}

/** A bookmark's write, through the existing server actions (the layer's own mapping, `annotations.tsx`). */
export function runBookmarkWire(w: Wire): Promise<BookmarkResult> {
  switch (w.op) {
    case "bm-save":
      return saveBookmark(w.input);
    case "bm-edit":
      return editBookmark(w.input);
    case "bm-remove":
      return removeBookmark(w.input);
    default:
      // A loose Markdown document sends no highlight or note.
      return Promise.resolve({ ok: false, status: 0 });
  }
}

/** The place on screen: the fraction read and the first text under the top bar (the layer's `placeNow`). */
function placeNow(root: HTMLElement | null): {
  fraction: number;
  snippet: string;
} {
  const doc = document.documentElement;
  const pct = progressPercent(
    window.scrollY,
    doc.scrollHeight - window.innerHeight,
  );
  const line =
    (root?.querySelector(".bar-wrap > .bar")?.getBoundingClientRect().bottom ??
      59) + 8;
  let snippet = "";
  const all = root?.querySelectorAll<HTMLElement>(
    "[data-reader-article] :is(p, li, h2, h3, h4, pre, blockquote)",
  );
  if (all)
    for (const el of Array.from(all)) {
      if (
        el.getBoundingClientRect().top >= line - 4 &&
        el.textContent?.trim()
      ) {
        snippet = el.textContent;
        break;
      }
    }
  return { fraction: pct / 100, snippet: snippetOf(snippet) };
}

/**
 * A Markdown document's bookmarks, held by the page (the Notes sheet's body): made at the place on screen,
 * labelled, removed with the row's undo line (`marks/undo.ts`: sent when its ten seconds pass, or when the
 * sheet closes, or on leaving), every write through `marks/wire.ts`'s payloads and the existing actions.
 */
export function DocumentBookmarks({
  open,
  initial,
  member,
  write,
  version,
  lang,
  rootRef,
  sectionTitle,
  sectionOrder,
  signInHref,
  onClose,
  send = runBookmarkWire,
}: {
  /** The Notes sheet is open: the place on screen is read when it opens. */
  open: boolean;
  initial: readonly DocMark[];
  member: boolean;
  write: ReaderWrite | null;
  version: number;
  lang: string;
  rootRef: { current: HTMLElement | null };
  sectionTitle: (id: string) => string | null;
  sectionOrder: readonly string[];
  signInHref: string;
  /** Close the sheet (a row's first line goes to the place). */
  onClose: () => void;
  send?: (w: Wire) => Promise<BookmarkResult>;
}) {
  const [marks, setMarks] = useState<DocMark[]>(() => [...initial]);
  const [pending, setPending] = useState<Record<string, true>>({});
  const [here, setHere] = useState<Here>({
    kind: "position",
    section: null,
    fraction: 0,
  });
  const [asking, setAsking] = useState(false);
  const clock = useRef<UndoClock | null>(null);
  if (clock.current === null) clock.current = undoClock();
  const sent = useRef(new Map<string, Promise<void>>());

  // The place on screen, read as the sheet opens (the page does not scroll under an open sheet).
  useEffect(() => {
    if (!open) return;
    const p = placeNow(rootRef.current);
    setHere({ kind: "position", section: null, fraction: p.fraction });
    setAsking(false);
  }, [open, rootRef]);

  // A removed bookmark is gone when the sheet closes, and on leaving the page.
  useEffect(() => {
    if (!open) clock.current?.flush();
  }, [open]);
  useEffect(() => () => clock.current?.flush(), []);

  const live = useMemo(
    () => marks.filter((m) => !pending[m.id]),
    [marks, pending],
  );
  const rows = useMemo(
    () =>
      readingOrder(marks, sectionOrder).map((m) => ({
        mark: markOf(m),
        place: markPlace(m, sectionTitle),
      })),
    [marks, sectionOrder, sectionTitle],
  );

  const bookmark = useCallback(() => {
    if (!member) {
      setAsking(true);
      return;
    }
    if (!write) return;
    const p = placeNow(rootRef.current);
    const id = newId();
    const made: DocMark = {
      id,
      block: null,
      at: null,
      fraction: p.fraction,
      label: "",
      pos: true,
      lang,
      version,
    };
    setMarks((list) => [...list, made]);
    setHere({ kind: "position", section: null, fraction: p.fraction });
    void send(
      bookmarkWire({
        write,
        id,
        version,
        anchor: { fraction: p.fraction },
        snippet: p.snippet,
      }),
    ).then((r) => {
      if (!r.ok) setMarks((list) => list.filter((m) => m.id !== id));
    });
  }, [member, write, rootRef, lang, version, send]);

  const label = useCallback(
    (id: string, text: string) => {
      const before = marks.find((m) => m.id === id)?.label ?? "";
      const clean = cleanLabel(text);
      if (clean === before) return;
      const put = (value: string) =>
        setMarks((list) =>
          list.map((m) => (m.id === id ? { ...m, label: value } : m)),
        );
      put(clean);
      void send(labelWire(id, clean)).then((r) => {
        if (!r.ok) put(before);
      });
    },
    [marks, send],
  );

  const remove = useCallback(
    (id: string) => {
      setPending((p) => ({ ...p, [id]: true }));
      clock.current?.start(id, () => {
        const done = send(removeBookmarkWire(id)).then((r) => {
          if (!r.ok) throw new Error("not removed");
          setMarks((list) => list.filter((m) => m.id !== id));
          setPending((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        });
        sent.current.set(id, done);
        done.catch(() => {});
      });
    },
    [send],
  );

  const undo = useCallback((id: string) => {
    clock.current?.undo(id);
    setPending((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, []);

  const gone = useCallback((id: string) => {
    clock.current?.fire(id);
    return sent.current.get(id);
  }, []);

  const openMark = useCallback(
    (m: Mark) => {
      const mark = marks.find((x) => x.id === m.id);
      onClose();
      if (!mark) return;
      window.dispatchEvent(new Event("reader:quiet"));
      if (!mark.pos && mark.at) {
        const el = document.getElementById(mark.at);
        if (el && rootRef.current?.contains(el)) {
          el.scrollIntoView({ block: "start", behavior: "instant" });
          return;
        }
      }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({
        top: Math.max(0, (mark.fraction ?? 0) * max),
        behavior: "instant",
      });
    },
    [marks, onClose, rootRef],
  );

  return (
    <DocumentNotes
      count={READER_DOCUMENT.notes.count(live.length)}
      action={hereAction(here)}
      hereMarked={member && hereMarked(here, live)}
      asking={asking}
      rows={rows}
      placeLang={lang}
      signInHref={signInHref}
      onBookmark={bookmark}
      onOpen={openMark}
      onLabel={label}
      onDelete={remove}
      onUndo={undo}
      onGone={gone}
      onDismiss={() => setAsking(false)}
    />
  );
}
