"use client";

import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Legacy } from "@/hi2vi/ui";
import {
  DEFAULT_READER_SETTINGS,
  schemeFor,
  type ReaderSettings,
} from "@/lib/reader-cookie";

import "@/app/reader-fonts.css";
import "@/app/reader.css";

/**
 * THE BRIDGE (P63-fk.S8, until the reader chain rebuilds the body): the old body of a text inside the
 * new reader's frame. The text (`ChapterView`), its blocks, terms, quiz, highlights and notes, and the
 * Listen slot and player are still the old components (S9, S10 and S11 rebuild them; Listen keeps its old
 * look, operator decision 3). They read the old reader's root around them, so here they get one:
 *
 *   Legacy ([data-ui-legacy]: no rule of the system reaches in)
 *     > div.rd-root.rd-size-N[data-md-color-scheme] (the old tokens, the text sizes and the schemes
 *       of `app/reader.css`, from the same `kb_reader` settings as the frame; the annotation layer
 *       portals its bottom slot here, `math-layer` and `scroll-box` watch its class)
 *       > the old body, then `after` (the Listen slot and the player: `position: fixed`, placed against
 *         the window, since no ancestor of this root has a transform or layout containment).
 *
 * Two inline declarations undo what the old root does to a whole page and must not do inside the
 * frame's column: `min-height: 100dvh` and its background (the frame paints the reader's ground).
 * The old sheets are imported here, as the old frame did, until the last slice of the chain drops them.
 */
export interface OldBodyValue {
  settings: ReaderSettings;
  /** A Listen is docked (the store's), so the old slot lifts what it holds above the dock. */
  docked: boolean;
  /** Rendered after the body, inside the old root: the Listen slot and the player. */
  after?: ReactNode;
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
  slot = true,
  still = false,
  children,
}: {
  /** Render the frame's `after` (the Listen slot and the player) after the children; once a page. */
  slot?: boolean;
  /** No box of its own (`display: contents`): see `STILL`. */
  still?: boolean;
  children: ReactNode;
}) {
  const value = useContext(OldBodyContext);
  const settings = value?.settings ?? DEFAULT_READER_SETTINGS;
  const className = [
    "rd-root",
    `rd-size-${settings.size}`,
    value?.docked ? "lx-docked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Legacy style={still ? NO_BOX : undefined}>
      <div
        className={className}
        data-md-color-scheme={schemeFor(settings.theme)}
        data-theme-choice={settings.theme}
        style={still ? STILL : UNDO_PAGE}
      >
        {children}
        {slot ? value?.after : null}
      </div>
    </Legacy>
  );
}
