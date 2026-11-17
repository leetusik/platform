import { useId, type ReactNode } from "react";

import { USAGE } from "@/content/hi2vi-frame";
import { num } from "@/lib/format";

import { Skeleton, Stat, Stats } from "@/hi2vi/ui";

/**
 * The usage read-out (frame.md F17, `ProjectHome.dc.html`): two headed groups in one `.usage` row,
 * **Usage, last 30 days** over Documents created, Searches and Deleted, and **Documents** over Active
 * total, so the one figure that is held now never sits under the 30-day heading. Each figure is
 * `num()`; an empty org or project reads `0`. Loading keeps both heads and puts a 3em `.skel` in each
 * figure, with `aria-busy`. Org home and project home draw the same words, but mark the loading apart:
 * `ProjectHome.dc.html` puts `aria-busy` on the `.usage` row (no `busyLabel`); `OrgHome.dc.html`
 * puts it on each of the two sections and a visually hidden `Loading…` after the 30-day strip (the
 * page passes those words as `busyLabel`).
 */
export interface UsageFigures {
  docs30: number;
  searches30: number;
  deleted30: number;
  /** The active documents now. */
  docs: number;
}

export type UsageProps = { busyLabel?: string } & (
  | { loading: true; figures?: undefined }
  | { loading?: false; figures: UsageFigures }
);

export function Usage({ loading, figures, busyLabel }: UsageProps) {
  const id = useId();
  const value = (n: number | undefined): ReactNode =>
    loading || n === undefined ? <Skeleton width="3em" /> : num(n);
  const busy = loading ? "true" : undefined;
  const groups = busyLabel !== undefined;
  return (
    <div className="usage" aria-busy={groups ? undefined : busy}>
      <section
        className="section usage-window"
        aria-labelledby={`${id}-window`}
        aria-busy={groups ? busy : undefined}
      >
        <h2 id={`${id}-window`}>{USAGE.window}</h2>
        <Stats>
          <Stat label={USAGE.docs30}>{value(figures?.docs30)}</Stat>
          <Stat label={USAGE.searches30}>{value(figures?.searches30)}</Stat>
          <Stat label={USAGE.deleted30}>{value(figures?.deleted30)}</Stat>
        </Stats>
        {groups && loading ? (
          <span className="sr-only">{busyLabel}</span>
        ) : null}
      </section>
      <section
        className="section usage-stock"
        aria-labelledby={`${id}-stock`}
        aria-busy={groups ? busy : undefined}
      >
        <h2 id={`${id}-stock`}>{USAGE.stock}</h2>
        <Stats>
          <Stat label={USAGE.docs}>{value(figures?.docs)}</Stat>
        </Stats>
      </section>
    </div>
  );
}
