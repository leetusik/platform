import type { HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * Section (components/Section): parts of a page under a heading, no surface: `section.section` with
 * `.section-head` (an `h2` and, at its end, one line of `.meta`).
 */
export function Section({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={cx("section", className)} />;
}

export function SectionHead({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("section-head", className)} />;
}
