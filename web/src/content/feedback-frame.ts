// The words of the Feedback frame (src/hi2vi/feedback/, lib/feedback/format.ts): the glossary every
// Feedback surface shares. Verbatim from job 04 round 02's ledger (frame.md F121 to F124, F128, F145,
// F341 to F344) and its fixture's `FW` (`LABELS`, `WORDS`, `RATING`). A page's own sentences live in
// its own `content/feedback-<part>.ts`. Imported by its own path, never through `content/index.ts`.

/** The part's name, a list's `h1` and the way back (`.back`) from one piece of feedback (F121). */
export const FEEDBACK = "Feedback";

/** The way back in an error or a not-found block (F121). */
export const BACK_TO_FEEDBACK = "Back to Feedback";

/** One piece of feedback's `h1` (F121): `Feedback on platform`, or `Feedback` with no project. */
export const itemHeading = (project: string | null | undefined) =>
  project ? `Feedback on ${project}` : FEEDBACK;

/** The not-found titles (F121). */
export const NOT_FOUND = {
  view: "No such view",
  item: "Feedback not found",
} as const;

/** A rating's word (F122): `feedback_value` 1, 2 and null. */
export const RATING = {
  liked: "Liked",
  disliked: "Disliked",
  unrated: "Unrated",
} as const;

/** The search and filters (F121, F128). There is no filter for unrated. */
export const FILTER = {
  /** The form's and the field's accessible name. */
  search: "Search feedback",
  placeholder: "e.g. 결제 or checkout",
  submit: "Search",
  clear: "Clear",
  clearLabel: "Clear search and filters",
  project: "Project",
  allProjects: "All projects",
  rating: "Rating",
  anyRating: "Any rating",
  liked: "Liked",
  disliked: "Disliked",
} as const;

/** The list's columns (F121, F145: Product, not Source). */
export const COLUMNS = {
  rating: "Rating",
  feedback: "Feedback",
  project: "Project",
  product: "Product",
  when: "When",
} as const;

/** The list's pager's name (F340). */
export const PAGES_LABEL = "Feedback pages";

/** One piece of feedback's parts, in their order on the page (F121, F142, F341). */
export const PARTS = {
  comment: "Comment",
  agenda: "Agenda",
  details: "Details",
  operatorComments: "Operator comments",
  attachments: "Attachments",
} as const;

/** A comment with no author, a file with no name (F121). */
export const UNKNOWN_AUTHOR = "Unknown author";
export const UNTITLED_FILE = "Untitled file";

/** Attachments' columns and its action (F121). */
export const FILE_COLUMNS = {
  file: "File",
  type: "Type",
  size: "Size",
} as const;
export const DOWNLOAD = "Download";

/** The details' labels, in their order (F121, `FW.LABELS`). */
export const LABELS = {
  project: "Project",
  value: "Rating",
  product: "Product",
  integration: "Integration",
  channel: "Channel",
  recordedBy: "Recorded by",
  triggerType: "Trigger",
  targetType: "Target type",
  targetRole: "Target role",
  conversation: "Conversation",
  session: "Session",
  user: "End user",
  eventAt: "Happened at",
  at: "Captured at",
  rid: "Record ID",
  triggerMessage: "Trigger message",
  targetText: "Target text",
  tags: "Tags",
  triggerMeta: "Trigger metadata",
  sourceMeta: "Source metadata",
  attributes: "Attributes",
  messages: "Messages",
  usedContext: "Used context",
} as const;

/** The closed sets, as words (F121, `FW.WORDS`). A free string the caller sent is shown as written. */
export const WORDS = {
  recordedBy: { agent: "Agent", human: "Human" },
  trigger: {
    like: "Like",
    dislike: "Dislike",
    comment: "Comment",
    rating: "Rating",
    survey: "Survey",
    manual: "Manual",
    other: "Other",
  },
  target: {
    message: "Message",
    conversation: "Conversation",
    surface: "Surface",
  },
} as const;

/** An absent value (F124): F2's dash, and what a screen reader hears. */
export const ABSENT = {
  mark: "—",
  label: "Not recorded",
} as const;

/** A part with nothing in it (F124). */
export const EMPTY = {
  comment: "No comment.",
  operatorComments: "No operator comments yet.",
  attachments: "No attachments.",
} as const;

/** The count line's units (F343): `230 pieces of feedback` at rest, `12 matches` under a search or a filter. */
export const COUNT = {
  total: { one: "piece of feedback", many: "pieces of feedback" },
  matches: { one: "match", many: "matches" },
} as const;

/** The zone, said once on an item's page as the Details head's meta (F123): `Local time, GMT+9`. */
export const zoneMeta = (label: string) => `Local time, ${label}`;

/** A change the web made that the workspace has not taken yet (F45, F344). */
export const WAITING = "Waiting for sync";
