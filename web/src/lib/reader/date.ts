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

/** `2026-10-03` → `3 Oct 2026`, with no locale or time zone in the way. */
export function publishedDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : date;
}

/** A bare calendar day: it names no instant, so no zone may shift it. */
const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A version row's date in the legacy reader, in `publishedDate`'s form on the viewer's day (D5):
 * an instant (`2026-11-17T23:30:12Z`) reads its day in `timeZone` (UTC when not known or not
 * valid); a bare `YYYY-MM-DD` day (a filled v1, a read without the stamp) stays that day; an
 * unreadable value reads as `publishedDate` does.
 */
export function versionDay(value: string, timeZone?: string): string {
  if (BARE_DAY.test(value)) return publishedDate(value);
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return publishedDate(value);
  const day = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = day(timeZone || "UTC");
  } catch {
    parts = day("UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return publishedDate(`${get("year")}-${get("month")}-${get("day")}`);
}
