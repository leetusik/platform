"use client";

import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Legacy } from "@/sikstack/ui";
import {
  DEFAULT_READER_SETTINGS,
  schemeFor,
  type ReaderSettings,
} from "@/lib/reader-cookie";

import "@/app/reader-fonts.css";
import "@/app/reader.css";

/**
 * THE BRIDGE (P63-fk.S8, until the reader chain rebuilds the body): the old body of a text inside the
 * new reader's frame. The text (`ChapterView`), its blocks, terms, quiz, highlights and notes were the old
 * components (S9, S10 and S11 rebuilt most of them); what still sits in it (the print masthead and colophon, the
 * body's islands) reads `app/reader.css`, so the import stays. The old Listen slot and player left in P64-3y.
 * What it holds reads the old reader's root around it, so here it gets one:
 *
 *   Legacy ([data-ui-legacy]: no rule of the system reaches in)
 *     > div.rd-root.rd-size-N[data-md-color-scheme] (the old tokens, the text sizes and the schemes
 *       of `app/reader.css`, from the same `kb_reader` settings as the frame; `math-layer` and
 *       `scroll-box` watch its class; the annotation layer left it in P63-fk.S11)
 *       > the old body
 *
 * Two inline declarations undo what the old root does to a whole page and must not do inside the
 * frame's column: `min-height: 100dvh` and its background (the frame paints the reader's ground).
 * The old sheets are imported here, as the old frame did, until the last slice of the chain drops them.
 */
export interface OldBodyValue {
  settings: ReaderSettings;
  /**
   * P64-3y.F4 — the reader's top bar's real height in px (`./frame-measure` `useReaderTopBar`; null until measured).
   * The old sheet lands an island's `[id]` under its own bar's height (`--rd-top-h`, one row: 3.5rem); the frame's
   * `--reader-top-h` stops at the old-page boundary, so the root is given the measured height as that name.
   */
  topH?: number | null;
}

export const OldBodyContext = createContext<OldBodyValue | null>(null);

const UNDO_PAGE: CSSProperties = { minHeight: 0, background: "transparent" };
/**
 * `still` (P63-fk.S9): the root and its boundary add no box (`display: contents`). The old tokens, the text size and
 * the scheme still reach what it holds (inherited through), but it is neither a block of the column nor a
 * positioning box: an island inside the Library's body, and the layers' root beside it, whose floating parts are
 * placed against the reader's article (`.blocks-host`), as the old article placed them.
 */
const STILL: CSSProperties = { ...UNDO_PAGE, display: "contents" };
const NO_BOX: CSSProperties = { display: "contents" };

export function OldRoot({
  still = false,
  children,
}: {
  /** No box of its own (`display: contents`): see `STILL`. */
  still?: boolean;
  children: ReactNode;
}) {
  const value = useContext(OldBodyContext);
  const settings = value?.settings ?? DEFAULT_READER_SETTINGS;
  const className = `rd-root rd-size-${settings.size}`;
  const base = still ? STILL : UNDO_PAGE;
  const style: CSSProperties = value?.topH
    ? ({ ...base, "--rd-top-h": `${value.topH}px` } as CSSProperties)
    : base;
  return (
    <Legacy style={still ? NO_BOX : undefined}>
      <div
        className={className}
        data-md-color-scheme={schemeFor(settings.theme)}
        data-theme-choice={settings.theme}
        style={style}
      >
        {children}
      </div>
    </Legacy>
  );
}
