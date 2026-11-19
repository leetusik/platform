// One piece of feedback's own words (job 04 round 02, `FeedbackItem.dc.html`, `FeedbackItemComments*`,
// `FeedbackItemFiles*`; frame.md F121 to F124, F132): what only the item page says. The words every
// Feedback surface shares (the parts' names, the labels, Unknown author, Untitled file, the empty
// sentences, `zoneMeta`) are `@/content/feedback-frame`'s; Error's title, sentence, Try again and
// reference are the shared states' (`@/content/hi2vi-states`). Verbatim from the boards. Imported by
// its own path, never through `content/index.ts`.

/** The message's panel has no head; its accessible name (`section.panel[aria-label=Message]`). */
export const MESSAGE = "Message";

/** What a screen reader hears while the page or a part loads (`.sr-only`). */
export const LOADING = "Loading…";

/** Attachments' last column head, for a screen reader only (`th.at-end > .sr-only`). */
export const ACTION = "Action";

/** At a part's head (F121): `3 comments`, `1 comment`, `2 files`. An empty part has no count. */
export const COUNT = {
  comment: { one: "comment", many: "comments" },
  file: { one: "file", many: "files" },
} as const;

/** Download's accessible name: `Download search-miss.png`, `Download untitled file` (the Files board). */
export const downloadName = (name: string | null | undefined) =>
  `Download ${name || "untitled file"}`;

/** Feedback not found's sentence (F132), naming the org. */
export const notFoundText = (orgName: string) =>
  `This feedback doesn’t exist, or it isn’t part of ${orgName}.`;

/**
 * The Details head's meta while the viewer's zone is not yet known (a first visit, before the time-zone
 * cookie is set; every time on the page is then in UTC). The record draws only the known case,
 * `Local time, GMT+9` (`zoneMeta`); this is the nearest true wording (new; P65-nh.S5's Operator
 * Question, the default taken).
 */
export const ZONE_UNKNOWN = "Times in UTC";
