/**
 * One piece of feedback as its page reads it (job 04 round 02, `result.md` § One piece of feedback;
 * frame.md F121 to F127, F132, F142): pure, no React and no I/O, so the rules are tested on their own
 * (`tests/feedback-item.test.ts`). `FeedbackItem` renders what `feedbackItemView` returns.
 *
 * - The fifteen facts, in F121's order: every label on every record, the dash when absent (F124), the
 *   closed sets as words (`word`), the two exact times in the viewer's zone (`at`).
 * - Trigger message and Target text, each only with content; Tags always; the five raw JSON blocks,
 *   each only with content, in F121's order.
 * - Operator comments oldest first, `Unknown author` for none; Attachments with `Untitled file` for
 *   none and Download through the web app's relay, named `Download <file name>`.
 * - The zone said once (`zoneMetaOf`): `Local time, GMT+9` once the viewer's zone is known, else
 *   `Times in UTC` (S5's Operator Question).
 */

import {
  itemHeading,
  LABELS,
  UNKNOWN_AUTHOR,
  UNTITLED_FILE,
  zoneMeta,
} from "@/content/feedback-frame";
import { COUNT, downloadName, ZONE_UNKNOWN } from "@/content/feedback-item";
import {
  at,
  bytes,
  json,
  when,
  word,
  type FeedbackValue,
} from "@/lib/feedback/format";
import { langAttr } from "@/lib/feedback/lang";
import type { FeedbackScope } from "@/lib/feedback/place";
import type { FeedbackDetail } from "@/lib/feedback/types";
import { plural, type FormatOptions } from "@/lib/format";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/time-zone";

/** A record id is a UUID; anything else is no piece of feedback (the API's 400), so not found. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFeedbackId(id: string): boolean {
  return UUID.test(id);
}

/**
 * Whether a record shows at this address: any of the org's records at `/feedback/<id>` (the API
 * already answers only the org's), and only the project's own at `/projects/<id>/feedback/<id>`.
 */
export function inScope(
  record: { project_id: string | null },
  scope: FeedbackScope,
): boolean {
  return scope === null || record.project_id === scope;
}

