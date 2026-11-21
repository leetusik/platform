"use client";

import { useRef } from "react";

import { READING_DATA, type ReadingDataScope } from "@/content/library-frame";
import { Dialog, DialogActions } from "@/sikstack/frame";
import { Button } from "@/sikstack/ui";

/**
 * ReadingData (`ReadingData.dc.html`, frame.md F69, F98): Your reading data, a quiet panel with one
 * button, **Clear all reading data** (the library) or **Clear this book’s reading data** (a book, with
 * its `subject`, `chapters` and `marks`). It asks first, in F3's dialog (`Dialog`): what is removed,
 * listed, what is kept, **Cancel** first (it has the focus) and the danger button last, whose pending
 * label `Clearing…` keeps its width while nothing else can be pressed. Then the cleared line, or the
 * failed one with the button back.
 *
 * The page holds the phase (`rest | asking | clearing | cleared | failed`) and hears each move as
 * `onPhase`: the trigger asks, Cancel and Escape go back to rest, the danger button moves to
 * `clearing`, and the page then clears and sets `cleared` or `failed`.
 */
export type ReadingDataPhase =
  "rest" | "asking" | "clearing" | "cleared" | "failed";

export interface ReadingDataProps {
  scope?: ReadingDataScope;
  /** The book's title (scope `book`). */
  subject?: string;
  /** The book's chapters, for its line of the list. */
  chapters?: number;
  /** The book's marks; none leaves its line out (F98). */
  marks?: number;
  phase: ReadingDataPhase;
  onPhase: (phase: ReadingDataPhase) => void;
}

/** What the confirm lists as removed. */
export function readingDataItems(
  scope: ReadingDataScope,
  chapters: number,
  marks: number,
): string[] {
  const t = READING_DATA.items;
  if (scope === "all") return [...t.all];
  return [
    t.bookChapters(chapters),
    marks === 0 ? "" : t.bookMarks(marks),
    t.bookQuiz,
  ].filter(Boolean);
}

export function ReadingData({
  scope = "all",
  subject = "",
  chapters = 0,
  marks = 0,
  phase,
  onPhase,
}: ReadingDataProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const t = READING_DATA;
  const busy = phase === "clearing";
  const question = t.question[scope];

  return (
    <section className="panel reading-data">
      <div className="panel-head">
        <h2>{t.heading}</h2>
        <button
          type="button"
          className="btn btn-wraps"
          disabled={busy}
          onClick={() => onPhase("asking")}
        >
          {t.trigger[scope]}
        </button>
      </div>
      {phase === "cleared" && (
        <div className="panel-body has-rule">
          <p role="status">{t.cleared[scope]}</p>
        </div>
      )}
      {phase === "failed" && (
        <div className="panel-body has-rule">
          <p className="notice notice-danger" role="alert">
            {t.failed[scope]}
          </p>
        </div>
      )}
      {(phase === "asking" || busy) && (
        <Dialog
          label={question}
          initialFocus={cancel}
          locked={busy}
          onClose={() => {
            if (phase === "asking") onPhase("rest");
          }}
        >
          <h2>{question}</h2>
          <p>{scope === "book" ? t.removes.book(subject) : t.removes.all}</p>
          <ul className="rd-list">
            {readingDataItems(scope, chapters, marks).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p>{t.keeps[scope]}</p>
          <DialogActions>
            <Button
              ref={cancel}
              disabled={busy}
              onClick={() => {
                if (!busy) onPhase("rest");
              }}
            >
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              busy={busy}
              busyLabel={t.clearing}
              onClick={() => {
                if (!busy) onPhase("clearing");
              }}
            >
              {t.confirm[scope]}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </section>
  );
}
