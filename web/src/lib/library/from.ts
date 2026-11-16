/**
 * hi2vi Library (`03-library` round 02, F324, F328) — where a book, a document or a chapter was
 * opened from, and the way back to it.
 *
 * A list's place rides in one query value, `?from=`, on the item's address: the list's own
 * address (`/library?view=all&page=2&q=…&filter=…`, `/projects/{id}/library?page=…`,
 * `/@{org}/{project}?…`, `/@{org}?…`), built by `reader-href.ts`. Decoding launders it with
 * `safeNextPath` and then accepts only those three list origins, rebuilt from their known parts:
 * a hostile or foreign value (`//evil.example.com`, `https://…`, not a path, any other page) is
 * the Library, never an address of its own.
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

/** No search or filter of ours comes near this; a longer one is dropped, not trusted. */
const MAX_PART_LENGTH = 200;
const PAGE = /^[1-9][0-9]{0,5}$/;
const PARSE_BASE = "https://from.invalid";

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

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && decoded.length <= MAX_PART_LENGTH
      ? decoded
      : null;
  } catch {
    return null;
  }
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
  const safe = safeNextPath(raw);
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
    const project = decodeSegment(segments[1]);
    if (project === null) return LIBRARY_ORIGIN;
    return {
      origin: "project-library",
      viewer: "member",
      project,
      place: projectPlace(place),
    };
  }
  if (segments.length >= 1 && segments.length <= 2) {
    const org = decodeSegment(segments[0]);
    if (org === null || !org.startsWith("@") || org.length < 2) {
      return LIBRARY_ORIGIN;
    }
    if (segments.length === 1) {
      return { origin: "public-library", org: org.slice(1), place };
    }
    const project = decodeSegment(segments[1]);
    if (project === null) return LIBRARY_ORIGIN;
    return {
      origin: "project-library",
      viewer: "visitor",
      org: org.slice(1),
      project,
      place: projectPlace(place),
    };
  }
  return LIBRARY_ORIGIN;
}

/** The names the way back reads, which the page has loaded; a missing one reads the address's. */
export interface WayBackNames {
  /** The project's name, for a project's library. */
  project?: string | null;
  /** The org's name, for the public library. */
  org?: string | null;
}

/**
 * The way back (F324): its href, at the list's place, and its label: `Library`, the project's
 * name, or the org's name.
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
