import "server-only";

import { ApiError, sendJson } from "@/lib/knowledge/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/session";

import {
  checkMessage,
  checkReplyEmail,
  type InvalidFeedback,
  type SendFeedbackResult,
} from "./check";
import type { FeedbackSettings } from "./config";

// The decision core of hi2vi's own feedback control: plain functions with their
// dependencies injected (the request headers, the settings, the key, the identity,
// the post and the limiter), so tests drive every guard without Next. `actions.ts`
// wires the real ones.
//
// A visitor's send passes, in order: the same-origin rule, the capture key being
// configured, the honeypot, the check, the per-address limit (keyed on `X-Real-IP`
// only), the site-wide daily ceiling, then the post. A signed-in send passes the
// same-origin rule, the key, the identity, the check and the per-account limit.
// Nothing is counted before the check passes, and nothing is posted before every
// guard has.
//
// The limits live in `checkRateLimit`'s in-memory, per-process map: a restart or a
// redeploy resets every window, the daily ceiling included.

/** The request headers an action reads (`next/headers`' `headers()` satisfies it). */
export interface HeaderReader {
  get(name: string): string | null;
}

/** `checkRateLimit`'s shape: record a hit for `key` and say whether it is allowed. */
export type Limiter = (
  key: string,
  limit: number,
  windowMs: number,
) => { ok: boolean };

/** What the API's capture route receives. No address, user agent or header value. */
export interface CaptureBody {
  message: string;
  source: { product: "hi2vi"; integration: "landing" | "org-home" };
  channel: "web";
  user_id?: string;
  source_metadata?: { reply_email: string };
}

/** Posts one capture with the key as its bearer; throws `ApiError` on a non-2xx. */
export type Poster = (
  body: CaptureBody,
  captureKey: string,
) => Promise<unknown>;

export interface SendDeps {
  headers: HeaderReader;
  settings: FeedbackSettings;
  /** The project-bound capture key, or `null` when the control is not configured. */
  captureKey: string | null;
  post: Poster;
  /** Defaults to the app's `checkRateLimit`. */
  limit?: Limiter;
  /** Where a failed post's status goes; defaults to `console.warn`. */
  log?: (line: string) => void;
}

/** The signed-in account a message is sent as. */
export interface FeedbackAccount {
  userId: string;
  email: string | null;
}

export interface AccountSendDeps extends SendDeps {
  /** Resolves the session's account; may throw Next's redirect to sign-in. */
  identify: () => Promise<FeedbackAccount>;
  /** Rethrows Next's control-flow errors (a redirect); `unstable_rethrow` in the app. */
  rethrow?: (error: unknown) => void;
}

/** The visitor's input as the client sends it; untrusted, so every field is `unknown`. */
export interface VisitorInput {
  message?: unknown;
  email?: unknown;
  website?: unknown;
}

const DAY_MS = 86_400_000;
/** The visitor bucket's prefix; the address follows. */
export const IP_BUCKET = "send-feedback:ip:";
/** One feedback-only bucket for requests with no `X-Real-IP` (local dev). */
export const UNKNOWN_IP_BUCKET = `${IP_BUCKET}unknown`;
export const SITE_BUCKET = "send-feedback:site";
export const ACCOUNT_BUCKET = "send-feedback:account:";

const FAILED: SendFeedbackResult = { status: "failed" };

/**
 * The same-origin rule of the sign-in routes (`assertSameOrigin`), applied to the
 * action's request headers: `Sec-Fetch-Site` of `same-origin` or `none`, or an
 * `Origin` whose host is the `Host`. The rule reads only `req.headers.get`.
 */
export function isSameOrigin(headers: HeaderReader): boolean {
  return assertSameOrigin({ headers } as unknown as Request);
}

/**
 * The visitor's address as the edge recorded it: `X-Real-IP` only. The edge sets it
 * to the connecting address after restoring Cloudflare's, overwriting what a client
 * sent; `X-Forwarded-For` is the client's own claim and is never read.
 */
export function visitorBucket(headers: HeaderReader): string {
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp ? `${IP_BUCKET}${realIp}` : UNKNOWN_IP_BUCKET;
}

function invalid(
  field: InvalidFeedback["field"],
  reason: InvalidFeedback["reason"],
): InvalidFeedback {
  return { status: "invalid", field, reason };
}

