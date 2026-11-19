// Documents-surface copy (P12.S5) — the per-tenant knowledge viewer: browse + search
// the tenant's documents, and read one (rendered markdown). P21 adds the member
// delete action (list rows + the read page's member branch). Copy-as-data per the S1
// convention: the pages never hardcode strings inline.
//
// As in `project.ts` / `auth.ts`, the form error copy is keyed by HTTP STATUS, never
// by knowledge's `detail` text — the text is a server-side implementation detail.

/**
 * Status-keyed delete-document error copy (P21.S2), mirroring
 * `REVOKE_CREDENTIAL_ERRORS`.
 *
 * `notFound` covers BOTH of the backend's 404 cases — a document that is already
 * gone and one belonging to another org — because the endpoint answers them
 * identically (404-never-403, so ids cannot be probed). One member CAN see another
 * org's public document on the read page; deleting it lands here.
 */
export const DELETE_DOCUMENT_ERRORS = {
  /** A tampered/garbled hidden input, or knowledge's 400/422 on a non-integer id. */
  invalidRequest:
    "Could not delete that document. Reload the page and try again.",
  /** 401 — the session died mid-request; the next navigation bounces to /login. */
  sessionExpired: "Your session has expired. Sign in again to continue.",
  /** 404 — already deleted, or not part of your org. */
  notFound: "That document no longer exists, or it isn't part of your org.",
  /** 5xx / network / anything else. */
  generic: "Could not delete the document. Please try again.",
} as const;

export const DOCUMENTS = {
  read: {
    /** The floating exit pill's visible label in the chrome-less view (`full-width-exit.tsx`). */
    fullWidthExit: "Exit full width",
  },
} as const;
