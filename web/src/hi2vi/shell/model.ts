// The Shell's rules as pure functions (the signed Shell: job 01 round 03-instrument, frame.md F9, with
// the org rail revised by job 03 round 02-one-library, F320). No React and no I/O, so the rules are
// tested on their own (tests/hi2vi-shell-*.test.ts); `shell.tsx` renders what these return.

import { due as dueText } from "@/lib/format";

/** An org the account belongs to, as the org switcher's row shows it. */
export interface ShellOrg {
  id: string;
  name: string;
  /** The org's public address (`hi2vi.com/@slug`), or `null` with no slug claimed. */
  address: string | null;
  /** Its project count, or `null` when it could not be read (the row then shows none). */
  projects: number | null;
}

/** A project of the active org, as the project switcher lists it. */
export interface ShellProject {
  id: string;
  name: string;
  visibility: "public" | "private";
  created_at: string;
}

/** The org switcher is a menu only for a user in two or more orgs; one org is its plain name. */
export function orgSwitcherKind(orgCount: number): "menu" | "plain" {
  return orgCount >= 2 ? "menu" : "plain";
}

/** The project switcher is absent while the org has no project. */
export function hasProjectSwitcher(projects: readonly unknown[]): boolean {
  return projects.length > 0;
}

/** The filter field appears over 7 projects. */
export function showsProjectFilter(projectCount: number): boolean {
  return projectCount > 7;
}

/** The projects whose name contains the typed text, trimmed and without regard to case. */
export function filterProjects<T extends { name: string }>(
  projects: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...projects];
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}

/** The menu title's count: `24`, or `3 of 24` while a filter is typed. */
export function projectCountText(
  query: string,
  shown: number,
  total: number,
): string {
  return query.trim() ? `${shown} of ${total}` : String(total);
}

/** Newest first: a created project is first in the switcher (the flow, F16). The API lists oldest first. */
export function newestFirst<T extends { id: string; created_at: string }>(
  projects: readonly T[],
): T[] {
  return [...projects].sort((a, b) => {
    const ta = Date.parse(a.created_at) || 0;
    const tb = Date.parse(b.created_at) || 0;
    if (ta !== tb) return tb - ta;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** The project a path is under: `/projects/<id>` and beneath it; `null` elsewhere. */
export function projectIdOf(pathname: string): string | null {
  const m = /^\/projects\/([^/?#]+)/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export type RailKey =
  "overview" | "workspace" | "library" | "feedback" | "review";

export interface RailItem {
  key: RailKey;
  /** The link, or `null` for an item that is not a link (Workspace, operator D1). */
  href: string | null;
  current: boolean;
}

export interface Rail {
  form: "org" | "project";
  /** The items above the rule, in the signed order. */
  items: RailItem[];
  /** Review, below the rule. */
  review: RailItem;
}

const ORG_HOME = "/dashboard";
const LIBRARY = "/library";
const FEEDBACK = "/feedback";
const REVIEW = "/review";

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * The rail a path shows. On `/projects/<id>` and beneath it, the project form: Overview (the project's
 * home), Workspace (signed, inert and marked Coming until it ships, operator D1), Library and Feedback.
 * Elsewhere the org form: Overview (org home), Library, Feedback (F320: no Documents). Then the rule and
 * Review. The current item follows the path; an address the rail does not name has none (F25: `none`).
 *
 * The record names no project-scoped Library or Feedback route, so the project form links to today's
 * nearest pages: `/library` (it reads no project), and `/feedback?project=<id>` (its project filter).
 */
export function railFor(pathname: string): Rail {
  const projectId = projectIdOf(pathname);
  const review: RailItem = {
    key: "review",
    href: REVIEW,
    current: under(pathname, REVIEW),
  };
  if (projectId !== null) {
    const home = `/projects/${encodeURIComponent(projectId)}`;
    return {
      form: "project",
      items: [
        { key: "overview", href: home, current: true },
        { key: "workspace", href: null, current: false },
        { key: "library", href: LIBRARY, current: false },
        {
          key: "feedback",
          href: `${FEEDBACK}?project=${encodeURIComponent(projectId)}`,
          current: false,
        },
      ],
      review,
    };
  }
  return {
    form: "org",
    items: [
      { key: "overview", href: ORG_HOME, current: under(pathname, ORG_HOME) },
      { key: "library", href: LIBRARY, current: under(pathname, LIBRARY) },
      { key: "feedback", href: FEEDBACK, current: under(pathname, FEEDBACK) },
    ],
    review,
  };
}

/** Review's count: `99+` over 99, nothing at 0 (`due()` of `@/lib/format`). */
export function reviewCount(due: number): string {
  return dueText(due);
}

/** The nonce of a request's Content-Security-Policy (`'nonce-…'`), as Next reads it; `undefined` without one. */
export function nonceFromCsp(
  csp: string | null | undefined,
): string | undefined {
  if (!csp) return undefined;
  const m = /'nonce-([^']+)'/.exec(csp);
  return m ? m[1] : undefined;
}

/** The avatar's letter: the email's first letter, upper case (F30). */
export function initialOf(email: string): string {
  return (email.trim().charAt(0) || "?").toUpperCase();
}
