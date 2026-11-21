// The feedback control's own check, shared by the dialog (on Send) and the server
// (before anything is counted or posted), so a tampered client gets the answer an
// honest one would. Pure and free of `server-only`: it holds no key and reads no env,
// so a client island may import it. The server stays the authority.

/** What a send of sikstack's own feedback control answers. */
export type SendFeedbackResult =
  | { status: "sent" }
  | { status: "failed" }
  /** Too many messages for now: from this address (a visitor), or this account. */
  | { status: "refused" }
  /** The landing's site-wide daily ceiling is reached (a visitor only). */
  | { status: "refused-site" }
  | {
      status: "invalid";
      field: "message" | "email";
      reason: "empty" | "too-long" | "not-one";
    };

export type InvalidFeedback = Extract<
  SendFeedbackResult,
  { status: "invalid" }
>;

/** The longest address the email rule accepts (the API's own account rule). */
const MAX_EMAIL_LENGTH = 254;
/** Characters that name a second address, a display name or a group. */
const FORBIDDEN_EMAIL_CHARS = new Set([...',;:<>()[]"\\']);

/**
 * A message's length as the control counts it: the message trimmed at its ends, in
 * Unicode code points (`Array.from`), so an emoji or a Hangul syllable counts once
 * and the count matches what is sent.
 */
export function messageLength(message: string): number {
  return Array.from(message.trim()).length;
}

/** Why a message is refused, or `null`: empty after trim, or past `limit` code points. */
export function checkMessage(
  message: unknown,
  limit: number,
): "empty" | "too-long" | null {
  if (typeof message !== "string" || message.trim() === "") return "empty";
  if (messageLength(message) > limit) return "too-long";
  return null;
}

/**
 * True when `value` (already trimmed) is exactly one plain email address: the
 * syntactic part of the API's account rule (`server/email_address.py`): at most 254
 * characters, one `@` with a non-empty local part and domain, no whitespace, control
 * character or any of `, ; : < > ( ) [ ] " \`, a dotted domain with no empty label,
 * and no RFC 2047 encoded word (`=?…?=`), which a mail header would decode.
 */
export function isOneAddress(value: string): boolean {
  if (value === "" || value.length > MAX_EMAIL_LENGTH) return false;
  if (value.split("@").length !== 2) return false;
  for (const char of value) {
    if (
      /\s/u.test(char) ||
      /\p{Cc}/u.test(char) ||
      FORBIDDEN_EMAIL_CHARS.has(char)
    ) {
      return false;
    }
  }
  if (/=\?.*\?=/.test(value)) return false;
  const [local, domain] = value.split("@");
  if (!local || !domain) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => label !== "");
}

/**
 * Why a visitor's reply email is refused, or `null`: absent or blank is fine (it is
 * optional); anything else must be exactly one address.
 */
export function checkReplyEmail(email: unknown): "not-one" | null {
  if (email === undefined || email === null) return null;
  if (typeof email !== "string") return "not-one";
  const trimmed = email.trim();
  if (trimmed === "") return null;
  return isOneAddress(trimmed) ? null : "not-one";
}
