// hi2vi's own feedback control: its words, word for word from the signed `08-landing-diagram-feedback`
// round `01-landing-diagram-feedback` (`result.md` `## Build` §2 and §5; `frame.md` F400 to F405;
// `SendFeedback.dc.html`). English only, like the landing. The sentences that carry a value are
// functions, so the count, the limit and the reply address are built from one source; every number
// reads with F2's grouping (`1,923`), the record's `[LIMIT]` being the build's number (frame:Q1).

/** A number as the record writes it: `1,923`, `2,000`. */
export function feedbackNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export const SEND_FEEDBACK = {
  /** The trigger, on both pages (F400, F407). */
  trigger: "Send feedback",
  /** The dialog's title and accessible name, then the sent view's (F400, F405). */
  title: "Feedback about hi2vi",
  sentTitle: "Feedback sent",
  /** The fields (F403). */
  message: "Message",
  email: "Email for a reply",
  optional: "Optional",
  /** A signed-in user's line in place of the email field: "Sends as june@example.com." */
  sendsAs: (account: string): string => `Sends as ${account}.`,
  /** The message's count (F401), shown from nine tenths of the limit: "1,923 of 2,000 characters". */
  count: (n: number, limit: number): string =>
    `${feedbackNumber(n)} of ${feedbackNumber(limit)} characters`,
  /** The actions (F400) and Send's pending label. */
  cancel: "Cancel",
  send: "Send",
  sending: "Sending…",
  done: "Done",
  /** The sent view's line (F405): with an address to reply to, or without. */
  sentReply: (email: string): string =>
    `Thank you. A reply would come to ${email}.`,
  sentPlain: "Thank you.",
  /** The notices after a send (F405), at the top of the kept form. */
  failed: "Could not send your feedback. Try again.",
  /** `refused`, a visitor: too many from this address. */
  refusedVisitor: "Too many messages from here for now. Try again later.",
  /** `refused`, a signed-in user: the account's limit. */
  refusedAccount: "Too many messages for now. Try again later.",
  /** `refused-site`, a visitor only: the site's daily ceiling. */
  refusedSite: "hi2vi has had too many messages today. Try again tomorrow.",
  /** The check's sentences (F404), each under its field. */
  messageEmpty: "Enter a message.",
  messageLong: (limit: number): string =>
    `Messages must be ${feedbackNumber(limit)} characters or fewer.`,
  emailNotOne: "Enter one email address, or leave it empty.",
} as const;

export type SendFeedbackCopy = typeof SEND_FEEDBACK;