/** True when the hidden `website` field holds anything but blank (or is not text). */
function honeypotFilled(website: unknown): boolean {
  if (website === undefined || website === null) return false;
  return typeof website !== "string" || website.trim() !== "";
}

/** The message's own check; the email's comes after it for a visitor. */
function checkBody(message: unknown, maxChars: number): InvalidFeedback | null {
  const reason = checkMessage(message, maxChars);
  return reason ? invalid("message", reason) : null;
}

/** The real post: `POST /api/feedback` with the key as bearer and no org header. */
export const postCapture: Poster = (body, captureKey) =>
  sendJson("/api/feedback", "POST", body, { token: captureKey, org: null });

/** Post, and map the answer: 2xx sent; the API's limiter (429) refused; else failed. */
async function deliver(
  body: CaptureBody,
  deps: SendDeps,
  captureKey: string,
): Promise<SendFeedbackResult> {
  const log = deps.log ?? ((line: string) => console.warn(line));
  try {
    await deps.post(body, captureKey);
    return { status: "sent" };
  } catch (error) {
    if (error instanceof ApiError) {
      // The status only: never the message, the email, the key or the API's detail.
      log(`send-feedback: capture answered ${error.status}`);
      return error.status === 429 ? { status: "refused" } : FAILED;
    }
    log("send-feedback: capture unreachable");
    return FAILED;
  }
}

/** A visitor's send from the landing. */
export async function sendVisitorFeedback(
  input: VisitorInput | null | undefined,
  deps: SendDeps,
): Promise<SendFeedbackResult> {
  if (!isSameOrigin(deps.headers)) return FAILED;
  const captureKey = deps.captureKey;
  if (!captureKey) return FAILED;

  // The honeypot: a field no person sees. A bot is told it worked; nothing is
  // posted and nothing is counted.
  if (honeypotFilled(input?.website)) return { status: "sent" };

  const { settings } = deps;
  const problem = checkBody(input?.message, settings.maxChars);
  if (problem) return problem;
  const emailProblem = checkReplyEmail(input?.email);
  if (emailProblem) return invalid("email", emailProblem);

  const limit = deps.limit ?? checkRateLimit;
  if (
    !limit(
      visitorBucket(deps.headers),
      settings.ipLimit,
      settings.ipWindowS * 1000,
    ).ok
  ) {
    return { status: "refused" };
  }
  if (!limit(SITE_BUCKET, settings.dailyCeiling, DAY_MS).ok) {
    return { status: "refused-site" };
  }

  const message = (input?.message as string).trim();
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  return deliver(
    {
      message,
      source: { product: "hi2vi", integration: "landing" },
      channel: "web",
      ...(email ? { source_metadata: { reply_email: email } } : {}),
    },
    deps,
    captureKey,
  );
}

/**
 * A signed-in user's send from org home. Only `message` is read from the input: the
 * reply email and the user id come from the session's account, and the integration
 * is fixed here, whatever else the client sends.
 */
export async function sendAccountFeedback(
  input: { message?: unknown } | null | undefined,
  deps: AccountSendDeps,
): Promise<SendFeedbackResult> {
  if (!isSameOrigin(deps.headers)) return FAILED;
  const captureKey = deps.captureKey;
  if (!captureKey) return FAILED;

  let account: FeedbackAccount;
  try {
    account = await deps.identify();
  } catch (error) {
    deps.rethrow?.(error);
    return FAILED;
  }

  const { settings } = deps;
  const problem = checkBody(input?.message, settings.maxChars);
  if (problem) return problem;

  const limit = deps.limit ?? checkRateLimit;
  if (
    !limit(
      `${ACCOUNT_BUCKET}${account.userId}`,
      settings.accountLimit,
      settings.accountWindowS * 1000,
    ).ok
  ) {
    return { status: "refused" };
  }

  const email = account.email?.trim() ?? "";
  return deliver(
    {
      message: (input?.message as string).trim(),
      source: { product: "hi2vi", integration: "org-home" },
      channel: "web",
      user_id: account.userId,
      ...(email ? { source_metadata: { reply_email: email } } : {}),
    },
    deps,
    captureKey,
  );
}
