import { chapterN } from "@/lib/listen/book";
import { askScroll, listenActions } from "@/lib/listen/store";
import type { Listen, ListenSeed } from "@/lib/listen/types";
import type { PlayerLead } from "@/lib/listen/view";

/**
 * The opened player's events (`ListenPlayer.dc.html`: on-play, on-skip, on-seek, on-step, on-pick, on-speed,
 * on-follow, on-stop, on-action) and what each asks of the one Listen, through the engine's own presses
 * (`listenActions`): no new send, no new payload (decision 3). No `"use client"`: proved in node.
 */
export type PlayerEvent =
  | { t: "play"; lead: PlayerLead }
  | { t: "skip"; by: number }
  /** Seconds into the chapter (a book) or the document, as the seek bar shows them. */
  | { t: "seek"; at: number }
  | { t: "step"; dir: -1 | 1 }
  | { t: "pick"; id: string }
  | { t: "speed"; v: number }
  | { t: "follow"; on: boolean }
  | { t: "stop" }
  | { t: "action"; what: "update" | "signin" };

/**
 * One press of the player. The seek bar and ±15 work in the chapter heard (a book) or the document, clamped
 * to its length, and land on the stream's own axis (where the chapter starts: the stream position less the
 * position in it). Previous, Next and a row move the Listen to that chapter at 0:00 (`moveTo`); the page under the
 * sheet stays. Sign in leaves for the sign-in page (`signIn`).
 */
export function pressPlayer(
  l: Listen,
  e: PlayerEvent,
  signIn: () => void,
): void {
  const book = l.kind === "book";
  const pos = book ? l.chPos : l.pos;
  const len = (book ? l.chLen : l.len) ?? 0;
  const start = book ? Math.max(0, l.pos - l.chPos) : 0;
  const at = (s: number) => start + Math.max(0, len > 0 ? Math.min(len, s) : s);
  switch (e.t) {
    case "play":
      if (e.lead === "pause") listenActions.pause();
      else if (e.lead === "play") listenActions.play();
      else if (e.lead === "startover") listenActions.startOver();
      else if (e.lead === "retry") listenActions.retry();
      return;
    case "skip":
      listenActions.seek(at(pos + e.by));
      return;
    case "seek":
      listenActions.seek(at(e.at));
      return;
    case "step": {
      const n = chapterN(l, l.ch);
      const to =
        n === null
          ? null
          : (l.book?.chapters.find((c) => c.n === n + e.dir) ?? null);
      if (to) moveTo(l, to.key);
      return;
    }
    case "pick":
      moveTo(l, e.id);
      return;
    case "speed":
      listenActions.setSpeed(e.v);
      return;
    case "follow":
      listenActions.setFollow(e.on);
      return;
    case "stop":
      listenActions.stop();
      return;
    case "action":
      if (e.what === "update") listenActions.update();
      else signIn();
      return;
  }
}

/**
 * P64-3y.F2 — the book's Listen from `chapter`, as pressing Listen on that chapter's own page starts it: the key that
 * page sends (`from_chapter`, and the language only where this Listen's key names one), its title and reader, and
 * no state (the press reads it, as `bookStartOf`'s Continue listening without the server's read). Null off a book.
 */
export function chapterStartOf(l: Listen, chapter: string): ListenSeed | null {
  if (l.kind !== "book" || !l.book || !("book" in l.key)) return null;
  const c = l.book.chapters.find((x) => x.key === chapter);
  if (!c) return null;
  return {
    key: { ...l.key, from_chapter: c.key },
    title: c.title,
    lang: l.lang,
    state: null,
    href: c.href,
    book: l.book,
    chapter: c.key,
  };
}

/**
 * Previous, Next and a row (F211): the Listen moves to that chapter at 0:00 and the page under the sheet stays. On
 * the Listen's stream (its first chapter on), a chapter seek. Before its first chapter the stream has no such
 * chapter, so the book's Listen starts from it through the one start press (`listenActions.start`), exactly as
 * that chapter's own Listen would: the Listen under way ends there, its place saved as any new Listen saves it
 * (`engine.start`), and the kept place is cleared (a Listen that starts clears it, F17).
 */
function moveTo(l: Listen, chapter: string): void {
  const n = chapterN(l, chapter);
  const first = chapterN(l, l.from) ?? 1;
  if (n !== null && n < first) {
    const seed = chapterStartOf(l, chapter);
    if (seed) listenActions.start(seed, 0);
    return;
  }
  listenActions.seekChapter(chapter);
}

/** The page of the Listen's text in the reader: its chapter (a book) or the document. */
export function textHref(l: Listen): string {
  if (l.kind === "book" && l.book) {
    const c = l.book.chapters.find((x) => x.key === l.ch) ?? l.book.chapters[0];
    return c?.href ?? l.href;
  }
  return l.href;
}

/**
 * Go to the text (F211): the reader of the Listen's text, scrolled once to the followed block (or its top).
 * The page of that text takes the ask once (`useFollow`'s `takeScroll`); on that very page it is told now
 * (`here`), else the reader opens there (`push`).
 */
export function goToText(
  l: Listen,
  pathname: string | null,
  nav: { push: (href: string) => void; here: () => void },
): void {
  const href = textHref(l);
  askScroll(l.unit, l.kind === "book" ? l.ch : null);
  let path: string | null = null;
  try {
    path = new URL(href, "http://reader.invalid").pathname;
  } catch {
    path = null;
  }
  if (path !== null && path === pathname) nav.here();
  else nav.push(href);
}
