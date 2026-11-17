/**
 * The Feedback frame's formats (job 04 round 02, frame.md F122, F123, F126, F343; the fixture's `FW`),
 * written on the product's own (`@/lib/format`: `num`, `plural`, `date`, `when`).
 *
 * Every time is in the viewer's zone by the one time-zone rule (`@/lib/time-zone`: the `kb_tz` cookie,
 * read on the server with `viewerTimeZone`), and in UTC until it is known: unlike `@/lib/format`, a
 * missing `timeZone` here is UTC, never the runtime's zone, so a server render and its reader agree.
 *
 * - `when`: a time that passed, as F2 writes it (`2h ago`, `3d ago`, then the day): the list, an
 *   item's head, an operator comment.
 * - `at`: an exact time, the day and a 24-hour clock (`Nov 15, 08:00`, `Nov 20, 2025, 10:00`): an
 *   item's Happened at and Captured at. The zone is said once on the page (`zoneLabel`, `zoneMeta`).
 * - `bytes`: binary units, one decimal from KB up (`512 B`, `1.5 KB`, `1.2 MB`).
 * - `countLine`: the list's count (`230 pieces of feedback`, `12 matches`).
 * - `ratingOf`, `word`, `json`: a rating's word and class, a closed set's word, raw JSON's text.
 */

import { ABSENT, COUNT, RATING, WORDS } from "@/content/feedback-frame";
import {
  date,
  num,
  plural,
  when as passed,
  type FormatOptions,
} from "@/lib/format";
import { DEFAULT_TIME_ZONE } from "@/lib/time-zone";

type Instant = string | number | Date;

/** The API's `feedback_value`: 1 liked, 2 disliked, null unrated. */
export type FeedbackValue = 1 | 2 | null;

export type RatingKey = keyof typeof RATING;

export interface RatingLook {
  key: RatingKey;
  word: string;
  /** The classes for its `span` (F122). */
  className: string;
}

/** A rating's word and class (F122, `FW.rating`): 1 Liked, 2 Disliked, anything else Unrated. */
export function ratingOf(value: FeedbackValue | undefined): RatingLook {
  const key: RatingKey =
    value === 1 ? "liked" : value === 2 ? "disliked" : "unrated";
  return { key, word: RATING[key], className: `rating rating-${key}` };
}

const zoned = (options: FormatOptions): FormatOptions => ({
  ...options,
  timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
});

/** `just now`, `12m ago`, `2h ago`, `3d ago`, then the day in the viewer's zone; `Never` for none. */
export function when(
  value: Instant | null | undefined,
  options: FormatOptions = {},
): string {
  return passed(value, zoned(options));
}

/** `Nov 15, 08:00`, or `Nov 20, 2025, 10:00` in another year; `—` for a value that is not a time. */
export function at(value: Instant, options: FormatOptions = {}): string {
  const zone = zoned(options);
  const time = toTime(value);
  if (Number.isNaN(time)) return ABSENT.mark;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(time);
  const part = (type: "hour" | "minute") =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${date(time, zone)}, ${part("hour")}:${part("minute")}`;
}

/**
 * The zone's name as its offset at `instant` (default now): `GMT+9` for `Asia/Seoul`, `GMT-5` for New
 * York in winter, `GMT+5:30`; `GMT` for UTC, the zone while the viewer's is unknown.
 */
export function zoneLabel(
  timeZone: string | undefined,
  instant: Instant = Date.now(),
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(toTime(instant));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
}

const UNITS = ["B", "KB", "MB", "GB"];

/** `512 B`, `1.5 KB`, `242.3 KB`, `1.2 MB`: binary units, one decimal from KB up (`FW.bytes`). */
export function bytes(n: number): string {
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? num(value) : value.toFixed(1)} ${UNITS[unit]}`;
}

/** The list's count line (F343): the total at rest, the matches under a search or a filter. */
export function countLine(total: number, filtered: boolean): string {
  const unit = filtered ? COUNT.matches : COUNT.total;
  return plural(total, unit.one, unit.many);
}

export type WordKind = keyof typeof WORDS;

/** A closed set's word (`Agent`, `Dislike`, `Surface`); a value outside the set as written; null for none. */
export function word(
  kind: WordKind,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const words: Record<string, string> = WORDS[kind];
  return Object.hasOwn(words, value) ? words[value] : String(value);
}

/** Raw JSON as text, indented by two (F126, `FW.json`); null when there is nothing in it. */
export function json(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const empty = Array.isArray(value)
    ? value.length === 0
    : typeof value === "object" && Object.keys(value).length === 0;
  return empty ? null : JSON.stringify(value, null, 2);
}

function toTime(value: Instant): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}
