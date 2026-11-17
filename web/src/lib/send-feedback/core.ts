import "server-only";

import { ApiError, sendJson } from "@/lib/knowledge/client";
import { takeRateLimit } from "@/lib/rate-limit";
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
// What a send costs: each limit's slot is taken before the post (so concurrent sends
// can never pass a limit) and given back unless the API delivers (answers 2xx). An
// undelivered send (any other status, the API's own 429 included, a transport error
// or the time bound) costs no slot, and a visitor the ceiling refuses keeps their
// address slot. The post is bounded by `CAPTURE_TIMEOUT_MS`, so every send ends.
//
// The limits live in `rate-limit.ts`'s in-memory, per-process map: a restart or a
// redeploy resets every window, the daily ceiling included.

/** The request headers an action reads (`next/headers`' `headers()` satisfies it). */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * `takeRateLimit`'s shape: take a slot of `key` and say whether it was allowed;
 * `release` gives the slot back.
 */
export type Limiter = (
  key: string,
  limit: number,
  windowMs: number,
) => { ok: boolean; release?: () => void };

/** What the API's capture route receives. No address, user agent or header value. */
export interface CaptureBody {
  message: string;
  source: { product: "hi2vi"; integration: "landing" | "org-home" };
  channel: "web";
  user_id?: string;
  source_metadata?: { reply_email: string };
}

/**
 * Posts one capture with the key as its bearer; throws `ApiError` on a non-2xx.
 * `signal` aborts it when the send's time bound passes.
 */
export type Poster = (
  body: CaptureBody,
  captureKey: string,
  signal?: AbortSignal,
) => Promise<unknown>;

export interface SendDeps {
  headers: HeaderReader;
  settings: FeedbackSettings;
  /** The project-bound capture key, or `null` when the control is not configured. */
  captureKey: string | null;
  post: Poster;
  /** Defaults to the app's `takeRateLimit`. */
  limit?: Limiter;
  /** Where a failed post's status goes; defaults to `console.warn`. */
  log?: (line: string) => void;
  /** The post's time bound; defaults to `CAPTURE_TIMEOUT_MS` (tests shorten it). */
  timeoutMs?: number;
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
/** How long the capture post may take before the send answers `failed`. */
export const CAPTURE_TIMEOUT_MS = 10_000;
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

/** A dotted IPv4 address in its plain form, or `null`. */
function ipv4(text: string): string | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  if (!parts.every((p) => /^[0-9]{1,3}$/.test(p) && Number(p) <= 255)) {
    return null;
  }
  return parts.map(Number).join(".");
}

/** An IPv6 address's 16-bit groups between `::`s; an IPv4 may end the last one. */
function groups(text: string, last: boolean): number[] | null {
  if (text === "") return [];
  const parts = text.split(":");
  const out: number[] = [];
  for (const [i, part] of parts.entries()) {
    const v4 = last && i === parts.length - 1 ? ipv4(part) : null;
    if (v4) {
      const [a, b, c, d] = v4.split(".").map(Number);
      out.push(a * 256 + b, c * 256 + d);
    } else if (/^[0-9a-f]{1,4}$/i.test(part)) {
      out.push(parseInt(part, 16));
    } else {
      return null;
    }
  }
  return out;
}

/**
 * The sender an address stands for: an IPv4 address itself; an IPv6 address's /64
 * (one host or subscriber), whatever its spelling; an IPv4-mapped IPv6 address
 * (`::ffff:a.b.c.d`) its IPv4. `null` for anything else.
 */
function senderOf(address: string): string | null {
  const v4 = ipv4(address);
  if (v4) return v4;
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = groups(halves[0], halves.length === 1);
  const tail = halves.length === 2 ? groups(halves[1], true) : [];
  if (!head || !tail) return null;
  const gap = 8 - head.length - tail.length;
  if (halves.length === 1 ? gap !== 0 : gap < 1) return null;
  const all = [...head, ...Array<number>(gap).fill(0), ...tail];
  if (all.slice(0, 5).every((g) => g === 0) && all[5] === 0xffff) {
    return [all[6] >> 8, all[6] & 255, all[7] >> 8, all[7] & 255].join(".");
  }
  return `${all
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

/**
 * The visitor's sender as the edge recorded it: `X-Real-IP` only. The edge sets it
 * to the connecting address after restoring Cloudflare's, overwriting what a client
 * sent; `X-Forwarded-For` is the client's own claim and is never read. An IPv6
 * address counts by its /64, so one host cannot rotate through its prefix; a
 * malformed or missing address shares the one unknown bucket.
 */
export function visitorBucket(headers: HeaderReader): string {
  const sender = senderOf(headers.get("x-real-ip")?.trim() ?? "");
  return sender ? `${IP_BUCKET}${sender}` : UNKNOWN_IP_BUCKET;
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
export const postCapture: Poster = (body, captureKey, signal) =>
  sendJson("/api/feedback", "POST", body, {
    token: captureKey,
    org: null,
    signal,
  });

/**
 * Post within the time bound, and map the answer: 2xx sent; the API's limiter (429)
 * refused; else failed. The bound aborts the request and ends the send even if the
 * post ignores its signal.
 */
async function deliver(
  body: CaptureBody,
  deps: SendDeps,
  captureKey: string,
): Promise<SendFeedbackResult> {
  const log = deps.log ?? ((line: string) => console.warn(line));
  const signal = AbortSignal.timeout(deps.timeoutMs ?? CAPTURE_TIMEOUT_MS);
  const bound = new Promise<never>((_, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    }),
  );
  try {
    await Promise.race([deps.post(body, captureKey, signal), bound]);
    return { status: "sent" };
  } catch (error) {
    if (error instanceof ApiError) {
      // The status only: never the message, the email, the key or the API's detail.
      log(`send-feedback: capture answered ${error.status}`);
      return error.status === 429 ? { status: "refused" } : FAILED;
    }
    log(
      signal.aborted
        ? "send-feedback: capture timed out"
        : "send-feedback: capture unreachable",
    );
    return FAILED;
  }
}

/** Gives back every slot a send took when the API did not deliver it. */
function settle(
  result: SendFeedbackResult,
  slots: { release?: () => void }[],
): SendFeedbackResult {
  if (result.status !== "sent") for (const slot of slots) slot.release?.();
  return result;
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

  const limit = deps.limit ?? takeRateLimit;
  const address = limit(
    visitorBucket(deps.headers),
    settings.ipLimit,
    settings.ipWindowS * 1000,
  );
  if (!address.ok) return { status: "refused" };
  const site = limit(SITE_BUCKET, settings.dailyCeiling, DAY_MS);
  if (!site.ok) {
    // The site is full, not this visitor: they keep their own slot.
    address.release?.();
    return { status: "refused-site" };
  }

  const message = (input?.message as string).trim();
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  const result = await deliver(
    {
      message,
      source: { product: "hi2vi", integration: "landing" },
      channel: "web",
      ...(email ? { source_metadata: { reply_email: email } } : {}),
    },
    deps,
    captureKey,
  );
  return settle(result, [address, site]);
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

  const limit = deps.limit ?? takeRateLimit;
  const slot = limit(
    `${ACCOUNT_BUCKET}${account.userId}`,
    settings.accountLimit,
    settings.accountWindowS * 1000,
  );
  if (!slot.ok) return { status: "refused" };

  const email = account.email?.trim() ?? "";
  const result = await deliver(
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
  return settle(result, [slot]);
}