/** The relay a Download link points to (`app/api/app/feedback/[feedbackId]/attachments/[attachmentId]`). */
export function attachmentHref(
  feedbackId: string,
  attachmentId: string,
): string {
  return `/api/app/feedback/${encodeURIComponent(feedbackId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

/**
 * The Details head's meta: the zone said once (F123). `raw` is the time-zone cookie's value as sent;
 * an absent or unusable one is the zone not yet known, and every time is then in UTC.
 */
export function zoneMetaOf(
  raw: string | null | undefined,
  zoneLabel: (timeZone: string) => string,
): string {
  return isValidTimeZone(raw) ? zoneMeta(zoneLabel(raw)) : ZONE_UNKNOWN;
}

/** One of the fifteen facts: text, the rating, a time, or the dash. */
export type ItemFact =
  | { key: string; label: string; kind: "text"; text: string }
  | { key: string; label: string; kind: "rating"; value: FeedbackValue }
  | { key: string; label: string; kind: "time"; iso: string; text: string }
  | { key: string; label: string; kind: "absent" };

/** Trigger message or Target text, with content. */
export interface ItemLong {
  key: string;
  label: string;
  text: string;
  lang?: string;
}

/** A raw JSON block, with content. */
export interface ItemRaw {
  key: string;
  label: string;
  value: unknown;
}

export interface ItemComment {
  id: string;
  author: string;
  /** No author: `Unknown author` in the second ink. */
  unknown: boolean;
  iso: string;
  when: string;
  body: string;
  lang?: string;
}

export interface ItemFile {
  id: string;
  name: string;
  /** No name: `Untitled file` in the second ink. */
  untitled: boolean;
  /** The download's `download` attribute: the file's own name, or none. */
  filename?: string;
  type: string;
  size: string;
  href: string;
  /** Download's accessible name. */
  label: string;
}

export interface FeedbackItemView {
  id: string;
  title: string;
  value: FeedbackValue;
  iso: string;
  when: string;
  message: string;
  lang?: string;
  comment: { text: string; lang?: string } | null;
  zone: string;
  facts: ItemFact[];
  longs: ItemLong[];
  tags: string[];
  raws: ItemRaw[];
  comments: ItemComment[];
  /** `3 comments`; null when there are none (an empty part's head has no count). */
  commentCount: string | null;
  files: ItemFile[];
  fileCount: string | null;
}

/** The fifteen labels, in F121's order: the loading page draws them over skeleton values. */
export const FACT_LABELS: readonly string[] = [
  LABELS.project,
  LABELS.value,
  LABELS.product,
  LABELS.integration,
  LABELS.channel,
  LABELS.recordedBy,
  LABELS.triggerType,
  LABELS.targetType,
  LABELS.targetRole,
  LABELS.conversation,
  LABELS.session,
  LABELS.user,
  LABELS.eventAt,
  LABELS.at,
  LABELS.rid,
];

const blank = (v: string | null | undefined): v is null | undefined | "" =>
  v === null || v === undefined || v === "";

function text(
  key: string,
  label: string,
  value: string | null | undefined,
): ItemFact {
  return blank(value)
    ? { key, label, kind: "absent" }
    : { key, label, kind: "text", text: value };
}

function time(
  key: string,
  label: string,
  iso: string | null | undefined,
  format: FormatOptions,
): ItemFact {
  if (blank(iso) || Number.isNaN(Date.parse(iso)))
    return { key, label, kind: "absent" };
  return { key, label, kind: "time", iso, text: at(iso, format) };
}

const byTime = (a: { created_at: string }, b: { created_at: string }) =>
  Date.parse(a.created_at) - Date.parse(b.created_at);

/**
 * The page's view of a record. `projectName` is the record's project's name (the record carries its id
 * only), or null for none; `format` carries the viewer's zone (UTC until known) and, in tests, `now`.
 */
export function feedbackItemView(
  record: FeedbackDetail,
  {
    projectName,
    zone,
    format = {},
  }: { projectName: string | null; zone: string; format?: FormatOptions },
): FeedbackItemView {
  const fmt: FormatOptions = {
    ...format,
    timeZone: format.timeZone ?? DEFAULT_TIME_ZONE,
  };
  const facts: ItemFact[] = [
    text("project", LABELS.project, projectName),
    {
      key: "value",
      label: LABELS.value,
      kind: "rating",
      value: record.feedback_value,
    },
    text("product", LABELS.product, record.source_product),
    text("integration", LABELS.integration, record.source_integration),
    text("channel", LABELS.channel, record.channel),
    text(
      "recordedBy",
      LABELS.recordedBy,
      word("recordedBy", record.recorded_by),
    ),
    text(
      "triggerType",
      LABELS.triggerType,
      word("trigger", record.trigger_type),
    ),
    text("targetType", LABELS.targetType, word("target", record.target_type)),
    text("targetRole", LABELS.targetRole, record.target_role),
    text("conversation", LABELS.conversation, record.conversation_id),
    text("session", LABELS.session, record.session_id),
    text("user", LABELS.user, record.user_id),
    time("eventAt", LABELS.eventAt, record.event_at, fmt),
    time("at", LABELS.at, record.ingested_at, fmt),
    text("rid", LABELS.rid, record.id),
  ];
  const longs: ItemLong[] = [];
  if (!blank(record.trigger_message))
    longs.push({
      key: "triggerMessage",
      label: LABELS.triggerMessage,
      text: record.trigger_message,
      lang: langAttr(record.trigger_message),
    });
  if (!blank(record.target_text))
    longs.push({
      key: "targetText",
      label: LABELS.targetText,
      text: record.target_text,
      lang: langAttr(record.target_text),
    });
  const raws: ItemRaw[] = (
    [
      ["triggerMeta", LABELS.triggerMeta, record.trigger_metadata],
      ["sourceMeta", LABELS.sourceMeta, record.source_metadata],
      ["attributes", LABELS.attributes, record.attributes],
      ["messages", LABELS.messages, record.messages],
      ["usedContext", LABELS.usedContext, record.used_context],
    ] as const
  )
    .filter(([, , value]) => json(value) !== null)
    .map(([key, label, value]) => ({ key, label, value }));

  const comments: ItemComment[] = [...(record.comments ?? [])]
    .sort(byTime)
    .map((c) => ({
      id: c.id,
      author: blank(c.author) ? UNKNOWN_AUTHOR : c.author,
      unknown: blank(c.author),
      iso: c.created_at,
      when: when(c.created_at, fmt),
      body: c.body,
      lang: langAttr(c.body),
    }));
  const files: ItemFile[] = (record.attachments ?? []).map((f) => ({
    id: f.id,
    name: blank(f.filename) ? UNTITLED_FILE : f.filename,
    untitled: blank(f.filename),
    filename: blank(f.filename) ? undefined : f.filename,
    type: f.content_type,
    size: bytes(f.byte_size),
    href: attachmentHref(record.id, f.id),
    label: downloadName(f.filename),
  }));

  return {
    id: record.id,
    title: itemHeading(projectName),
    value: record.feedback_value,
    iso: record.ingested_at,
    when: when(record.ingested_at, fmt),
    message: record.message,
    lang: langAttr(record.message),
    comment: blank(record.comment)
      ? null
      : { text: record.comment, lang: langAttr(record.comment) },
    zone,
    facts,
    longs,
    tags: record.tags ?? [],
    raws,
    comments,
    commentCount:
      comments.length > 0
        ? plural(comments.length, COUNT.comment.one, COUNT.comment.many)
        : null,
    files,
    fileCount:
      files.length > 0
        ? plural(files.length, COUNT.file.one, COUNT.file.many)
        : null,
  };
}
