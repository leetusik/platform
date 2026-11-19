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

/** `/projects/<id>/library` and beneath it: a project's library (job 03 round 02, F321). */
const PROJECT_LIBRARY = /^\/projects\/[^/?#]+\/library(?:[/?#]|$)/;

/** The path without its query or hash. */
const pathOf = (pathname: string) => pathname.split(/[?#]/, 1)[0];

/**
 * `/@<org>`, one segment: an org's public library, where a member's rail reads Library current
 * (`PublicLibrary.dc.html`, the member; P63). An address without the `@` is its Not found (none).
 */
const PUBLIC_LIBRARY = /^\/(?:@|%40)[^/?#]+\/?$/i;

/** A library page: the Library (`/library`) or a project's library (`/projects/<id>/library`). */
export function onLibraryPage(pathname: string): boolean {
  const path = pathOf(pathname);
  return under(path, LIBRARY) || PROJECT_LIBRARY.test(path);
}

/**
 * Where the project switcher takes a picked project (F321): on a library page, that project's
 * library; anywhere else, its home.
 */
export function projectSwitchHref(pathname: string, projectId: string): string {
  const home = `/projects/${encodeURIComponent(projectId)}`;
  return onLibraryPage(pathname) ? `${home}/library` : home;
}

/**
 * The rail a path shows. On `/projects/<id>` and beneath it, the project form: Overview (the project's
 * home), Workspace (signed, inert and marked Coming until it ships, operator D1), Library and Feedback.
 * Elsewhere the org form: Overview (org home), Library, Feedback (F320: no Documents). Then the rule and
 * Review. The current item follows the path; an address the rail does not name has none (F25: `none`).
 *
 * The project form's Library is the project's library (`/projects/<id>/library`, job 03 round 02,
 * F321), current there (Overview is then not); its Feedback is `/feedback?project=<id>` (the record
 * names no project-scoped Feedback route, so the nearest page, with its project filter).
 * The org form's Library is also current on an org's public library, `/@<org>` (P63).
 *
 * `known` says whether the path's project is one of the active org's (the Shell's project list). A
 * `/projects/<id>` that is no project of the org is project home's Not found: the board draws it
 * under the Shell with no project and no rail item current, so it takes the org form with none.
 */
export function railFor(pathname: string, known = true): Rail {
  const projectId = projectIdOf(pathname);
  const review: RailItem = {
    key: "review",
    href: REVIEW,
    current: under(pathname, REVIEW),
  };
  if (projectId !== null && known) {
    const home = `/projects/${encodeURIComponent(projectId)}`;
    const library = PROJECT_LIBRARY.test(pathOf(pathname));
    return {
      form: "project",
      items: [
        { key: "overview", href: home, current: !library },
        { key: "workspace", href: null, current: false },
        { key: "library", href: `${home}/library`, current: library },
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
      {
        key: "library",
        href: LIBRARY,
        current:
          under(pathname, LIBRARY) || PUBLIC_LIBRARY.test(pathOf(pathname)),
      },
      { key: "feedback", href: FEEDBACK, current: under(pathname, FEEDBACK) },
    ],
    review,
  };
}

/** Review's count: `99+` over 99, nothing at 0 (`due()` of `@/lib/format`). */
export function reviewCount(due: number): string {
  return dueText(due);
}

/** What the menus' Escape rule reads of a key event on a menu's anchor (a React `KeyboardEvent` fits). */
export interface MenuKeyEvent {
  key: string;
  preventDefault(): void;
  currentTarget: {
    querySelector(selectors: "button"): { focus(): void } | null;
  };
}

/**
 * Escape on an open menu closes it and puts focus back on its trigger, the anchor's first button (each
 * anchor is its trigger, then its menu). Any other key, or Escape with no menu open, is left alone, so
 * the page's own Escape (the full view's exit) still runs. Returns whether it took the key.
 */
export function closeMenuOnEscape(
  event: MenuKeyEvent,
  open: boolean,
  close: () => void,
): boolean {
  if (event.key !== "Escape" || !open) return false;
  event.preventDefault();
  close();
  event.currentTarget.querySelector("button")?.focus();
  return true;
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
