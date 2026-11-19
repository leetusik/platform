import "server-only";

import { HI2VI_STATES } from "@/content/hi2vi-states";
import { READER_DOCUMENT } from "@/content/reader-document";
import { DocumentOriginal, DocumentReader } from "@/hi2vi/reader/document";
import { documentMarks, type DocMark } from "@/hi2vi/reader/document/model";
import { ChapterBody } from "@/hi2vi/reader/body/body";
import { ApiError } from "@/lib/knowledge/client";
import { docSeed, readListenState } from "@/lib/listen/seed";
import type { ListenSeed } from "@/lib/listen/types";
import { readerHref } from "@/lib/reader-href";
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
 *
 * P64-3y.S6 (job 07, round 01: `## Build` › Listen, F206): a Markdown or native document has Listen, its seed read
 * by the page (`documentListen`) and mounted by the reader in ReaderHead's slot. The html original never has
 * Listen (P63-fk OQ22): it is handed no seed, whatever the page passes.
 */
export function renderDocument(
  loaded: ReaderLoad,
  p: {
    from: string | null;
    org: string | null;
    nonce?: string;
    timeZone?: string;
    /** The document's Listen seed (`documentListen`); the reader's only. */
    listen?: ListenSeed | null;
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
        orgName={legacy.orgName ?? null}
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
      orgName={reader.orgName ?? null}
      nonce={p.nonce}
      timeZone={p.timeZone}
      listen={p.listen ?? null}
    >
      <ChapterBody reader={body} />
    </DocumentReader>
  );
}

/**
 * The document's Listen seed, in one read (`GET /app/listen/state` by the document's write key), after the load: only for a member (Listen's routes are session-only), on the reader (never the html original), on the
 * newest version (an older version's text is not the audio's; F206 draws no Listen there), with a key to read by
 * (a tenant with no org slug has none). The server decides what can be read aloud: a document it reports
 * `unavailable`, and any miss or fault, is no Listen (`readListenState`), so the page never fails over it.
 */
export async function documentListen(
  loaded: ReaderLoad,
  token: string | undefined,
): Promise<ListenSeed | null> {
  if (!token || loaded.kind !== "reader") return null;
  const view = loaded.reader.view;
  const write = view.write;
  if (!view.member || !write || view.version < view.newest) return null;
  const key = { org: write.org, project: write.project, doc: write.doc };
  const state = await readListenState(token, key);
  return docSeed(view, state, key, readerHref(view.target));
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
