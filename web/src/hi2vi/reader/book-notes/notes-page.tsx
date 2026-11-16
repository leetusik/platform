"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { BOOK_NOTES } from "@/content/book-notes";
import { Choice, MarkRow, type Mark } from "@/hi2vi/library";
import type { Wire } from "@/hi2vi/reader/marks/wire";
import {
  editBookmark,
  removeAnnotation,
  removeBookmark,
} from "@/lib/reader/actions";

import {
  NOTES_FILTERS,
  notesChapters,
  notesChoose,
  notesHead,
  notesPhase,
  notesStore,
  sendOnLeaving,
  type NotesFilter,
  type NotesView,
} from "./model";
import { NotesChoiceWaiting, NotesFailed, NotesHead } from "./notes-parts";

/** The three writes this page makes, through the existing actions with their payloads unchanged. */
const sendWire = (w: Wire): Promise<{ ok: boolean }> => {
  switch (w.op) {
    case "remove":
      return removeAnnotation(w.input);
    case "bm-remove":
      return removeBookmark(w.input);
    case "bm-edit":
      return editBookmark(w.input);
    default:
      return Promise.resolve({ ok: false });
  }
};

/**
 * Notes in this book, loaded (`BookNotes.dc.html`; `## Build` § Page: book-notes): the head (`Notes in this
 * book`, the book's title, the count, `N unanchored`), the Show choice with each choice's count, then the
 * chapters that hold a mark in the choice, each a panel of MarkRows in reading order.
 *
 * A row opens its chapter at the mark (in the mark's language when it was made in another); a bookmark's label
 * is saved in place; a delete leaves every count at once and its row is its undo line for ten seconds. Changing
 * the choice or leaving the page sends every delete still waiting (`visibilitychange` to hidden, `pagehide`, and
 * the page going away on a client navigation). `rows: null`: the marks did not load; the head and the book's
 * title stand, the choices are disabled, and Try again fetches the page again.
 */
export function BookNotesBody({ view }: { view: NotesView }) {
  const router = useRouter();
  const [store] = useState(() => notesStore(sendWire));
  const marks = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [filter, setFilter] = useState<NotesFilter>("all");

  useEffect(() => sendOnLeaving(store, document, window), [store]);

  const rows = useMemo(() => view.rows ?? [], [view.rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const head = notesHead(rows, filter, marks);
  const chapters = notesChapters(view.chapters, rows, filter, marks);

  const pick = (next: NotesFilter) => setFilter(notesChoose(store, next));
  const open = useCallback(
    (m: Mark) => {
      const href = byId.get(m.id)?.href;
      if (!href) return;
      store.flush();
      router.push(href);
    },
    [byId, router, store],
  );

  if (view.rows === null)
    return (
      <>
        <NotesHead bookTitle={view.bookTitle}>
          <NotesChoiceWaiting />
        </NotesHead>
        <NotesFailed onRetry={() => router.refresh()} />
      </>
    );

  return (
    <>
      <NotesHead
        bookTitle={view.bookTitle}
        count={head.count}
        unanchored={head.unanchored}
      >
        <Choice
          className="bn-filter"
          label={BOOK_NOTES.show}
          value={filter}
          onChange={pick}
          options={NOTES_FILTERS.map((f) => ({
            value: f,
            content: BOOK_NOTES.choiceCount(
              BOOK_NOTES.choice[f],
              head.counts[f],
            ),
          }))}
        />
      </NotesHead>
      {chapters.map((c) => {
        const headId = `bn-ch-${c.key}`;
        return (
          <section key={c.key} className="panel" aria-labelledby={headId}>
            <div className="panel-head">
              <h2 className="bn-chapter" id={headId}>
                <span className="bn-chapter-n">{BOOK_NOTES.chapterN(c.n)}</span>{" "}
                <span lang={c.lang}>{c.title}</span>
              </h2>
            </div>
            <div className="panel-body has-rule bn-rows">
              <div className="mark-list" role="list">
                {c.rows.map((r) => (
                  <MarkRow
                    key={`${filter}:${r.id}`}
                    mark={r.mark}
                    place={r.place}
                    placeLang={r.placeLang}
                    phase={notesPhase(r.id, marks)}
                    onOpen={open}
                    onLabel={(id, text) => {
                      const row = byId.get(id);
                      if (row) void store.label(row, text);
                    }}
                    onDelete={(id) => {
                      const row = byId.get(id);
                      if (row) store.remove(row);
                    }}
                    onUndo={(id) => store.undo(id)}
                    onGone={(id) => store.gone(id)}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}
      {chapters.length === 0 ? (
        <section className="panel">
          <div className="block">
            <p className="block-text">{BOOK_NOTES.empty[filter]}</p>
          </div>
        </section>
      ) : null}
    </>
  );
}
