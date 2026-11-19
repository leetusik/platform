/**
 * hi2vi Library (`03-library` round 02, F320 to F323, F328; `LB.shelves`, `LB.search`) — the view
 * model of the three list pages (the library, a project's page, the public library): a project's
 * section (`Shelf`: its books, its five newest documents, its count and the way to its page) and the
 * documents table (`LibraryDocs`: the search over titles, tags and text, the project filter, 25 a
 * page). Pure (no I/O), so every page and the tests read one source; `load-lists.ts` does the reads.
 *
 * No subject anywhere (F320): `subject` stays data and is never grouped on or shown.
 */
import { LANGUAGES } from "@/content/library-frame";
import { LIBRARY_PAGE, SHELF } from "@/content/library-page";
import { date, type FormatOptions } from "@/lib/format";
import type { KbReaderLibrary } from "@/lib/knowledge/reader";
import type {
  KbLibraryBook,
  KbLibraryDocument,
  KbOrgLibrary,
} from "@/lib/knowledge/types";
import { bookHref, orgSegment, readerHref } from "@/lib/reader-href";

import { excerptOf, holds, type Cut } from "./excerpt";
import { pageWindow, rangeLine } from "./list-place";

/** A section shows this many of its newest documents; the rest are on the project's page (F321). */
export const SHELF_NEWEST = 5;

/** A reading state's word and shape (frame.md F54): `.status`, `.status-idle`, `.status-done`. */
export interface ReadState {
  word: string;
  cls: string;
}

/** Hangul: S15's guess at a second title's language when the manifest names none. */
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/**
 * A book's second title's `lang` (P63, D248-j7): the manifest's `sub_lang` when it names one, else the
 * guess (`ko` for a title holding Hangul), else none.
 */
export function secondTitleLang(
  sub: string | null | undefined,
  lang?: string | null,
): string | undefined {
  if (lang) return lang;
  return sub && HANGUL.test(sub) ? "ko" : undefined;
}

export interface ShelfBook {
  key: string;
  title: string;
  /** The book's second title, when it has one. */
  sub: string | null;
  /** The second title's `lang` (`secondTitleLang`); unset when unknown. */
  subLang?: string;
  href: string;
  /** `14 chapters`. */
  chapters: string;
  /** `English, 한국어` when it has two or more languages; else empty. */
  langs: string;
  /** Null for a visitor (no reading state). */
  state: ReadState | null;
  /** The newest chapter's date (`Nov 14`); empty when none can be read. */
  date: string;
}

export interface ShelfDoc {
  key: string;
  id: number;
  title: string;
  lang: string;
  href: string;
  /** An html document: `Original layout`. */
  legacy: boolean;
  state: ReadState | null;
  date: string;
}

/** One project's section (`Shelf`). */
export interface ShelfModel {
  key: string;
  /** The project's name: the key of its page and of the filter. */
  project: string;
  /** The name, with a break point after each `_`, `-` and `/` (F97). */
  name: string;
  isPublic: boolean;
  /** `1 book, 132 documents`. */
  count: string;
  books: ShelfBook[];
  /** The five newest. */
  docs: ShelfDoc[];
  /** Every document of the project: the foot link's figure. */
  docCount: number;
}

export interface ShelvesModel {
  shelves: ShelfModel[];
  books: number;
  docs: number;
  /** `3 books, 240 documents`. */
  count: string;
  /** Projects with nothing to read. */
  empty: number;
}

const ZWSP = "​";

/** A project's name with a break point after `_`, `-` and `/` (F97, F328). */
export function nameBreaks(name: string): string {
  return name.replace(/([_\-/])/g, `$1${ZWSP}`);
}

const byText = (a: string, b: string): number =>
  a.localeCompare(b, "en", { sensitivity: "base" }) ||
  (a < b ? -1 : a > b ? 1 : 0);

/** Newest first, then by id, as the server lists them. */
const byDate = (a: KbLibraryDocument, b: KbLibraryDocument): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id;

