import "server-only";

import { getJson, getRaw } from "@/lib/knowledge/client";

import { feedbackQueryString } from "./query";
import type {
  FeedbackDetail,
  FeedbackNumberedPage,
  FeedbackPage,
  FeedbackQuery,
} from "./types";

// The Feedback module's session-scoped reads (`/app/feedback*`), on the same
// client seam as `@/lib/knowledge/app`: the caller passes the session bearer, the
// client adds the active org, and every call is `no-store`.

/**
 * `GET /app/feedback` → `{records, total, next_cursor?}`: the active org's
 * feedback, newest first, keyset-paged (the old list's read). `next_cursor`'s ABSENCE means the list is
 * exhausted, so the spread keeps a missing key missing instead of materializing
 * `next_cursor: undefined`.
 */
export async function listFeedback(
  token: string,
  query: FeedbackQuery = {},
  signal?: AbortSignal,
): Promise<FeedbackPage> {
  const page = await getJson<FeedbackPage>(
    `/app/feedback${feedbackQueryString(query)}`,
    { token, signal },
  );
  return { ...page, records: page.records ?? [] };
}

/**
 * `GET /app/feedback?page=N` → `{records, total}`: one numbered page (1-based,
 * `limit` a page, fifty by default) of the active org's feedback, newest first,
 * and the count of the whole list as read. A page past the last is no records
 * and the total. Any cursor in `query` is dropped: the two are exclusive.
 */
export async function listFeedbackPage(
  token: string,
  query: Omit<FeedbackQuery, "cursor" | "page">,
  page: number,
  signal?: AbortSignal,
): Promise<FeedbackNumberedPage> {
  const numbered: FeedbackQuery = { ...query, page };
  delete numbered.cursor;
  const read = await getJson<FeedbackNumberedPage>(
    `/app/feedback${feedbackQueryString(numbered)}`,
    { token, signal },
  );
  return { records: read.records ?? [], total: read.total ?? 0 };
}

/**
 * How many records the list holds in a window: `total` over
 * `start_ingested_at <= ingested_at < end_ingested_at` (ISO instants), one
 * project or the whole org, read with `limit: 1`. Project home's
 * `N this month` passes the viewer's month as the window.
 */
export async function countFeedback(
  token: string,
  window: { project_id?: string; start: string; end: string },
  signal?: AbortSignal,
): Promise<number> {
  const read = await getJson<FeedbackPage>(
    `/app/feedback${feedbackQueryString({
      project_id: window.project_id,
      start_ingested_at: window.start,
      end_ingested_at: window.end,
      limit: 1,
    })}`,
    { token, signal },
  );
  return read.total ?? 0;
}

/** The `GET /app/feedback/{id}` envelope: the record is wrapped, unlike the list. */
interface RawFeedbackDetailResponse {
  record: FeedbackDetail;
}

/**
 * `GET /app/feedback/{id}` → `{record}`, unwrapped. 400 (not a UUID) and 404
 * (missing, or another org's) are thrown as `ApiError`; the page maps both to
 * its not-found.
 */
export async function getFeedbackDetail(
  token: string,
  feedbackId: string,
  signal?: AbortSignal,
): Promise<FeedbackDetail> {
  const raw = await getJson<RawFeedbackDetailResponse>(
    `/app/feedback/${encodeURIComponent(feedbackId)}`,
    { token, signal },
  );
  return raw.record;
}

/**
 * `GET /app/feedback/{id}/attachments/{aid}` → the raw bytes, body unread, for
 * the relay route to stream. Throws `ApiError` on a non-2xx.
 */
export async function getFeedbackAttachment(
  token: string,
  feedbackId: string,
  attachmentId: string,
): Promise<Response> {
  return getRaw(
    `/app/feedback/${encodeURIComponent(feedbackId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { token },
  );
}
