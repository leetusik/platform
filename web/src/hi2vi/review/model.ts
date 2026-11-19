/**
 * Review's focused frame, as pure functions (job 07-listen-review, round 01: frame.md F201, F215, F219, F220;
 * `Focus.dc.html`, `DueHead.dc.html`, `Schedule.dc.html`). No React and no `"use client"`: the page, its loading
 * file and the tests read them. The queue's rules stay `lib/review/model.ts`'s; this module only says what the
 * frame shows of them.
 */
import { REVIEW } from "@/content/review";
import {
  readerCookieString,
  type ReaderSettings,
  type TextSize,
  type ThemeChoice,
} from "@/lib/reader-cookie";
import {
  booksNote,
  endKind,
  isNewHighlight,
  progressPct,
  settingsErrors,
  type EndKind,
  type SettingsDraft,
} from "@/lib/review/model";
import type {
  BookRow,
  Counts,
  QueueMeta,
  ReviewCard,
} from "@/lib/review/types";

/** Where the queue's read stands: shown, being read, or failed. */
export type LoadStatus = "ready" | "loading" | "failed";

/** The most cards one queue read returns (`lib/review/actions.ts`); a longer day is read again. */
export const LOADED = 50;

// --- Focus: the bar's 3 px line (F201, F227.1) -------------------------------------------------------

/** done ÷ (done + due + new), a whole per cent; 0 while the queue loads or has failed (the bar stays whole). */
export function focusProgress(status: LoadStatus, counts: Counts): number {
  return status === "ready" ? progressPct(counts) : 0;
}

// --- DueHead (F215) ----------------------------------------------------------------------------------

/** One row of By book: a book (its title, `platform · book`), or the documents not in a book. */
export interface DueRow {
  key: string;
  title: string;
  /** `platform · book`; "" on the documents' row. */
  sub: string;
  dueText: string;
  newText: string;
}

/**
 * By book's rows from the queue's `by_book`: each book in the payload's order, then one row for every document
 * not in a book (the payload groups those by project; the head draws them as one row, F213, F215).
 */
export function dueRows(byBook: readonly BookRow[]): DueRow[] {
  const H = REVIEW.head;
  const rows: DueRow[] = [];
  const loose = { rows: 0, due: 0, new: 0 };
  for (const row of byBook) {
    if (row.book === null) {
      loose.rows += 1;
      loose.due += row.due;
      loose.new += row.new;
      continue;
    }
    rows.push({
      key: `${row.org}/${row.project}/${row.book}`,
      title: row.book_title || row.project,
      sub: H.bookSub(row.project),
      dueText: H.dueN(row.due),
      newText: H.newN(row.new),
    });
  }
  if (loose.rows > 0)
    rows.push({
      key: "loose",
      title: H.looseSub,
      sub: "",
      dueText: H.dueN(loose.due),
      newText: H.newN(loose.new),
    });
  return rows;
}

export interface DueHeadView {
  /** The screen the queue is on (`lib/review/model.ts` `endKind`); null while loading or failed. */
  kind: EndKind | null;
  counts: { due: number; nw: number; done: number };
  rows: DueRow[];
  /** By book's one note: what the rows are, or why cards wait. */
  note: string;
}

/** What the head shows of the queue: its three counts, By book's rows and the one note for the screen it is on. */
export function dueHeadOf(args: {
  status: LoadStatus;
  meta: QueueMeta;
  queue: readonly ReviewCard[];
}): DueHeadView {
  const { status, meta, queue } = args;
  const kind =
    status === "ready"
      ? endKind({
          cards: queue.length,
          counts: meta.counts,
          limit_reached: meta.limit_reached,
          profile: meta.profile,
          next_due_at: meta.next_due_at,
        })
      : null;
  const newInQueue = queue.filter(isNewHighlight).length;
  const heldNew =
    kind === "card" &&
    meta.limit_reached === null &&
    queue.length < LOADED &&
    meta.counts.new_highlights > newInQueue;
  const rows = dueRows(meta.counts.by_book);
  return {
    kind,
    counts: {
      due: meta.counts.due,
      nw: meta.counts.new_highlights,
      done: meta.counts.done_today,
    },
    rows,
    note:
      rows.length === 0
        ? REVIEW.head.notes.none
        : booksNote({ kind: kind ?? "card", profile: meta.profile, heldNew }),
  };
}

// --- Schedule (F219) ---------------------------------------------------------------------------------

/** The settings form's phase (`Schedule.dc.html`). */
export type SchedulePhase = "rest" | "invalid" | "saving" | "failed";

/** The body of `PATCH /app/reader/profile` (`saveReviewSettings`), as it has always been sent. */
export interface SettingsInput {
  time_zone: string;
  max_reviews_per_day: number;
  new_highlights_per_day: number;
}

export type SettingsPlan =
  | { ok: true; input: SettingsInput }
  | { ok: false; errors: { max: boolean; maxNew: boolean } };

/** Save settings: the payload to send, or the fields that refuse it (nothing is sent then). */
export function settingsPlan(draft: SettingsDraft): SettingsPlan {
  const errors = settingsErrors(draft);
  if (errors.max || errors.maxNew) return { ok: false, errors };
  return {
    ok: true,
    input: {
      time_zone: draft.tz,
      max_reviews_per_day: Number(draft.max.trim()),
      new_highlights_per_day: Number(draft.maxNew.trim()),
    },
  };
}

// --- Display (F220): one setting with the reader -----------------------------------------------------

/** The focused frame's `data-scheme`: Light, Dark or Sepia; System sets none, so the device's scheme holds. */
export function frameScheme(
  theme: ThemeChoice,
): "light" | "dark" | "sepia" | undefined {
  return theme === "system" ? undefined : theme;
}

/**
 * A change in Display: the new settings and the `kb_reader` cookie that keeps them, the reader's own (so a text
 * size or theme set on Review is the reader's too, and back). The library's grouping rides along untouched.
 */
export function withDisplay(
  settings: ReaderSettings,
  change: { size?: TextSize; theme?: ThemeChoice },
  secure: boolean,
): { settings: ReaderSettings; cookie: string } {
  const next = { ...settings, ...change };
  return { settings: next, cookie: readerCookieString(next, secure) };
}
