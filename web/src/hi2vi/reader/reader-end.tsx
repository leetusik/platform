import type { ReactNode } from "react";

import { READER_FRAME } from "@/content/reader-frame";
import { ReaderChapters, Save, type ChapterRowItem } from "@/hi2vi/library";
import { cx } from "@/lib/cx";

import { endAction, type EndState } from "./model";

/**
 * ReaderEnd (`ReaderEnd.dc.html`, frame.md F64): the end of a chapter or a loose document. A status line
 * with its one button at the end of its row (Mark as finished, or Mark as unread; one `.swap` button that
 * keeps its width), then the way on: **Next chapter** with **Read next** (the page's one primary), or the
 * end of the book with **Back to the book**, or for a document its way back. A visitor's Mark as
 * finished offers Sign in to save in place (`asking`). The book's chapters sit under it when `rows` is
 * given (a finished chapter, the last one; never a book of one chapter).
 *
 * `data-end` marks it as the end the reader's memory watches (`useReading`: reaching it finishes the
 * chapter, leaving it lifts a hold).
 */
export interface ReaderEndProps {
  kind: "chapter" | "document";
  /** null: a member with nowhere to save, so no status line. */
  state: EndState | null;
  asking?: boolean;
  next?: {
    n: number;
    total: number;
    title: ReactNode;
    lede?: ReactNode;
    lang?: string;
  } | null;
  last?: boolean;
  rows?: readonly ChapterRowItem[];
  current?: string;
  /** `5 of 14 finished`, or a visitor's `14 chapters`. */
  progress?: string;
  backLabel?: string;
  signInHref?: string;
  onFinish?: () => void;
  onUnread?: () => void;
  onNext?: () => void;
  onBook?: () => void;
  onLibrary?: () => void;
  onOpen?: (chapterId: string) => void;
  onAsk?: () => void;
  onDismiss?: () => void;
}

export function ReaderEnd({
  kind,
  state,
  asking = false,
  next,
  last = false,
  rows,
  current,
  progress = "",
  backLabel,
  signInHref,
  onFinish,
  onUnread,
  onNext,
  onBook,
  onLibrary,
  onOpen,
  onAsk,
  onDismiss,
}: ReaderEndProps) {
  const t = READER_FRAME.end;
  const doc = kind === "document";
  const [word, line] = state ? t.line[state](kind) : ["", ""];
  const act = state ? endAction(state) : null;
  const press = () => {
    if (act === "unread") onUnread?.();
    else if (act === "sign-in") onAsk?.();
    else onFinish?.();
  };
  return (
    <footer className="read-end" data-end="1">
      {state ? (
        <div className="end-status">
          <p role="status">
            <strong>{word}</strong> {line}
          </p>
          <button
            type="button"
            className="btn"
            data-swap={act === "unread" ? "true" : "false"}
            onClick={press}
          >
            <span className="swap">
              <span>{t.markFinished}</span>
              <span>{t.markUnread}</span>
            </span>
          </button>
        </div>
      ) : null}
      {state === "visitor" && asking ? (
        <Save
          what={doc ? "documents" : "chapters"}
          signInHref={signInHref}
          onNotNow={onDismiss}
        />
      ) : null}
      {!doc && next && !last ? (
        <section className="section">
          <div className="section-head">
            <h2>{t.nextChapter}</h2>
            <span className="meta">
              {READER_FRAME.head.chapterOf(next.n, next.total)}
            </span>
          </div>
          <div className="panel">
            <div className="panel-body end-next">
              <div className="row-stack">
                <p className="end-next-title" lang={next.lang}>
                  {next.title}
                </p>
                {next.lede ? (
                  <p className="dim" lang={next.lang}>
                    {next.lede}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNext}
              >
                {t.readNext}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {!doc && last ? (
        <div className="panel">
          <div className="panel-body end-next">
            <p className="end-next-title">{t.lastLine}</p>
            <button type="button" className="btn btn-primary" onClick={onBook}>
              {t.backToBook}
            </button>
          </div>
        </div>
      ) : null}
      {doc ? (
        <div className={cx("cluster", "to-end")}>
          <button type="button" className="btn" onClick={onLibrary}>
            {backLabel || t.backToLibrary}
          </button>
        </div>
      ) : null}
      {!doc && rows ? (
        <section className="section">
          <div className="section-head">
            <h2>{t.inThisBook}</h2>
            <span className="meta">{progress}</span>
          </div>
          <ReaderChapters rows={rows} current={current} onOpen={onOpen} />
        </section>
      ) : null}
    </footer>
  );
}
