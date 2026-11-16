import "server-only";

import { HI2VI_STATES } from "@/content/hi2vi-states";
import { READER_DOCUMENT } from "@/content/reader-document";
import { DocumentOriginal, DocumentReader } from "@/hi2vi/reader/document";
import { documentMarks, type DocMark } from "@/hi2vi/reader/document/model";
import { ChapterBody } from "@/hi2vi/reader/body/body";
import { ApiError } from "@/lib/knowledge/client";
import type { LoadedReader, ReaderLoad } from "@/lib/reader/load";

/**
 * P63-fk.S12 — what both addresses of a loose document render (`/documents/<id>` and
 * `/@<org>/<project>/<slug>`), once the page has read it:
 *
 *  - an html document, or an html version (`loadLooseReader`'s `kind: "legacy"`), opens in its Original layout
 *    (`DocumentOriginal`, P63-fk.S13): the document page's frame around the html as it renders today. The org of a
 *    visitor's way back is the address's, else the document's own write target's;
 *  - a Markdown or native document opens in the Library's reader (`DocumentReader`), its text the Library's
 *    body (`ChapterBody`). Its marks follow its format (OQ14, `documentMarks`): a Markdown document's Notes
 *    sheet is DocumentNotes (bookmarks only), so the text is handed over with no annotation layer; a native one
 *    keeps the layer, whose own Notes body fills the sheet.
 */
export function renderDocument(
  loaded: ReaderLoad,
  p: {
    from: string | null;
    org: string | null;
    nonce?: string;
    timeZone?: string;
  },
) {
  if (loaded.kind === "legacy") {
    const legacy = loaded.legacy;
    // Keyed by what is on screen (the document and its version), as the legacy reader was: another version
    // starts the frame, its bridge and its place fresh.
    return (
      <DocumentOriginal
        key={`${legacy.docId}:${legacy.view.version}`}
        view={legacy.view}
        frame={legacy.frame}
        marks={legacy.marks ?? []}
        from={p.from}
        org={p.org ?? legacy.view.write?.org ?? null}
        nonce={p.nonce}
        timeZone={p.timeZone}
      />
    );
  }
  const reader = loaded.reader;
  const marks = documentMarks(reader);
  const body: LoadedReader =
    marks === "bookmarks" ? { ...reader, notes: null } : reader;
  const bookmarks: DocMark[] =
    marks === "bookmarks"
      ? (reader.notes?.bookmarks ?? []).map((b) => ({
          id: b.id,
          block: b.block,
          at: b.at,
          fraction: b.fraction,
          label: b.label,
          pos: b.pos,
          lang: b.lang,
          version: b.version,
        }))
      : [];
  // Keyed by the version on screen, so another version starts the frame fresh (folded, from the top).
  return (
    <DocumentReader
      key={`${reader.docId}:${reader.view.version}`}
      view={reader.view}
      marks={marks}
      bookmarks={bookmarks}
      from={p.from}
      org={p.org}
      nonce={p.nonce}
      timeZone={p.timeZone}
    >
      <ChapterBody reader={body} />
    </DocumentReader>
  );
}

/** `notFound()`'s throw (Next marks it with this digest). */
export function isNotFound(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.endsWith(";404");
}

/** The tab's title when the page could not read its document: Document not found (a miss), or Error. */
export function missTitle(error: unknown): string {
  const miss =
    error instanceof ApiError && (error.status === 404 || error.status === 400);
  return isNotFound(error) || miss
    ? READER_DOCUMENT.notFound.title
    : HI2VI_STATES.error.title;
}

export function firstOf(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? null : v;
}
