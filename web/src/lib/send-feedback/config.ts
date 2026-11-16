import "server-only";

// The feedback control's server-side settings. Every value is read lazily from the
// environment on each call (never at module top level, so `next build` needs none),
// and nothing here throws: a missing or malformed number falls back to its default,
// and a missing capture key means the control is not configured and is not shown.
//
// `server-only` keeps the capture key out of every client bundle. Pages read
// `feedbackControl()` on the server and pass its two fields down as props; the key
// itself is read only by the send (`readCaptureKey`, used by `actions.ts`).

/** The defaults the operator's decision 2 sets; each is overridable by its env value. */
export const FEEDBACK_DEFAULTS = {
  /** `HI2VI_FEEDBACK_MAX_CHARS`: the length cap, the [LIMIT] shown on screen. */
  maxChars: 2000,
  /** `HI2VI_FEEDBACK_IP_LIMIT` messages per `HI2VI_FEEDBACK_IP_WINDOW_S`, per visitor address. */
  ipLimit: 5,
  ipWindowS: 600,
  /** `HI2VI_FEEDBACK_ACCOUNT_LIMIT` per `HI2VI_FEEDBACK_ACCOUNT_WINDOW_S`, per signed-in account. */
  accountLimit: 10,
  accountWindowS: 600,
  /** `HI2VI_FEEDBACK_DAILY_CEILING`: landing messages per sliding 24 hours, site-wide. */
  dailyCeiling: 200,
} as const;

export interface FeedbackSettings {
  maxChars: number;
  ipLimit: number;
  ipWindowS: number;
  accountLimit: number;
  accountWindowS: number;
  dailyCeiling: number;
}

/** The env value as a positive integer, or `fallback` when unset, blank or anything else. */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  const text = raw.trim();
  if (!/^[0-9]+$/.test(text)) return fallback;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Every number the guards use, read now. */
export function feedbackSettings(): FeedbackSettings {
  return {
    maxChars: positiveInt(
      "HI2VI_FEEDBACK_MAX_CHARS",
      FEEDBACK_DEFAULTS.maxChars,
    ),
    ipLimit: positiveInt("HI2VI_FEEDBACK_IP_LIMIT", FEEDBACK_DEFAULTS.ipLimit),
    ipWindowS: positiveInt(
      "HI2VI_FEEDBACK_IP_WINDOW_S",
      FEEDBACK_DEFAULTS.ipWindowS,
    ),
    accountLimit: positiveInt(
      "HI2VI_FEEDBACK_ACCOUNT_LIMIT",
      FEEDBACK_DEFAULTS.accountLimit,
    ),
    accountWindowS: positiveInt(
      "HI2VI_FEEDBACK_ACCOUNT_WINDOW_S",
      FEEDBACK_DEFAULTS.accountWindowS,
    ),
    dailyCeiling: positiveInt(
      "HI2VI_FEEDBACK_DAILY_CEILING",
      FEEDBACK_DEFAULTS.dailyCeiling,
    ),
  };
}

/**
 * The project-bound `capture` key the send presents, or `null` when
 * `HI2VI_FEEDBACK_CAPTURE_KEY` is unset or blank. For the send only: never put it in
 * a prop, a result or a log line.
 */
export function readCaptureKey(): string | null {
  const raw = process.env.HI2VI_FEEDBACK_CAPTURE_KEY;
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key === "" ? null : key;
}

/** What a page needs to render the control. It never carries the key. */
export interface FeedbackControl {
  /** False without a capture key: the page then renders no control at all. */
  configured: boolean;
  /** The length cap, every [LIMIT] on screen. */
  limit: number;
}

/** Read on the server by the landing and org home, passed down as props. */
export function feedbackControl(): FeedbackControl {
  return {
    configured: readCaptureKey() !== null,
    limit: feedbackSettings().maxChars,
  };
}
