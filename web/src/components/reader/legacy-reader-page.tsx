import type { LoadedLegacy } from "@/lib/reader/load";

import { LegacyReader } from "./legacy-reader";

/**
 * P30.S25 — an html explainer in the legacy reader (`09-legacy-and-print`). Keyed by what
 * is on screen (the document and its version), so opening another chapter, language or
 * version starts it fresh: the frame, the bridge's place, the pill and the hold all end
 * with the view.
 *
 * P63-fk.S13: only an html CHAPTER of a book opens here now (`books/[book]/[chapter]/page.tsx`); an html
 * document opens in its Original layout on the Library's frame (`@/sikstack/reader/document` `DocumentOriginal`).
 */
export function LegacyReaderPage({
  legacy,
  timeZone,
}: {
  legacy: LoadedLegacy;
  /** The viewer's zone (`viewerTimeZone`), for the Version history's dates (D5). */
  timeZone: string | undefined;
}) {
  return (
    <LegacyReader
      key={`${legacy.docId}:${legacy.view.version}`}
      view={legacy.view}
      frame={legacy.frame}
      timeZone={timeZone}
    />
  );
}
