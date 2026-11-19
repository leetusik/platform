/**
 * hi2vi Library (`03-library` round 02, F324, F328) — where a book, a document or a chapter was
 * opened from, and the way back to it.
 *
 * A list's place rides in one query value, `?from=`, on the item's address: the list's own
 * address (`/library?view=all&page=2&q=…&filter=…`, `/projects/{id}/library?page=…`,
 * `/@{org}/{project}?…`, `/@{org}?…`), built by `reader-href.ts`. Decoding accepts only the exact
 * form our links emit (`safeNextPath` leaves it unchanged: no `..`, no control character), a
 * same-origin path, and only those three list origins with segments of their real charset (no
 * escape, no space), rebuilt from their known parts: anything else is the Library.
 *
 * P63-fk.F4: the way back names the place it links to from the item's own data, never from text
 * the address carries. `itemWayBack` trusts a decoded list only when it is the item's own (a
 * member's Library, its org's public library, its project's library); any other is the item's own
 * default, exactly as with no `from`.
 *
 * F328: a chapter opened straight from a list (Continue reading) carries the same value, and the
 * reader passes it on to its book (`withFrom(bookHref(…), from)`), so the book's way back names
 * the list the reader came through.
 *
 * Deliberately NOT `server-only`: pages decode it on the server, and client islands build links.
 */

import { LIBRARY } from "@/content/library";
import { safeNextPath } from "@/lib/next-path";
import {
  libraryHref,
  projectLibraryHref,
  publicLibraryHref,
  publicProjectHref,
  type ListPlace,
} from "@/lib/reader-href";

/** The query key that carries where an item was opened from. */
export const FROM_PARAM = "from";

/** A list an item can be opened from, with its place. */
export type ListOrigin =
  | { origin: "library"; place: ListPlace }
  | {
      origin: "project-library";
      viewer: "member";
      /** The project's id (`/projects/{id}/library`). */
      project: string;
      place: ListPlace;
    }
  | {
      origin: "project-library";
      viewer: "visitor";
      /** `orgSegment(owner)`, without the `@`. */
      org: string;
      project: string;
      place: ListPlace;
    }
  | { origin: "public-library"; org: string; place: ListPlace };

/** Where a missing or rejected `from` goes back to. */
export const LIBRARY_ORIGIN: ListOrigin = { origin: "library", place: {} };

/**
 * `filter` is a project's name (`server/app_api.py` `CreateProjectInput.name`, `max_length=200`).
 * `q` is the reader's own text, which the server does not cap: a longer one is dropped from the way
 * back (the list stays, without its search), not trusted.
 */
const MAX_PART_LENGTH = 200;
const PAGE = /^[1-9][0-9]{0,5}$/;
const PARSE_BASE = "https://from.invalid";
// Every length below is what the server makes (P63-fk.F5): change it with its source, never narrower.
/** A UUID as the server writes it (`tenants.id`, `projects.id` are `sa.UUID()`): 36 characters. */
const UUID_LENGTH = 36;
/** An org slug's longest (`server/accounts/slugs.py` `ORG_SLUG_MAX_LENGTH`). */
const ORG_SLUG_MAX_LENGTH = 40;
/** An org segment: its slug (`server/accounts/slugs.py`) or its tenant's id (a UUID), unescaped. */
const ORG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `orgSegment(owner)` is the slug, else the tenant's id: the longer of the two. */
const MAX_ORG_LENGTH = Math.max(ORG_SLUG_MAX_LENGTH, UUID_LENGTH);
/**
 * A visitor's project segment is the project's name: its charset as the content plane accepts it
 * (`server/gitops.py` `_PROJECT_NAME_RE`, which sets no length), its length as the control plane
 * does (`server/app_api.py` `CreateProjectInput.name`, `max_length=200`). Unescaped.
 */
const PROJECT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_PROJECT_NAME_LENGTH = 200;
/** A member's project id (`/app/projects/{project_id}`, a UUID), unescaped. */
const PROJECT_ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const MAX_PROJECT_ID_LENGTH = UUID_LENGTH;

