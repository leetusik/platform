"use client";

import type { CSSProperties, ReactNode } from "react";

import { Legacy } from "@/hi2vi/ui";
import { schemeFor, type ReaderSettings } from "@/lib/reader-cookie";

import "@/app/reader-fonts.css";
import "@/app/reader.css";
import "@/app/review.css";

/**
 * THE BRIDGE (P64-3y.S7; the end of a session until S9 rebuilds it, and a card in a form job 07 does not draw,
 * P64-3y.S8): an old in-flow view of `/review` inside the new focused frame, as P63-fk's reader bridged its body
 * (`hi2vi/reader/old-root.tsx`).
 * The old card and end read the old review page's root around them, so here they get one:
 *
 *   Legacy ([data-ui-legacy]: no rule of the system reaches in)
 *     > div.rd-root.rd-size-N[data-md-color-scheme] (the old tokens, text sizes and schemes of `app/reader.css`,
 *       from the same `kb_reader` settings as the frame)
 *       > div (the `rd` size container the old `@container rd` rules measure; `main.rd-page` was it)
 *         > the old view
 *
 * The inline declarations undo what the old root does to a whole page and must not do inside the frame's
 * column: its `min-height: 100dvh` and its background (the frame paints Review's ground). Nothing here is fixed
 * to the window: the old bar, line, scrim, sheets and toast are gone from the page.
 */
const UNDO_PAGE: CSSProperties = { minHeight: 0, background: "transparent" };
const RD_CONTAINER: CSSProperties = {
  containerType: "inline-size",
  containerName: "rd",
};

export function OldView({
  settings,
  children,
}: {
  settings: ReaderSettings;
  children: ReactNode;
}) {
  return (
    <Legacy>
      <div
        className={`rd-root rd-size-${settings.size}`}
        data-md-color-scheme={schemeFor(settings.theme)}
        data-theme-choice={settings.theme}
        style={UNDO_PAGE}
      >
        <div style={RD_CONTAINER}>{children}</div>
      </div>
    </Legacy>
  );
}
