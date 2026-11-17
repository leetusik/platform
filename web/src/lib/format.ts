/**
 * The product's formats: frame.md F2 of the signed foundations round (job 01, round 03), the fixture's
 * `FX.num`, `FX.date`, `FX.when`, `FX.plural` and `FX.due`, written once for every page.
 *
 * - Numbers: en-US grouping, `1,554`; a count with its unit, `1 project`, `24 projects`.
 * - Dates: `Nov 14` in the current year, `Dec 9, 2025` in another (the one date order, D239-ev).
 * - A time that passed: `just now`, `12m ago`, `2h ago`, `3d ago` under 7 days, then the date.
 *   A time that never happened: `Never`. A value that does not apply (or does not parse): `—`.
 * - Review's count: the number, `99+` over 99, nothing at 0.
 *
 * `now` and `timeZone` default to the clock and the runtime's zone; a page that renders on the server
 * and must agree with its reader passes the reader's zone. A calendar date (`2026-11-13`) is read as
 * written, never shifted by a zone.
 */

export interface FormatOptions {
  /** The moment to measure from and whose year counts as this one. Default: now. */
  now?: Date | number;
  /** An IANA zone (`Asia/Seoul`) for instants. Default: the runtime's. */
  timeZone?: string;
}

type Instant = string | number | Date;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ABSENT = "—";

/** `1,554`. */
export function num(n: number): string {
  return Number(n).toLocaleString("en-US");
}

/** `1 project`, `24 projects`, `2 activities` (with `many`). */
export function plural(n: number, one: string, many?: string): string {
  return `${num(n)} ${n === 1 ? one : many || `${one}s`}`;
}

/** `Nov 13`, or `Dec 9, 2025` when the year is not this one; `—` for a value that is not a date. */
export function date(value: Instant, options: FormatOptions = {}): string {
  const day = calendarDay(value, options.timeZone);
  if (!day) return ABSENT;
  const thisYear = calendarDay(
    options.now ?? Date.now(),
    options.timeZone,
  )?.year;
  return `${MONTHS[day.month - 1]} ${day.day}${day.year === thisYear ? "" : `, ${day.year}`}`;
}

/** `just now`, `12m ago`, `2h ago`, `3d ago`, then the date; `Never` for no time at all. */
export function when(
  value: Instant | null | undefined,
  options: FormatOptions = {},
): string {
  if (value === null || value === undefined || value === "") return "Never";
  const at = toTime(value);
  if (Number.isNaN(at)) return ABSENT;
  const now = options.now === undefined ? Date.now() : toTime(options.now);
  const s = Math.floor((now - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return date(at, options);
}

/** Review's count: `''` at 0, the number, `99+` over 99. */
export function due(n: number): string {
  if (!(n > 0)) return "";
  return n > 99 ? "99+" : String(Math.floor(n));
}

function toTime(value: Instant): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}

function calendarDay(
  value: Instant,
  timeZone: string | undefined,
): { year: number; month: number; day: number } | null {
  if (typeof value === "string") {
    const m = CALENDAR_DATE.exec(value);
    if (m) {
      const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return month >= 1 && month <= 12 && day >= 1 && day <= 31
        ? { year, month, day }
        : null;
    }
  }
  const at = toTime(value);
  if (Number.isNaN(at)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}
