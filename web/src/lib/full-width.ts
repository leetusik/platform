/**
 * The chrome-less document view's URL contract (round 06 §4.4, P28.S7).
 *
 * The view is a QUERY ON THE DOCUMENT'S OWN URL — `?view=full` — and not a route
 * of its own. That is the whole security posture in one sentence: an HTML explainer
 * in the full-width view is the same page framing the same sandboxed opaque-origin
 * relay it already framed, so no new route serves document HTML on the app origin
 * and `next.config.ts` needs no new entry. It also makes the view linkable and makes
 * browser back its primary exit at every width.
 *
 * A plain module, deliberately: `full-width-exit.tsx` is a CLIENT island, and a
 * `"use client"` module's exports become client references that a server component
 * cannot call. P63 retired the last page that read the flag (the past-version page,
 * now a redirect); what is left is what the exit pill reads.
 */

/** The query key. */
export const VIEW_PARAM = "view";

/**
 * The attribute the "Full width" control carries on all three document surfaces.
 * Leaving the view hands focus back to it (§6), and the exit pill finds it by this.
 */
export const FULL_WIDTH_LINK_ATTR = "data-kb-fullwidth-link";
