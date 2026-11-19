import type { CSSProperties } from "react";

/**
 * An image's ratio as the Library's body draws it (`.blocks-fig-media`'s `--fig-w` / `--fig-h`; job 03 round 02,
 * `BlocksFigure.dc.html`). Pure and not a client module: `lib/native/render.tsx` calls it while the server renders
 * a chapter, and a function exported from a `"use client"` file cannot be called on the server.
 */

/** The ratio a place keeps when the version's asset map gives no size (the old box's 16:9; `md` has none). */
const FALLBACK = { w: 1600, h: 900 };

/** The custom properties of an image's ratio. */
export function ratioOf(w: number | null, h: number | null): CSSProperties {
  return {
    "--fig-w": w ?? FALLBACK.w,
    "--fig-h": h ?? FALLBACK.h,
  } as CSSProperties;
}
