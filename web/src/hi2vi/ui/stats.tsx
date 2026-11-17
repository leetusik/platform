import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/cx";

/**
 * Stat read-out (components/Stats): a `dl.stats` of `.stat`, each a `.stat-label` over a `.stat-value`.
 * The value is a figure: write it with `num()` from `@/lib/format`; while it loads, a `Skeleton`.
 */
export function Stats({
  className,
  ...rest
}: HTMLAttributes<HTMLDListElement>) {
  return <dl {...rest} className={cx("stats", className)} />;
}

export interface StatProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  label: ReactNode;
  children: ReactNode;
}

export function Stat({ label, children, className, ...rest }: StatProps) {
  return (
    <div {...rest} className={cx("stat", className)}>
      <dt className="stat-label">{label}</dt>
      <dd className="stat-value">{children}</dd>
    </div>
  );
}