function languageLabel(lang: string): string {
  const known = LANGUAGES[lang];
  if (known) return known.name;
  try {
    return new Intl.DisplayNames([lang], { type: "language" }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

/** The names of a book's languages, English first, when it has two or more. */
export function languagesLine(langs: string[]): string {
  const set = [...new Set(langs)].sort((a, b) =>
    a === "en" ? -1 : b === "en" ? 1 : byText(a, b),
  );
  return set.length > 1 ? set.map(languageLabel).join(", ") : "";
}

const STEM_DATE = /^(\d{4}-\d{2}-\d{2})/;

/** The newest date among a book's chapters, from their document stems (`<date>-<slug>`). */
export function bookDate(book: KbLibraryBook): string | null {
  let newest: string | null = null;
  for (const chapter of book.chapters)
    for (const variant of chapter.variants) {
      const m = STEM_DATE.exec(variant.doc);
      if (m && (newest === null || m[1] > newest)) newest = m[1];
    }
  return newest;
}

/** A book's state from the reader's progress (frame.md F54). */
export function bookState(
  progress: { finished: number; started: number } | undefined,
  total: number,
): ReadState {
  const done = progress?.finished ?? 0;
  if (total > 0 && done >= total)
    return { word: SHELF.state.finished, cls: "status status-done" };
  if (done > 0 || (progress?.started ?? 0) > 0)
    return { word: SHELF.state.ofBook(done, total), cls: "status" };
  return { word: SHELF.state.notStarted, cls: "status status-idle" };
}

/** A document's state: Finished, `Started, 42%` (the place's percentage, F100), or Not started. */
export function docState(
  position: { state: "started" | "finished"; fraction: number } | undefined,
): ReadState {
  if (position?.state === "finished")
    return { word: SHELF.state.finished, cls: "status status-done" };
  if (position?.state === "started") {
    const pct = Math.round(position.fraction * 100);
    return {
      word: pct ? SHELF.state.startedPct(pct) : SHELF.state.started,
      cls: "status",
    };
  }
  return { word: SHELF.state.notStarted, cls: "status status-idle" };
}

/** A loose document's reader address. */
export function documentHref(d: KbLibraryDocument): string {
  return readerHref({
    kind: "document",
    id: d.id,
    canonicalPath: d.canonical_path,
  });
}

export interface ShelvesOptions {
  format?: FormatOptions;
  /** Only this project's section (a project's page). */
  project?: string | null;
}

/**
 * The library's sections, one per project with something to read, in the listing's project order:
 * its books A to Z, then its documents newest first, five of them shown. `state` is the reader's
 * own (a member); null draws no reading state (a visitor).
 */
export function shelvesOf(
  listing: KbOrgLibrary,
  state: KbReaderLibrary | null,
  options: ShelvesOptions = {},
): ShelvesModel {
  const format = options.format ?? {};
  const org = orgSegment({ id: listing.org.id, slug: listing.org.slug });
  const progress = new Map(
    (state?.books ?? [])
      .filter((b) => b.org === listing.org.label)
      .map((b) => [`${b.project}/${b.book}`, b.progress] as const),
  );
  const positions = new Map(
    (state?.docs ?? [])
      .filter((d) => d.doc.org === listing.org.label)
      .map((d) => [`${d.doc.project}/${d.doc.doc}`, d.position] as const),
  );
  const member = state !== null;

  const names: string[] = listing.projects.map((p) => p.name);
  for (const x of [...listing.books, ...listing.documents])
    if (!names.includes(x.project)) names.push(x.project);
  const publicBy = new Map(
    listing.projects.map((p) => [p.name, p.visibility === "public"]),
  );
  const wanted = options.project
    ? names.filter((n) => n === options.project)
    : names;

  let books = 0;
  let docs = 0;
  const shelves: ShelfModel[] = [];
  for (const name of wanted) {
    const own = listing.books
      .filter((b) => b.project === name)
      .sort((a, b) => byText(a.title, b.title));
    const ownDocs = listing.documents
      .filter((d) => d.project === name)
      .sort(byDate);
    books += own.length;
    docs += ownDocs.length;
    if (own.length === 0 && ownDocs.length === 0) continue;
    shelves.push({
      key: `project:${name}`,
      project: name,
      name: nameBreaks(name),
      isPublic: publicBy.get(name) === true,
      count: LIBRARY_PAGE.countLine(own.length, ownDocs.length),
      books: own.map((b) => {
        const day = bookDate(b);
        return {
          key: `${b.project}/${b.slug}`,
          title: b.title,
          sub: b.sub?.trim() || null,
          subLang: secondTitleLang(b.sub?.trim(), b.sub_lang),
          href: bookHref({ org, project: b.project, book: b.slug }),
          chapters: SHELF.chapters(b.chapters.length),
          langs: languagesLine(
            b.chapters.flatMap((c) => c.variants.map((v) => v.lang)),
          ),
          state: member
            ? bookState(
                progress.get(`${b.project}/${b.slug}`),
                b.chapters.length,
              )
            : null,
          date: day ? date(day, format) : "",
        };
      }),
      docs: ownDocs.slice(0, SHELF_NEWEST).map((d) => ({
        key: `${d.project}/${d.doc}`,
        id: d.id,
        title: d.title,
        lang: d.lang || "en",
        href: documentHref(d),
        legacy: d.format === "html",
        state: member ? docState(positions.get(`${d.project}/${d.doc}`)) : null,
        date: date(d.date, format),
      })),
      docCount: ownDocs.length,
    });
  }
  return {
    shelves,
    books,
    docs,
    count: LIBRARY_PAGE.countLine(books, docs),
    empty: wanted.length - shelves.length,
  };
}

/**
 * Where a document matched the search: only a match in the text carries an excerpt, and only on
 * the page drawn (null for a row whose snippet this render did not read).
 */
export type DocMatch =
  { where: "title" | "tag" } | { where: "text"; excerpt: Cut | null };

/** One row of the documents table (`LibraryDocs`' `items`). */
export interface DocItem {
  id: number;
  key: string;
  title: string;
  lang: string;
  href: string;
  /** The project's name (the project column, the filter's value). */
  project: string;
  /** `Nov 14`. */
  date: string;
  tags: string[];
  match: DocMatch | null;
}

export type DocsPhase = "rows" | "empty" | "none";

/** One page of the documents table, and the lines about it. */
export interface DocsTable {
  items: DocItem[];
  phase: DocsPhase;
  /** Documents in scope (the filter's project, or every project). */
  total: number;
  /** Documents the search matched; null when nothing was searched. */
  matched: number | null;
  /** `240 documents`, `14 of 240 documents`, `0 of 132 documents`. */
  count: string;
  page: number;
  pages: number;
  /** `26–50 of 240`. */
  range: string;
  /** The filter as applied: a known project's name, else null (All projects). */
  filter: string | null;
}

/** What the table reads beside the listing: each document's tags, and the search's text matches. */
export interface DocsSource {
  tags: ReadonlyMap<number, readonly string[]>;
  /**
   * The documents whose text matched, by id: the search's snippet, or null when this render did not
   * read it (a row off the page). A snippet that marks nothing is no match (a match by meaning).
   * Null when nothing was searched.
   */
  text: ReadonlyMap<number, string | null> | null;
}

/** Each document's tags, from the listing itself (P63, OQ8: it carries every loose document's). */
export function listingTags(
  listing: KbOrgLibrary,
): ReadonlyMap<number, readonly string[]> {
  return new Map(listing.documents.map((d) => [d.id, d.tags ?? []]));
}

export interface DocsOptions {
  q?: string | null;
  filter?: string | null;
  page?: number;
  format?: FormatOptions;
}

/** Where `d` matched `q`: the title, then a tag, then the text (`LB.match`). */
export function matchOf(
  d: { id: number; title: string },
  tags: readonly string[],
  q: string,
  text: ReadonlyMap<number, string | null> | null,
): DocMatch | null {
  if (holds(d.title, q)) return { where: "title" };
  if (tags.some((t) => holds(t, q))) return { where: "tag" };
  if (!text?.has(d.id)) return null;
  const snippet = text.get(d.id);
  if (snippet == null) return { where: "text", excerpt: null };
  const excerpt = excerptOf(snippet, q);
  return excerpt ? { where: "text", excerpt } : null;
}

/**
 * The documents table at a page (F322): the loose documents of the org (or of the filter's
 * project), newest first; with a search, those whose title, tags or text hold it; 25 a page.
 */
export function docsTable(
  listing: KbOrgLibrary,
  source: DocsSource,
  options: DocsOptions = {},
): DocsTable {
  const q = (options.q ?? "").trim();
  const known = new Set([
    ...listing.projects.map((p) => p.name),
    ...listing.documents.map((d) => d.project),
  ]);
  const filter =
    options.filter && known.has(options.filter) ? options.filter : null;
  const scoped = listing.documents
    .filter((d) => !filter || d.project === filter)
    .sort(byDate);
  const rows = scoped.map((d) => {
    const tags = [...(source.tags.get(d.id) ?? [])];
    return {
      d,
      tags,
      match: q ? matchOf(d, tags, q, source.text) : null,
    };
  });
  const hits = q ? rows.filter((r) => r.match !== null) : rows;
  const win = pageWindow(hits.length, options.page ?? 1);
  const items: DocItem[] = hits.slice(win.from, win.to).map((r) => ({
    id: r.d.id,
    key: `${r.d.project}/${r.d.doc}`,
    title: r.d.title,
    lang: r.d.lang || "en",
    href: documentHref(r.d),
    project: r.d.project,
    date: date(r.d.date, options.format ?? {}),
    tags: r.tags,
    match: r.match,
  }));
  const phase: DocsPhase =
    scoped.length === 0 && !q ? "empty" : hits.length === 0 ? "none" : "rows";
  return {
    items,
    phase,
    total: scoped.length,
    matched: q ? hits.length : null,
    count: LIBRARY_PAGE.docsCount(scoped.length, q ? hits.length : null),
    page: win.page,
    pages: win.pages,
    range: rangeLine(win.page, hits.length),
    filter,
  };
}