/** The list's address: the value `?from=` carries. */
export function encodeFrom(from: ListOrigin): string {
  switch (from.origin) {
    case "library":
      return libraryHref(from.place);
    case "public-library":
      return publicLibraryHref(from.org, from.place);
    case "project-library":
      return from.viewer === "member"
        ? projectLibraryHref(from.project, from.place)
        : publicProjectHref(
            { org: from.org, project: from.project },
            from.place,
          );
  }
}

function part(value: string | null): string | null {
  return value && value.length <= MAX_PART_LENGTH ? value : null;
}

function placeOf(search: URLSearchParams): ListPlace {
  const place: ListPlace = {};
  const view = search.get("view");
  // By project is the default view, written as no `view` at all.
  if (view === "all") place.view = view;
  const page = search.get("page");
  if (page !== null && PAGE.test(page)) place.page = Number(page);
  const q = part(search.get("q"));
  if (q !== null) place.q = q;
  const filter = part(search.get("filter"));
  if (filter !== null) place.filter = filter;
  return place;
}

/** A project's page keeps only its `page` and `q`. */
function projectPlace(place: ListPlace): ListPlace {
  const out: ListPlace = {};
  if (place.page != null) out.page = place.page;
  if (place.q != null) out.q = place.q;
  return out;
}

/** A path segment as our links write it: matched as it stands, never decoded (no escape passes). */
function segmentOf(value: string, shape: RegExp, max: number): string | null {
  return value.length <= max && shape.test(value) ? value : null;
}

/**
 * The list a `?from=` value names, or the Library when it is missing, repeated, hostile or names
 * anything but a list. Never throws. Only the parts each list has survive: the library keeps
 * `view`, `page`, `q`, `filter`; a project's page `page` and `q`; the public library all four.
 */
export function decodeFrom(
  raw: string | string[] | null | undefined,
): ListOrigin {
  if (typeof raw !== "string" || raw.length === 0) return LIBRARY_ORIGIN;
  // What `safeNextPath` refuses (control characters, `\`, `//`, encoded slashes) or rewrites
  // (`..`, `.`) is no address our links wrote.
  const safe = safeNextPath(raw);
  if (safe !== raw) return LIBRARY_ORIGIN;
  let url: URL;
  try {
    url = new URL(safe, PARSE_BASE);
  } catch {
    return LIBRARY_ORIGIN;
  }
  if (url.origin !== PARSE_BASE) return LIBRARY_ORIGIN;
  const place = placeOf(url.searchParams);
  const segments = url.pathname.split("/").slice(1);

  if (segments.length === 1 && segments[0] === "library") {
    return { origin: "library", place };
  }
  if (
    segments.length === 3 &&
    segments[0] === "projects" &&
    segments[2] === "library"
  ) {
    const project = segmentOf(
      segments[1],
      PROJECT_ID_SEGMENT,
      MAX_PROJECT_ID_LENGTH,
    );
    if (project === null) return LIBRARY_ORIGIN;
    return {
      origin: "project-library",
      viewer: "member",
      project,
      place: projectPlace(place),
    };
  }
  if (
    (segments.length === 1 || segments.length === 2) &&
    segments[0].startsWith("@")
  ) {
    const org = segmentOf(segments[0].slice(1), ORG_SEGMENT, MAX_ORG_LENGTH);
    if (org === null) return LIBRARY_ORIGIN;
    if (segments.length === 1) {
      return { origin: "public-library", org, place };
    }
    const project = segmentOf(
      segments[1],
      PROJECT_SEGMENT,
      MAX_PROJECT_NAME_LENGTH,
    );
    if (project === null) return LIBRARY_ORIGIN;
    return {
      origin: "project-library",
      viewer: "visitor",
      org,
      project,
      place: projectPlace(place),
    };
  }
  return LIBRARY_ORIGIN;
}

/** The names the way back reads, which the page has loaded; a missing one reads the origin's own segment. */
export interface WayBackNames {
  /** The project's name, for a project's library. */
  project?: string | null;
  /** The org's name, for the public library. */
  org?: string | null;
}

