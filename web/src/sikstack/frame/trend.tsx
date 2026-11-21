import { TREND } from "@/content/sikstack-frame";
import type { FormatOptions } from "@/lib/format";

import { Panel, PanelBody, PanelHead, Skeleton } from "@/sikstack/ui";

import { trendModel, trendWords } from "./trend-model";

/**
 * Trend (`Trend.dc.html`): the panel **Searches, last 30 days**, thirty bars a day on a baseline built
 * from elements (no SVG), today's in the accent, the first and last day under it, total and peak in
 * the head. An all-zero series draws the empty state; `loading` the skeleton; both keep the plot's
 * height. A server component: it has no behaviour.
 */
export interface TrendProps {
  /** Searches a day, oldest first, ending today (padded or cut to thirty). */
  series: readonly number[];
  /** Today's calendar date, `YYYY-MM-DD`, the last bar's day. */
  lastDay: string;
  loading?: boolean;
  /** `now` and `timeZone` for the axis dates (`@/lib/format`). */
  format?: FormatOptions;
}

export function Trend({
  series,
  lastDay,
  loading = false,
  format,
}: TrendProps) {
  const model = trendModel(series, lastDay);
  const words = trendWords(model, format);
  const filled = !loading && model.kind === "filled";
  const empty = !loading && model.kind === "empty";
  return (
    <Panel aria-label={TREND.heading}>
      <PanelHead>
        <h2>{TREND.heading}</h2>
        {filled ? (
          <p className="meta">{TREND.caption(words.total, words.peak)}</p>
        ) : null}
      </PanelHead>
      <PanelBody rule className="trend">
        {filled ? (
          <div
            className="trend-plot"
            role="img"
            aria-label={TREND.summary(
              words.first,
              words.last,
              words.total,
              words.peak,
            )}
          >
            {model.bars.map((bar) => (
              <span
                key={bar.day}
                className={bar.today ? "trend-bar is-last" : "trend-bar"}
                title={words.tip(bar)}
                style={{ height: bar.height }}
              />
            ))}
          </div>
        ) : null}
        {empty ? <p className="trend-empty">{TREND.empty}</p> : null}
        {loading ? (
          <Skeleton plot role="img" aria-label={TREND.loading} />
        ) : null}
        <div className="trend-axis" aria-hidden="true">
          <span>{words.first}</span>
          <span>{words.last}</span>
        </div>
      </PanelBody>
    </Panel>
  );
}
