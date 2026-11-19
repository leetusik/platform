import type { KbListenState } from "@/lib/knowledge/listen";

import type { ListenBook, ListenEntry } from "./types";

// P64-3y.F2 — what the pages already read of a book's audio, kept for the chapters before a Listen's first one.
//
// A book Listen's state starts at its first chapter (B1: the book from `from_chapter` to its end), so a Listen
// started from chapter 2 says nothing of chapter 1. The opened player still draws every chapter (frame.md F211:
// "made ones are buttons that play"), so it takes what the reads this tab already made say of them: the book
// page's load from chapter 1 (`ListenSeed.read`), and every state a Listen of the book read (its seed, start's
// answer and the polls), by book and language (an audio's language is its own: P41-sr.F3). No read is made for
// it. A chapter no read covered stays unknown. The tab's own memory: a full load starts it empty.

const reads = new Map<string, Map<string, ListenEntry>>();

const slotOf = (unit: string, lang: string) => `${unit}\n${lang}`;

/** Keep what a state read says of each chapter's audio (its state and made length), newest read first. */
export function rememberRead(
  unit: string,
  s: KbListenState | null | undefined,
  lang: string,
): void {
  const at = s?.listen?.lang || lang;
  if (!s || !at) return;
  const slot = slotOf(unit, at);
  const m = reads.get(slot) ?? new Map<string, ListenEntry>();
  for (const e of s.entries ?? []) {
    if (!e.chapter) continue;
    m.set(e.chapter, {
      chapter: e.chapter,
      state: e.state,
      len: e.len ?? null,
      part: null,
      left: null,
    });
  }
  reads.set(slot, m);
}

/** The chapters before `from` that a read covered, in the book's order (unknown ones left out). */
export function earlierOf(
  unit: string,
  lang: string,
  book: ListenBook | null,
  from: string | null,
): ListenEntry[] {
  const m = reads.get(slotOf(unit, lang));
  if (!m || !book || from === null) return [];
  const fromN = book.chapters.find((c) => c.key === from)?.n;
  if (fromN === undefined) return [];
  return book.chapters.flatMap((c) => {
    const e = c.n < fromN ? m.get(c.key) : undefined;
    return e ? [e] : [];
  });
}

/** Forget every read (tests). */
export function forgetReads(): void {
  reads.clear();
}