/**
 * The way back (F324) to a list the page **trusts**: its href, at the list's place, and its label:
 * `Library`, the project's name, or the org's name. A missing name reads the origin's own segment,
 * so pass only an origin built from the item's own address, or one `itemWayBack` kept; a decoded
 * `?from=` goes through `itemWayBack`, never straight here (P63-fk.F4).
 */
export function wayBack(
  from: ListOrigin,
  names: WayBackNames = {},
): { href: string; label: string } {
  const href = encodeFrom(from);
  switch (from.origin) {
    case "library":
      return { href, label: LIBRARY.title };
    case "public-library":
      return { href, label: names.org || from.org };
    case "project-library":
      return { href, label: names.project || from.project };
  }
}

/** The item a way back belongs to, as its own address and reads name it. */
export interface WayBackItem {
  /** A signed-in reader: their lists (the Library, a project's member page) are theirs to go back to. */
  member: boolean;
  /**
   * The segments the item's own org goes by in an address (`/@{org}`): the org of its own address
   * first (the label when the read names no org), then any other it is known by (its slug, its
   * tenant id). Empty when it has none.
   */
  orgs: readonly (string | null | undefined)[];
  /** The item's own project, as its read names it (a project's name is its segment); null when unread. */
  project?: string | null;
  /** The org's display name, as the item's read carries it. */
  orgName?: string | null;
}

/**
 * The way back for one item (F324, P63-fk.F4): the list `from` names when it is the item's own,
 * else the item's own default, its label always from the item's data:
 *
 * - the Library, for a member: `Library`;
 * - the public library of the item's own org: the org's name, else the slug of the item's own address;
 * - the item's own project's library (its org and its name, for a visitor's `/@{org}/{project}`): the
 *   project's name. A member's `/projects/{id}/library` names its project by an id the item's reads do
 *   not carry, so it is taken as the item's own project once the project is read; before that (a
 *   loading or not-found state) it is not trusted;
 * - anything else (another org's list, another project's, a member's list for a visitor, no `from`):
 *   the item's default, a member's Library or a visitor's public library of the item's own org;
 *   null when a visitor's item has no org.
 */
export function itemWayBack(
  from: ListOrigin | null,
  item: WayBackItem,
): { origin: ListOrigin; href: string; label: string } | null {
  const orgs = item.orgs.filter((o): o is string => !!o);
  const own = orgs[0] ?? null;
  const project = item.project || null;
  const ownOrg = (org: string) => orgs.includes(org);
  const trusted = (o: ListOrigin): boolean => {
    switch (o.origin) {
      case "library":
        return item.member;
      case "public-library":
        return ownOrg(o.org);
      case "project-library":
        if (project === null) return false;
        return o.viewer === "member"
          ? item.member
          : ownOrg(o.org) && o.project === project;
    }
  };
  let origin: ListOrigin;
  if (from && trusted(from)) origin = from;
  else if (item.member) origin = LIBRARY_ORIGIN;
  else if (own) origin = { origin: "public-library", org: own, place: {} };
  else return null;
  const href = encodeFrom(origin);
  switch (origin.origin) {
    case "library":
      return { origin, href, label: LIBRARY.title };
    case "public-library":
      return { origin, href, label: item.orgName || own || origin.org };
    case "project-library":
      return { origin, href, label: project as string };
  }
}

/**
 * `href` with `?from=` set to the list's address, before any `#hash`; `href` unchanged when there
 * is no list to carry.
 */
export function withFrom(
  href: string,
  from: ListOrigin | null | undefined,
): string {
  if (!from) return href;
  const hashAt = href.indexOf("#");
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const queryAt = base.indexOf("?");
  const path = queryAt === -1 ? base : base.slice(0, queryAt);
  const query = new URLSearchParams(
    queryAt === -1 ? "" : base.slice(queryAt + 1),
  );
  query.set(FROM_PARAM, encodeFrom(from));
  return `${path}?${query.toString()}${hash}`;
}
