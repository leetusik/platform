import { date, num, type FormatOptions } from "@/lib/format";

/**
 * Trend's geometry (`Trend.dc.html`), pure so it can be tested without a DOM: thirty daily bars on a
 * baseline, each a percentage of the scale's maximum (the series' peak), the last bar today's.
 */
export const TREND_DAYS = 30;

export interface TrendBar {
  /** The bar's height as the board writes it: `(n / peak)` to a tenth of a percent, `0%` for zero. */
  height: string;
  /** Only the last bar, today's. */
  today: boolean;
  /** The calendar day, `2026-11-15`. */
  day: string;
  count: number;
}

export interface TrendModel {
  /** `empty`: every count is zero (or there is none), the board's empty state. */
  kind: "filled" | "empty";
  bars: TrendBar[];
  total: number;
  /** The scale's maximum: the tallest count takes the full height. */
  peak: number;
  /** The axis' first and last day, as calendar dates. */
  first: string;
  last: string;
}

/**
 * `series` is a count a day, oldest first, ending on `lastDay` (`YYYY-MM-DD`). A shorter series is
 * padded with zero days on the left, a longer one cut to its last thirty.
 */
export function trendModel(
  series: readonly number[],
  lastDay: string,
): TrendModel {
  const tail = series.slice(-TREND_DAYS).map((n) => (n > 0 ? n : 0));
  const counts = [
    ...new Array<number>(TREND_DAYS - tail.length).fill(0),
    ...tail,
  ];
  const total = counts.reduce((a, b) => a + b, 0);
  const peak = Math.max(0, ...counts);
  const bars = counts.map((count, d) => ({
    count,
    day: shiftDay(lastDay, d - (TREND_DAYS - 1)),
    today: d === TREND_DAYS - 1,
    height: `${peak ? Math.round((count / peak) * 1000) / 10 : 0}%`,
  }));
  return {
    kind: total > 0 ? "filled" : "empty",
    bars,
    total,
    peak,
    first: bars[0].day,
    last: bars[TREND_DAYS - 1].day,
  };
}

/** The words a filled trend shows: the head's caption, the plot's text alternative, each bar's tip. */
export function trendWords(model: TrendModel, options: FormatOptions = {}) {
  return {
    first: date(model.first, options),
    last: date(model.last, options),
    total: num(model.total),
    peak: num(model.peak),
    tip: (bar: TrendBar) => `${date(bar.day, options)}: ${num(bar.count)}`,
  };
}

/** A calendar date moved by whole days, read as written (no zone). */
function shiftDay(day: string, by: number): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return day;
  return new Date(at + by * 86400e3).toISOString().slice(0, 10);
}
