// Project home's pure parts (job 01, round 03-instrument, `ProjectHome*.dc.html`): what each panel
// shows, from the reads and actions the page already had. No React, no `server-only`, so the server
// page, the client islands and the Node tests all import it.

import { MINT_CREDENTIAL_ERRORS, PROJECT_HOME } from "@/content/project";
import type { KeyRow, MintResult, RevokeResult } from "@/hi2vi/frame";
import { stepsN } from "@/hi2vi/workspace/frame/steps-model";
import { credentialStatus } from "@/lib/knowledge/credential-status";
import type { KbCredential, KbOrgLibrary } from "@/lib/knowledge/types";
import { secondTitleLang } from "@/lib/library/lists";
import { bookHref, orgSegment, readerHref } from "@/lib/reader-href";
import { num, plural, type FormatOptions } from "@/lib/format";
import { viewerTimeZone, type CookieReader } from "@/lib/time-zone";
import { backlogHref, phaseHref } from "@/lib/workspace/address";
import { langOf, openJobs } from "@/lib/workspace/model";
import type { WorkspaceRead } from "@/lib/workspace/read";

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

// ── Workspace ───────────────────────────────────────────────────────────────

/** The link command's second sentence, split so the panel sets the command as code. */
export interface WorkspaceRun {
  before: string;
  command: string;
  after: string;
}

/**
 * The Workspace panel's signed sentence for a project whose workspace is not linked or has never
 * synced: its first sentence, then `Run <command> in the project’s repo.`. Without an origin or a
 * project id the second sentence is left out rather than drawn with a guessed address.
 */
export function workspaceWords(
  link: { origin: string | null; projectId: string | null } | null = null,
): {
  heading: string;
  empty: string;
  run: WorkspaceRun | null;
} {
  const w = PROJECT_HOME.workspace;
  const run =
    link?.origin && link.projectId
      ? {
          before: w.run.before,
          command: w.run.command(link.origin, link.projectId),
          after: w.run.after,
        }
      : null;
  return { heading: w.heading, empty: w.empty, run };
}

/** The board's five newest phases. */
export const PHASES_SHOWN = 5;

/** A phase as the panel's row draws it (`ProjectHomeWorkspace.dc.html`). */
export interface HomePhase {
  /** The full id, the row's key. */
  key: string;
  /** The short id the row shows (`P57`, job 01's figure: the read model's `short`). */
  id: string;
  /** The name, or the full id when the phase has none. */
  name: string;
  lang: "en" | "ko";
  /** The phase's page. No `?from=`: project home is not a Workspace list (its way back is the Backlog). */
  href: string;
  /**
   * The current slice under the name while the phase is not done, else `null`: `S5 Project home and the rail`
   * from the read's stored name, its short id alone when the read has none.
   */
  slice: string | null;
  /** `ko` when the current slice's name is Korean, else `null`. */
  sliceLang: "ko" | null;
  status: string | null;
  done: number;
  total: number;
  /** One step runs while the phase is in progress with slices left. */
  live: boolean;
}

/** The panel's three forms: the phases, the link sentence, and loading. */
export type WorkspacePart =
  | {
      kind: "phases";
      /** `12 deferred`: the open jobs (deferred or ready, F42). */
      deferred: string;
      phases: HomePhase[];
      /** `--steps-n`: the longest phase shown, so every row's step is one width. */
      longest: number;
      /** See all in Workspace: the Backlog, where the phases are. */
      all: string;
    }
  | { kind: "link" }
  | { kind: "loading" };

/**
 * The panel from the page's one Workspace read: a synced workspace's five newest phases (the read
 * lists them newest first, the pointer's phase leading, as the board does) and its open jobs; the
 * signed link sentence for a project not linked, never synced, or with no workspace the read can
 * find. A failed read is not a form the board draws: the page throws it (the Feedback panel's rule).
 */
export function workspacePart(
  read: WorkspaceRead,
  projectId: string,
): WorkspacePart {
  if (read.state === "error") {
    throw new Error(
      `The workspace did not load (${read.status ?? "no answer"}).`,
    );
  }
  if (read.state !== "ready") return { kind: "link" };
  const ws = read.value;
  const phases = ws.phases.slice(0, PHASES_SHOWN).map((p): HomePhase => {
    const name = p.name?.trim() || p.id;
    const current = p.status !== "done" && p.current ? p.current : null;
    const sliceName =
      current && p.currentRef?.id === current
        ? p.currentRef.name?.trim() || null
        : null;
    return {
      key: p.id,
      id: p.short || p.id,
      name,
      lang: langOf(name),
      href: phaseHref(projectId, p.id),
      slice: current && sliceName ? `${current} ${sliceName}` : current,
      sliceLang: langOf(sliceName) === "ko" ? "ko" : null,
      status: p.status,
      done: p.done,
      total: p.total,
      live: p.status === "in_progress" && p.done < p.total,
    };
  });
  return {
    kind: "phases",
    deferred: PROJECT_HOME.workspace.deferred(num(openJobs(ws.deferred))),
    phases,
    longest: stepsN(phases.map((p) => p.total)),
    all: backlogHref(projectId),
  };
}

/** The request headers the origin is read from (`next/headers`' `headers()` satisfies it). */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The origin the viewer reached the page at: the proxy's forwarded host and scheme when present (the
 * production nginx sets `Host` and `X-Forwarded-Proto`), else the request's own `Host` over http.
 * `null` when the request names no host.
 */
export function requestOrigin(headers: HeaderReader): string | null {
  const first = (v: string | null): string =>
    (v ?? "").split(",")[0]?.trim() ?? "";
  const host =
    first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  if (!host) return null;
  const proto = first(headers.get("x-forwarded-proto")) || "http";
  return `${proto}://${host}`;
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
    access: c.scope === "capture" || c.scope === "workspace" ? c.scope : "full",
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
