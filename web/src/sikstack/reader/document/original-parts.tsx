import type { Ref } from "react";

import { READER } from "@/content";
import { READER_FRAME } from "@/content/reader-frame";
import { READER_ORIGINAL } from "@/content/reader-original";
import { LEGACY_SANDBOX } from "@/lib/legacy/messages";
import type { ThemeChoice } from "@/lib/reader-cookie";
import type { LegacyMark } from "@/lib/reader/load";
import type { ReaderWrite } from "@/lib/reader/types";

import type { DocMark } from "./model";

/**
 * The parts and rules of an html document in its Original layout (P63-fk.S13; job 03, Library round 02:
 * `## Build` § Page: document, the state **Original layout**: "the tag in the bar and the head, then the
 * stand-in; no text, no end"). The record draws only a stand-in where the original html sits; the html is
 * kept exactly as it renders today (`09-legacy-and-print`, P30.S25): the same sandboxed frame of the raw
 * relay, the same bridge, the same scripts policy, the frame the only scroller of the document.
 */

// ---- the tag ---------------------------------------------------------------------------------------------------

/**
 * The head on such a document is `ReaderHead`'s (`ReaderHead.dc.html`, `head.original`) with its `tag`: the title,
 * the facts, the Older version notice, then `<p><span class="badge">Original layout</span></p>`. An html document
 * has no lede and no sections (the parent never reads the framed document), so nothing follows the tag.
 */
/** The bar's tag (`Document.dc.html`): `Older version` while an earlier version is read, else `Original layout`. */
export function originalTag(version: number, newest: number): string {
  return version < newest ? READER_FRAME.tag.olderVersion : READER_ORIGINAL.tag;
}

// ---- the frame: today's element, unchanged -------------------------------------------------------------------

/** The frame's id: the skip target it always was (`legacy-reader.tsx`'s `FRAME_ID`). */
export const ORIGINAL_FRAME_ID = "legacy-document";

/** The reader's dark: Dark, or System on a dark device (sepia is light). */
export function readerDark(theme: ThemeChoice, os: "light" | "dark"): boolean {
  return theme === "dark" || (theme === "system" && os === "dark");
}

/**
 * The sandboxed frame of the raw relay, exactly as the legacy reader drew it: its id, its classes (the
 * document's own dark ground only when it has a dark look of its own, `look: "auto"`), the relay's address,
 * `LEGACY_SANDBOX` (scripts and popups, never same-origin), its name, `referrerPolicy`, the ring while focus
 * came by keyboard, and the colour scheme the document is asked for.
 */
export function OriginalFrame({
  src,
  title,
  look,
  dark,
  ring,
  frameRef,
  onLoad,
}: {
  src: string;
  /** The document's title: the frame is named `<title>, in its original layout`. */
  title: string;
  look: "auto" | "light";
  dark: boolean;
  ring: boolean;
  frameRef?: Ref<HTMLIFrameElement>;
  onLoad?: () => void;
}) {
  const docDark = look === "auto" && dark;
  return (
    <iframe
      ref={frameRef}
      id={ORIGINAL_FRAME_ID}
      className={docDark ? "lg-docframe lg-docframe--dark" : "lg-docframe"}
      src={src}
      sandbox={LEGACY_SANDBOX}
      title={READER.legacy.frameLabel(title)}
      referrerPolicy="same-origin"
      data-ring={ring ? "1" : undefined}
      style={{ colorScheme: dark ? "dark" : "light" }}
      onLoad={onLoad}
    />
  );
}

// ---- the bridge's scroll, as the page reads it -------------------------------------------------------------

/** What the page keeps between the bridge's `scroll` messages. */
export interface OriginalScroll {
  /** The document's last scroll position (CSS px); null before the first message. */
  y: number | null;
  /** The next message is where a restore landed: `pill` names a resume (the foot's pill shows). */
  landing: "pill" | "quiet" | null;
  /** The foot's pill (`Picked up where you left off`) is up. */
  pill: boolean;
}

export const ORIGINAL_SCROLL: OriginalScroll = {
  y: null,
  landing: null,
  pill: false,
};

/**
 * One `scroll` message (`{fraction, y, anchor}`, `@/lib/legacy/messages`), inside the quiet window after a
 * restore or not:
 *
 * - `sample` is what the reading memory hears, exactly the legacy reader's `{fraction, anchor}`
 *   (`useLegacyReading`, unchanged: its cadence, its finish at the end, its beacon);
 * - the landing message puts the pill up after a resume (F100: the page opens at the place that was kept);
 * - the reader's first scroll after it drops the pill (`Document.dc.html`: "so does the reader's first
 *   scroll");
 * - `down`: the reader scrolled down inside the document (not a restore's own messages), so the head gives
 *   the window to the document (the page brings the frame up under the bar).
 */
export function originalScroll(
  s: OriginalScroll,
  msg: { fraction: number; y: number; anchor: string | null },
  quiet: boolean,
): {
  next: OriginalScroll;
  sample: { fraction: number; anchor: string | null };
  down: boolean;
} {
  const sample = { fraction: msg.fraction, anchor: msg.anchor };
  if (s.landing) {
    return {
      next: { y: msg.y, landing: null, pill: s.landing === "pill" || s.pill },
      sample,
      down: false,
    };
  }
  const moved = s.y !== null && msg.y !== s.y;
  return {
    next: { y: msg.y, landing: null, pill: s.pill && (quiet || !moved) },
    sample,
    down: !quiet && s.y !== null && msg.y > s.y,
  };
}

// ---- bookmarks: the legacy reader's writes, the document page's rows ----------------------------------------

/**
 * A bookmark of an html document, as the legacy reader wrote it (`saveBookmark`'s input, byte for byte): the
 * reader's write target, the id, the version on screen, the bridge's place (with its anchor when the document
 * reported one) and no snippet (the parent never reads the framed text).
 */
export function originalBookmarkWrite(a: {
  write: ReaderWrite;
  id: string;
  version: number;
  place: { fraction: number; anchor: string | null };
}) {
  return {
    ...a.write,
    id: a.id,
    version: a.version,
    anchor: a.place.anchor
      ? { fraction: a.place.fraction, anchor: a.place.anchor }
      : { fraction: a.place.fraction },
    snippet: "",
  };
}

/** A kept bookmark as the Notes sheet's rows read it (`DocMark`): always a position. */
export function docMarkOf(m: LegacyMark): DocMark {
  return {
    id: m.id,
    block: null,
    at: null,
    fraction: m.fraction,
    label: m.label,
    pos: true,
    lang: m.lang,
    version: m.version,
  };
}
