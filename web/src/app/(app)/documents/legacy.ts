/**
 * P63 (operator decision 4, D152-kw) — the retired `/documents` addresses, as redirects answered
 * before anything renders. Pure, and NOT `server-only`: `next.config.ts` reads the version rule, the
 * `/documents` route handler reads the list rule, and the tests read both.
 *
 * - `/documents/<id>/versions/<v>` → `/documents/<id>?v=<v>`: a `next.config` redirect (it runs before
 *   the proxy, so before the reader's nonce CSP and before any page script; Next 16.3.8,
 *   `01-app/03-api-reference/03-file-conventions/proxy.md` § Execution order). Next passes the request's
 *   own query through to the destination (`…/next-config-js/redirects.md`, "any query values provided in
 *   the request will be passed through"), so `?from=…` survives beside the new `v`.
 * - `/documents?project=<id>&q=<search>` → `/library?view=all&q=<search>&filter=<project name>`: the
 *   Library's All documents view, in its own parameter names (`libraryHref`). The old list's `project`
 *   was a project's id and the Library's `filter` is the project's name, so the route handler asks the
 *   reader's projects for the name when, and only when, a `project` is given. Its other parameters
 *   (`tag`, `limit`, `offset`) have no place in the Library and are dropped.
 */
// A relative import: `next.config.ts` loads this file, outside the app's `@/` alias.
import { libraryHref } from "../../../lib/reader-href";

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined | null): string {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v.trim() : "";
}

/** The old list's address as the redirect reads it: the search and the project's id, blanks absent. */
export interface OldListPlace {
  q: string | null;
  project: string | null;
}

export function readOldList(params: Params | URLSearchParams): OldListPlace {
  const get = (key: string) =>
    params instanceof URLSearchParams
      ? first(params.get(key))
      : first(params[key]);
  return { q: get("q") || null, project: get("project") || null };
}

/**
 * Where an old list address goes: All documents with the same search, filtered to the project whose
 * id the old address carried (`projectName`: that id's name, or null when it is unknown or unread).
 */
export function documentsRedirect(
  old: OldListPlace,
  projectName: string | null,
): string {
  return libraryHref({ view: "all", q: old.q, filter: projectName });
}

/** `next.config.ts`'s rule for an old version page (the query rides through). */
export const VERSION_REDIRECT = {
  source: "/documents/:id/versions/:v",
  destination: "/documents/:id?v=:v",
  permanent: false,
} as const;
