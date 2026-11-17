// Project home's pure parts (job 01, round 03-instrument, `ProjectHome*.dc.html`): what each panel
// shows, from the reads and actions the page already had. No React, no `server-only`, so the server
// page, the client islands and the Node tests all import it.

import { MINT_CREDENTIAL_ERRORS, PROJECT_HOME } from "@/content/project";
import type { KeyRow, MintResult, RevokeResult } from "@/hi2vi/frame";
import type { FeedbackValue } from "@/lib/feedback/format";
import { langAttr } from "@/lib/feedback/lang";
import { feedbackItemHref } from "@/lib/feedback/place";
import type { Feedback } from "@/lib/feedback/types";
import { credentialStatus } from "@/lib/knowledge/credential-status";
import type { KbCredential, KbOrgLibrary } from "@/lib/knowledge/types";
import { secondTitleLang } from "@/lib/library/lists";
import { bookHref, orgSegment, readerHref } from "@/lib/reader-href";
import { num, plural, when, type FormatOptions } from "@/lib/format";
import {
  DEFAULT_TIME_ZONE,
  viewerTimeZone,
  type CookieReader,
} from "@/lib/time-zone";

import type {
  MintCredentialState,
  RevokeCredentialState,
  SetVisibilityState,
} from "./actions";

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * The request's clock, read once, and the viewer's zone from the cookie (UTC until it is known: the
 * operator's decision 5, D254-wv), for every formatter on the page, server and browser alike.
 */
export function projectHomeFormat(
  store: CookieReader,
  now: number = Date.now(),
): FormatOptions {
  return { now, timeZone: viewerTimeZone(store) };
}

/** Today's calendar date (`YYYY-MM-DD`) in the page's zone: Trend's last day when it has none. */
export function todayIn(format: FormatOptions): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: format.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(format.now ?? Date.now());
}

// ── Not found ───────────────────────────────────────────────────────────────

/**
 * The statuses of the project read that render the page's Not found: 404 (missing, or another org's:
 * the API answers 404, never 403, so ids cannot be probed), 400 and 422 (a malformed id). Anything
 * else is an outage and is rethrown.
 */
export function isMissingProjectStatus(status: number): boolean {
  return status === 404 || status === 400 || status === 422;
}

// ── Workspace (operator D1) ─────────────────────────────────────────────────

/**
 * The Workspace panel as it ships until the sync phase: the signed empty state's first sentence and
 * the `Coming` badge on its head. No rows, no count, no foot (the board drops a part's count and foot
 * when it is empty), no loading form: there is no workspace data yet.
 */
export function workspaceWords(): {
  heading: string;
  badge: string;
  empty: string;
} {
  const w = PROJECT_HOME.workspace;
  return { heading: w.heading, badge: w.coming, empty: w.empty };
}

// ── Library ─────────────────────────────────────────────────────────────────

/** The board's five newest documents. */
export const LIBRARY_SHOWN = 5;

export interface LibraryRow {
  key: string;
  title: string;
  lang: string;
  book: boolean;
  /** A book's second title (`.meta` under the title); `null` when the read carries none. */
  sub: string | null;
  /** The second title's `lang`: the manifest's `sub_lang`, else `ko` for a Korean one, else unset. */
  subLang: string | undefined;
  /** `14 chapters` for a book, `6 min` for a document; `null` when the read carries no length. */
  length: string | null;
  /** `YYYY-MM-DD`, or `null` when unknown. */
  date: string | null;
  href: string;
}

const CALENDAR = /^\d{4}-\d{2}-\d{2}/;

/** A document's reading time as the board draws it (`6 min`), or `null` when the read carries none. */
export function readingTime(minutes: number | null | undefined): string | null {
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 1
    ? PROJECT_HOME.library.minutes(Math.round(minutes))
    : null;
}

/** A book's second title, only when the read carries one. */
function secondTitle(sub: string | null | undefined): string | null {
  const text = sub?.trim();
  return text ? text : null;
}

/** A book's date: its newest chapter's, read off the variant's document stem (`<date>-<slug>`). */
export function bookDate(book: KbOrgLibrary["books"][number]): string | null {
  let newest: string | null = null;
  for (const chapter of book.chapters) {
    for (const variant of chapter.variants) {
      const m = CALENDAR.exec(variant.doc);
      if (m && (newest === null || m[0] > newest)) newest = m[0];
    }
  }
  return newest;
}

/**
 * The Library panel's rows: the project's books and loose documents from the org library listing,
 * newest first, at most five. A book carries its `Book` badge, its chapter count as its length and its
 * second title when the read has one; a document its reading time (D248-j7). Rows carry no `?from=`:
 * the way back (F324) names a list, and project home is not one.
 */
