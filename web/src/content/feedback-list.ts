// The Feedback list's own words (job 04 round 02: `Feedback.dc.html`, `FeedbackList.dc.html`,
// `FeedbackListStates.dc.html`; `result.md` § The list; the fixture's `FB.noMatch`). Every string is the
// boards', verbatim. The words every Feedback surface shares (the title, the bar, the columns, the
// count's units, `No such view`, `Back to Feedback`) are `@/content/feedback-frame`'s. Imported by its own
// path, never through `content/index.ts`.

/** No such view's sentence (`Feedback.dc.html`): the org's name at its end. */
export const noSuchViewText = (orgName: string) =>
  `That filter doesn’t match a project or a rating in ${orgName}.`;

/** What stands in place of the rows (`FeedbackList.dc.html`, F132, F141). */
export const LIST_BODY = {
  /** No feedback yet: the sentence, then its unbroken end. */
  none: {
    before: "No feedback yet. Your product sends it here with a ",
    key: "Capture only key.",
  },
  /** No projects in the org: Overview is a link to org home, never parted from its comma. */
  noProjects: {
    before: "No projects yet. Create one on ",
    overview: "Overview",
    comma: ",",
    middle: " then send feedback with its ",
    key: "Capture only key.",
  },
  failed: "Feedback did not load.",
  retry: "Try again",
} as const;

/** The count line while a request is out (`Feedback.dc.html`): a bar, and this for a screen reader. */
export const LOADING = "Loading…";

/**
 * No match (`FB.noMatch`), in its three forms: a search alone, a search with filters, filters alone.
 * `filters` is how many of the project and rating filters are set.
 */
export function noMatch(q: string, filters: number): string {
  const text = q.trim();
  const which = filters === 1 ? "this filter" : "these filters";
  if (text)
    return `No feedback contains “${text}”${filters ? ` with ${which}` : ""}.`;
  return `No feedback matches ${which}.`;
}
