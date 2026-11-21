import type { CSSProperties } from "react";

import { cx } from "@/lib/cx";

import { stepsBar, wsSteps } from "./steps-model";

/**
 * Progress (frame.md F39, `WsProgress.dc.html`): the count, then one step a slice, named as an image:
 *
 *   span.progress > span.progress-count + span.steps-cell > span.steps[role=img][aria-label] > i…
 *
 * Every row of a list sets `--steps-n` on the list (`WsList longest`); a progress alone (a title's row) passes
 * `n`. `compact` is the 16 px step, for a table column or a title's row.
 *
 * A phase too long for its lane (a step would be under 4 px, `stepsDrawing`) draws one bar instead, as long as its
 * steps would be and filled to the done share: `span.steps-bar`, first in the image, which the sheet gives no
 * width wherever the steps fit (the system's sheet compares the steps' own width with `stepsFit` at layout).
 */
export function Steps({
  done,
  total,
  live = false,
  compact = false,
  n,
  className,
}: {
  done: number;
  total: number;
  live?: boolean;
  compact?: boolean;
  n?: number;
  className?: string;
}) {
  const s = wsSteps(done, total, live);
  const bar = stepsBar(done, total, live);
  return (
    <span
      className={cx("progress", className)}
      style={
        n === undefined ? undefined : ({ "--steps-n": n } as CSSProperties)
      }
    >
      <span className="progress-count">{s.count}</span>
      <span className="steps-cell">
        <span
          className={cx("steps", compact && "is-compact")}
          role="img"
          aria-label={s.label}
        >
          {s.segs.length > 0 ? (
            <span
              className="steps-bar"
              style={
                {
                  "--steps-own": s.segs.length,
                  "--steps-done": pct(bar.done),
                  "--steps-now": pct(bar.now),
                } as CSSProperties
              }
            />
          ) : null}
          {s.segs.map((seg, i) => (
            <i key={i} className={seg || undefined} />
          ))}
        </span>
      </span>
    </span>
  );
}

/** A share (0 to 1) as a percentage, to a thousandth of a percent. */
const pct = (share: number) => `${Number((share * 100).toFixed(3))}%`;