export function libraryRows(
  listing: KbOrgLibrary,
  projectName: string,
): LibraryRow[] {
  const org = orgSegment({ id: listing.org.id, slug: listing.org.slug });
  const books: LibraryRow[] = listing.books
    .filter((b) => b.project === projectName)
    .map((b) => ({
      key: `book:${b.slug}`,
      title: b.title,
      lang: "en",
      book: true,
      sub: secondTitle(b.sub),
      subLang: secondTitleLang(b.sub, b.sub_lang),
      length: plural(b.chapters.length, PROJECT_HOME.library.chapter),
      date: bookDate(b),
      href: bookHref({ org, project: b.project, book: b.slug }),
    }));
  const docs: LibraryRow[] = listing.documents
    .filter((d) => d.project === projectName)
    .map((d) => ({
      key: `doc:${d.id}`,
      title: d.title,
      lang: d.lang || "en",
      book: false,
      sub: null,
      subLang: undefined,
      length: readingTime(d.reading_minutes),
      date: CALENDAR.test(d.date) ? d.date.slice(0, 10) : null,
      href: readerHref({
        kind: "document",
        id: d.id,
        canonicalPath: d.canonical_path,
      }),
    }));
  return newestRows([...books, ...docs]);
}

/** Newest first (an unknown date last), then by title; the first five. */
export function newestRows(rows: readonly LibraryRow[]): LibraryRow[] {
  return [...rows]
    .sort((a, b) => {
      if (a.date !== b.date) {
        if (a.date === null) return 1;
        if (b.date === null) return -1;
        return a.date < b.date ? 1 : -1;
      }
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    })
    .slice(0, LIBRARY_SHOWN);
}

/** The head's count, the project's active total; none at 0 (an empty part drops its count). */
export function libraryCount(total: number): string | null {
  return total > 0 ? plural(total, PROJECT_HOME.library.one) : null;
}

// ── Feedback (D247-4x; operator D3) ─────────────────────────────────────────

/** The board's five newest messages. */
export const FEEDBACK_SHOWN = 5;

/** A half-open window of instants, `start <= ingested_at < end`, as ISO strings in UTC. */
export interface FeedbackWindow {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

/**
 * The zone's offset from UTC at `at`, in ms: its wall clock then, read as if UTC, minus `at`.
 *
 * A fresh formatter each call, never one kept per zone: the zone is the viewer's `kb_tz` cookie as
 * given, and every case, offset or alias spelling of it is a distinct string, so a module cache
 * keyed by it would grow with each spelling a client sends. A render makes a few dozen calls.
 */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wall - Math.floor(at / 1000) * 1000;
}

/** The wall clock in `timeZone` at `at`, read as if UTC. */
function wallAt(at: number, timeZone: string): number {
  return at + zoneOffset(at, timeZone);
}

/**
 * The instant the first of `month` (1-based; 13 is next January) starts in `timeZone`: the first
 * instant whose local date there is the 1st.
 *
 * Local midnight is `wall - offset` for whichever offset holds at that instant. A clock change
 * on the night can make it happen twice (fall back past midnight: the earlier one) or not at all
 * (spring forward over it: the day starts at the change, found by bisection).
 */
function monthStart(year: number, month: number, timeZone: string): number {
  const wall = Date.UTC(year, month - 1, 1);
  // Every offset the zone keeps within a day either side: local midnight is under one of them.
  const offsets = [
    ...new Set(
      [-DAY_MS, -DAY_MS / 2, 0, DAY_MS / 2, DAY_MS].map((d) =>
        zoneOffset(wall + d, timeZone),
      ),
    ),
  ];
  const midnights = offsets
    .map((offset) => wall - offset)
    .filter((at) => wallAt(at, timeZone) === wall);
  if (midnights.length > 0) return Math.min(...midnights);
  // Midnight is skipped. Under the larger offset the instant is still the day before; under the
  // smaller, already the 1st: the change lies between, and the 1st starts there.
  let before = wall - Math.max(...offsets);
  let on = wall - Math.min(...offsets);
  while (on - before > 1) {
    const mid = Math.floor((before + on) / 2);
    if (wallAt(mid, timeZone) >= wall) on = mid;
    else before = mid;
  }
  return on;
}

/**
 * The current month in the viewer's zone (UTC until it is known: decision 5, D254-wv) as the
 * half-open window of instants `countFeedback` takes: the first of the month at 00:00 there, to the
 * first of the next month.
 */
