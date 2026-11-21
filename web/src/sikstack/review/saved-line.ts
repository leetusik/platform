/**
 * The end's saved line, kept for the rest of the review day (job 07-listen-review, round 01: frame.md F241), as pure
 * rules. No React, no storage and no `"use client"`: the frame (`review-frame.tsx`) applies each step, and only
 * `./saved-store` touches the browser's storage.
 *
 * F241: going back to `/review` after the day's session ended opens the same end "with its held counts, its saved
 * line and its Continue reading", and a save that lifts nothing stays on the end with `Settings saved` when it is
 * opened again. The end, its counts and Continue reading come back from the queue read; the saved line is the page's
 * own, so the frame keeps the day's last one in this browser (`localStorage`, the operator's decision 3: the
 * server's data and APIs stay):
 *
 *  - **what is kept:** the line's two parts (its word, `Saved` or `Settings saved`, and the rest after it), with the
 *    review day it was said on (the queue's `day.start`); never a card's text or an answer;
 *  - **whose:** one entry per account (the signed-in user's id names the key), so another account on the same
 *    browser never sees it; with no account known nothing is kept or read;
 *  - **when it is stored:** whenever an end shows with a saved line;
 *  - **when it is shown:** when `/review` opens on an end with no saved line yet, and the kept line is this
 *    account's and this review day's (yesterday's is dropped, never shown);
 *  - **when it is dropped:** when the session has cards again (a lifting save, a new day's cards).
 */
import { REVIEW } from "@/content/review";
import type { EndKind } from "@/lib/review/model";

import type { Saved } from "./due-head";

/** The browser key prefix; the account's id completes it. */
export const KEPT_PREFIX = "sikstack.review.saved.";

/** The longest `rest` taken back from storage (the longest line the page says is well under it). */
const REST_MAX = 160;

/** The signed-in account's id, or null when the identity does not carry one (then nothing is kept). */
export function accountOf(
  identity: { user?: { id?: unknown } | null } | null | undefined,
): string | null {
  const id = identity?.user?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

/** The storage key of an account's kept line. */
export function keptKey(account: string): string {
  return KEPT_PREFIX + account;
}

/** What is stored: the review day and the line's two parts, nothing else. */
export function keptValue(day: string, saved: Saved): string {
  return JSON.stringify({ day, word: saved.word, rest: saved.rest });
}

function isEnd(kind: EndKind | null): boolean {
  return kind !== null && kind !== "card";
}

export type KeepStep =
  | { t: "store"; key: string; value: string }
  | { t: "drop"; key: string }
  | { t: "none" };

/**
 * What the frame does with the kept line after a render: store the line an end shows; drop it once the session has
 * cards again; otherwise (loading, failed, an end with no line yet, no account) leave it.
 */
export function keepStep(args: {
  account: string | null;
  kind: EndKind | null;
  saved: Saved | null;
  day: string;
}): KeepStep {
  const { account, kind, saved, day } = args;
  if (account === null) return { t: "none" };
  if (kind === "card") return { t: "drop", key: keptKey(account) };
  if (isEnd(kind) && saved !== null)
    return { t: "store", key: keptKey(account), value: keptValue(day, saved) };
  return { t: "none" };
}

/** The key to read back, when the page is on an end with no saved line yet; null otherwise. */
export function restoreKey(args: {
  account: string | null;
  kind: EndKind | null;
  saved: Saved | null;
}): string | null {
  const { account, kind, saved } = args;
  if (account === null || !isEnd(kind) || saved !== null) return null;
  return keptKey(account);
}

/**
 * The line read back for this review day: shown only when it is this day's and says one of the page's own words; a
 * line from another day, or anything not a kept line, is dropped and never shown.
 */
export function restored(
  raw: string | null,
  day: string,
): { line: Saved | null; drop: boolean } {
  if (raw === null) return { line: null, drop: false };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { line: null, drop: true };
  }
  if (typeof v !== "object" || v === null) return { line: null, drop: true };
  const o = v as Record<string, unknown>;
  const words: readonly string[] = [
    REVIEW.head.saved,
    REVIEW.head.settingsSaved,
  ];
  if (
    o.day !== day ||
    typeof o.word !== "string" ||
    !words.includes(o.word) ||
    typeof o.rest !== "string" ||
    o.rest.length > REST_MAX
  )
    return { line: null, drop: true };
  return { line: { word: o.word, rest: o.rest }, drop: false };
}
