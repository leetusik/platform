import type { CSSProperties } from "react";

import { cx } from "@/lib/cx";

import { wsSteps } from "./steps-model";

/**
 * Progress (frame.md F39, `WsProgress.dc.html`): the count, then one step a slice, named as an image:
 *
 *   span.progress > span.progress-count + span.steps-cell > span.steps[role=img][aria-label] > i…
 *
 * Every row of a list sets `--steps-n` on the list (`WsList longest`); a progress alone (a title's row) passes
 * `n`. `compact` is the 16 px step, for a table column or a title's row.
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
          {s.segs.map((seg, i) => (
            <i key={i} className={seg || undefined} />
          ))}
        </span>
      </span>
    </span>
  );
}