export function monthWindow(format: FormatOptions): FeedbackWindow {
  const timeZone = format.timeZone ?? DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(format.now ?? Date.now());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return {
    start: new Date(monthStart(year, month, timeZone)).toISOString(),
    end: new Date(monthStart(year, month + 1, timeZone)).toISOString(),
  };
}

/** The head's count, `23 this month`; the board draws it with the rows, `0 this month` included. */
export function feedbackCount(total: number): string {
  return PROJECT_HOME.feedback.month(num(total));
}

export interface FeedbackRow {
  id: string;
  text: string;
  /** The message's `lang` when it is not the page's (`ko`); unset for the page's own. */
  lang: string | undefined;
  /** The API's `feedback_value`: 1 liked, 2 disliked, null unrated. */
  rating: FeedbackValue;
  /** `when()` of the time it arrived. */
  when: string;
  /** The message in the project's Shell: `/projects/<id>/feedback/<feedbackId>`. */
  href: string;
}

/** The panel's rows: the five newest messages, each with its rating, `lang`, time and address. */
export function feedbackRows(
  records: readonly Feedback[],
  projectId: string,
  format: FormatOptions,
): FeedbackRow[] {
  return records.slice(0, FEEDBACK_SHOWN).map((r) => ({
    id: r.id,
    text: r.message,
    lang: langAttr(r.message),
    rating: r.feedback_value ?? null,
    when: when(r.ingested_at, format),
    href: feedbackItemHref(projectId, r.id),
  }));
}

// ── Head: visibility ────────────────────────────────────────────────────────

export type Visibility = "private" | "public";
export type VisibilityPhase = "idle" | "saving" | "failed";

export interface VisibilityState {
  /** The visibility the head shows (badge and button). */
  visibility: Visibility;
  phase: VisibilityPhase;
}

export type VisibilityEvent =
  | { type: "press" }
  | { type: "saved" }
  | { type: "refused" }
  /** The server's visibility after a refresh; taken unless a change is being saved. */
  | { type: "sync"; visibility: Visibility };

export const flip = (v: Visibility): Visibility =>
  v === "public" ? "private" : "public";

/**
 * The head's states (`ProjectHomeHeadStates.dc.html`): a press saves (a second press does nothing);
 * saved flips the badge and the label; refused shows the notice and leaves the shown visibility as it
 * was, the button ready again. A sync takes the server's visibility while nothing is being saved, so the
 * head stays mounted (and the button keeps focus) when the page refreshes after a saved change.
 */
export function visibilityReducer(
  state: VisibilityState,
  event: VisibilityEvent,
): VisibilityState {
  switch (event.type) {
    case "press":
      return state.phase === "saving"
        ? state
        : { visibility: state.visibility, phase: "saving" };
    case "saved":
      return state.phase === "saving"
        ? { visibility: flip(state.visibility), phase: "idle" }
        : state;
    case "refused":
      return state.phase === "saving"
        ? { visibility: state.visibility, phase: "failed" }
        : state;
    case "sync":
      return state.phase === "saving" || state.visibility === event.visibility
        ? state
        : { visibility: event.visibility, phase: state.phase };
  }
}

/** What the visibility action's answer means for the head. */
export function visibilityOutcome(
  answer: SetVisibilityState,
): "saved" | "refused" {
  return answer.error === null ? "saved" : "refused";
}

/** The toast after a saved change. */
export function visibilityToast(
  next: Visibility,
  name: string,
  org: string,
): string {
  const t = PROJECT_HOME.head.toast;
  return next === "public" ? t.public(name) : t.private(name, org);
}

// ── API keys ────────────────────────────────────────────────────────────────

/** A project credential as `Keys` lists it: its prefix only, never its value. */
export function keyRowOf(c: KbCredential): KeyRow {
  return {
    id: c.id,
    name: c.name,
    prefix: c.token_prefix,
    access: c.scope === "capture" ? "capture" : "full",
    status: credentialStatus(c),
    created: c.created_at,
    lastUsed: c.last_used_at,
  };
}

/** The mint action's answer in `Keys`' terms. */
export function mintOutcome(answer: MintCredentialState): MintResult {
  if (answer.error === null && typeof answer.key === "string") {
    return { ok: true, key: answer.key };
  }
  return answer.error === MINT_CREDENTIAL_ERRORS.invalidName
    ? { ok: false, reason: "invalid-name" }
    : { ok: false, reason: "failed" };
}

/** The revoke action's answer in `Keys`' terms. */
export function revokeOutcome(answer: RevokeCredentialState): RevokeResult {
  return answer.error === null ? { ok: true } : { ok: false };
}
