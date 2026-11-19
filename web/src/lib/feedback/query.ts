// The Feedback API's query string, as a PURE module (no `server-only`, no React)
// so the server reads and the Node tests both import it.

import type { FeedbackQuery } from "./types";

/**
 * The API query string: blanks omitted (never sent), values trimmed, no `?` when
 * empty. `URLSearchParams` does all the escaping; encoding on top of it would
 * double-encode (`결제` → `%25EA…`).
 */
export function feedbackQueryString(params: FeedbackQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const raw = typeof value === "string" ? value.trim() : String(value);
    if (raw === "") continue;
    search.set(key, raw);
  }
  const query = search.toString();
  return query === "" ? "" : `?${query}`;
}
