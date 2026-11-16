import { useId, type ReactNode } from "react";

import { USAGE } from "@/content/hi2vi-frame";
import { num } from "@/lib/format";

import { Skeleton, Stat, Stats } from "@/hi2vi/ui";

/**
 * The usage read-out (frame.md F17, `ProjectHome.dc.html`): two headed groups in one `.usage` row,
 * **Usage, last 30 days** over Documents created, Searches and Deleted, and **Documents** over Active
 * total, so the one figure that is held now never sits under the 30-day heading. Each figure is
 * `num()`; an empty org or project reads `0`. Loading keeps both heads and puts a 3em `.skel` in each
 * figure, with `aria-busy`. Org home and project home draw the same words.
 */
export interface UsageFigures {
  docs30: number;
  searches30: number;
  deleted30: number;
  /** The active documents now. */
  docs: number;
}

export type UsageProps =
  | { loading: true; figures?: undefined }
  | { loading?: false; figures: UsageFigures };

export function Usage({ loading, figures }: UsageProps) {
  const id = useId();
  const value = (n: number | undefined): ReactNode =>
    loading || n === undefined ? <Skeleton width="3em" /> : num(n);
  return (
    <div className="usage" aria-busy={loading ? "true" : undefined}>
      <section
        className="section usage-window"
        aria-labelledby={`${id}-window`}
      >
        <h2 id={`${id}-window`}>{USAGE.window}</h2>
        <Stats>
          <Stat label={USAGE.docs30}>{value(figures?.docs30)}</Stat>
          <Stat label={USAGE.searches30}>{value(figures?.searches30)}</Stat>
          <Stat label={USAGE.deleted30}>{value(figures?.deleted30)}</Stat>
        </Stats>
      </section>
      <section className="section usage-stock" aria-labelledby={`${id}-stock`}>
        <h2 id={`${id}-stock`}>{USAGE.stock}</h2>
        <Stats>
          <Stat label={USAGE.docs}>{value(figures?.docs)}</Stat>
        </Stats>
      </section>
    </div>
  );
}
