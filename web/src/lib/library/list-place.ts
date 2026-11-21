/**
 * sikstack Library (`03-library` round 02, F320, F324, F325) — a list's place, read from its address,
 * and the arithmetic of a page of it. Pure, and NOT `server-only`: the pages read it on the server and
 * the list parts build their links with it in the browser.
 *
 * The library's place is `?view=all&page=3&q=…&filter=…` (`libraryHref`, `reader-href.ts`): the view
 * (By project, the default, is no `view` at all), the page of All documents, the search and the
 * project filter (a project's name). A project's page keeps `page` and `q`. Switching views keeps the
 * other three (F320). 25 rows a page (`LB.PAGE`).
 */
import { pagerRange } from "@/sikstack/library/pager-model";
import { libraryHref, type ListPlace } from "@/lib/reader-href";

/** Rows a page of a documents table (`LB.PAGE`). */
export const PAGE_SIZE = 25;

/** No search or filter of ours comes near this (`from.ts` holds the same line). */
const MAX_PART = 200;
const PAGE = /^[1-9][0-9]{0,5}$/;

export type LibraryView = "project" | "all";

/** The library's place, as the page reads its address. */
export interface LibraryPlace {
  view: LibraryView;
  /** 1-based; held to the last page by `pageWindow`. */
  page: number;
  /** The search, trimmed; empty for none. */
  q: string;
  /** The project filter (a project's name), or null for All projects. */
  filter: string | null;
}

/** A project's page keeps only its page and search. */
export interface ProjectPlace {
  page: number;
  q: string;
}

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v : null;
}

function readPage(value: string | string[] | undefined): number {
  const v = one(value);
  return v !== null && PAGE.test(v) ? Number(v) : 1;
}

function readText(value: string | string[] | undefined): string {
  const v = one(value)?.trim() ?? "";
  return v.length <= MAX_PART ? v : "";
}

export function readLibraryPlace(params: Params): LibraryPlace {
  const filter = readText(params.filter);
  return {
    view: one(params.view) === "all" ? "all" : "project",
    page: readPage(params.page),
    q: readText(params.q),
    filter: filter || null,
  };
}

export function readProjectPlace(params: Params): ProjectPlace {
  return { page: readPage(params.page), q: readText(params.q) };
}

/** The place as `reader-href.ts` writes it (default parts left out of the address). */
export function listPlace(place: LibraryPlace): ListPlace {
  return {
    view: place.view,
    page: place.page,
    q: place.q || null,
    filter: place.filter,
  };
}

/** The address of the other view: the search, the filter and the page are kept (F320). */
export function viewHref(place: LibraryPlace, view: LibraryView): string {
  return libraryHref(listPlace({ ...place, view }));
}

/** Which rows a page shows: the page held to 1 … pages, and the slice `[from, to)`. */
export function pageWindow(
  total: number,
  page: number,
  size: number = PAGE_SIZE,
): { page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const from = (at - 1) * size;
  return { page: at, pages, from, to: Math.min(total, from + size) };
}

/** `26–50 of 240`: the range line of a page, of the rows the table lists. */
export function rangeLine(
  page: number,
  total: number,
  size: number = PAGE_SIZE,
): string {
  return pagerRange(page, size, total);
}
