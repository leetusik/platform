/**
 * The end of a review session, as pure functions (job 07-listen-review, round 01: frame.md F214, F236, F237, F241,
 * F242; `ReviewEndBody.dc.html`). No React and no `"use client"`: the page, the frame and the tests read them. Which
 * end the queue is on stays `lib/review/model.ts`'s `endKind` (the server's `limit_reached` and counts); this module
 * says what the end shows of it.
 */
import { REVIEW } from "@/content/review";
import type { ContinueView } from "@/lib/review/actions";
import { hourText, whenText, type EndKind } from "@/lib/review/model";
import type { Counts, Profile, QueueMeta } from "@/lib/review/types";

/** The end's kinds, as the board names them (`data-rv-end`). */
export type EndBodyKind = "done" | "limit" | "new-limit" | "paused" | "none";

export interface EndView {
  kind: EndBodyKind;
  /** The state word Done for today: on done and the three limits, not on none (F237, review-end FG1). */
  mark: boolean;
  title: string;
  /** The body, one entry per sentence: the page lays out one span each, so a line breaks between sentences first. */
  sentences: string[];
  /** Change your daily limits → (the three limits). */
  limits: boolean;
  /** Open the library → (none). */
  library: boolean;
}

const BODY_KIND: Record<Exclude<EndKind, "card">, EndBodyKind> = {
  done: "done",
  limit: "limit",
  limitNew: "new-limit",
  paused: "paused",
  empty: "none",
};

/** A body's sentences, split after each full stop as the board does. */
export function sentencesOf(body: string): string[] {
  return body.split(/(?<=\.)\s+/).filter((s) => s !== "");
}

/**
 * What the end shows for the queue's end kind: the words are `REVIEW.end`'s, word for word (F214); the figures are
 * the queue's held counts and the settings in force; the day start is the profile's `day_starts_at_hour` (the
 * product's 04:00, never a Review setting, F242).
 */
export function endView(
  kind: Exclude<EndKind, "card">,
  meta: Pick<QueueMeta, "counts" | "profile" | "next_due_at" | "now" | "day">,
): EndView {
  const E = REVIEW.end;
  const { counts, profile } = meta;
  const hour = hourText(profile.day_starts_at_hour);
  let title: string;
  let body: string;
  if (kind === "limit") {
    title = E.limitTitle(profile.max_reviews_per_day);
    body = E.limitBody(counts.due, counts.new_highlights, hour);
  } else if (kind === "limitNew") {
    title = E.newLimitTitle(profile.new_highlights_per_day);
    body = E.newLimitBody(counts.new_highlights, hour);
  } else if (kind === "paused") {
    title = E.pausedTitle;
    body = E.pausedBody(counts.new_highlights);
  } else if (kind === "empty") {
    title = E.emptyTitle;
    body = E.emptyBody;
  } else {
    title = E.doneTitle;
    body = E.doneBody(
      counts.done_today,
      meta.next_due_at
        ? whenText(meta.next_due_at, meta.now, meta.day.time_zone)
        : null,
    );
  }
  const limits = kind === "limit" || kind === "limitNew" || kind === "paused";
  return {
    kind: BODY_KIND[kind],
    mark: kind !== "empty",
    title,
    sentences: sentencesOf(body),
    limits,
    library: kind === "empty",
  };
}

/**
 * Whether a Review settings save lifts the limit that ended the session (F237, review-end FG6): the reviews limit
 * when Reviews a day is above the done count; the new-highlights limit when New highlights a day is raised; paused
 * when it is above 0. A lifting save brings the held cards back at the first of them; any other save keeps the end.
 */
export function saveLifts(
  kind: EndBodyKind,
  counts: Pick<Counts, "done_today">,
  before: Pick<Profile, "new_highlights_per_day">,
  after: Pick<Profile, "max_reviews_per_day" | "new_highlights_per_day">,
): boolean {
  if (kind === "limit") return after.max_reviews_per_day > counts.done_today;
  if (kind === "new-limit")
    return after.new_highlights_per_day > before.new_highlights_per_day;
  if (kind === "paused") return after.new_highlights_per_day > 0;
  return false;
}

export interface ContView {
  title: string;
  lang: string;
  href: string;
  /** The line's first fact: the book. */
  book: string;
  /** The rest, kept together as one group: `Chapter n of N` and `p% read` (F214, review-end FG5). */
  facts: string[];
}

/**
 * Continue reading's block from the continue read (`loadReviewContinue`, the Library's `continueOf`): the chapter's
 * title, then `{book} · Chapter n of N · p% read` as its facts. Every figure is the read's. An offered next chapter
 * (not started) has no share read; a loose document reads `{project} · Document · p% read`.
 */
export function contView(next: ContinueView): ContView {
  const C = REVIEW.end.continue;
  const facts = [
    next.chapter ? C.chapter(next.chapter.n, next.chapter.total) : C.document,
  ];
  if (next.pct !== null) facts.push(C.read(next.pct));
  return {
    title: next.title,
    lang: next.lang,
    href: next.href,
    book: next.book,
    facts,
  };
}
