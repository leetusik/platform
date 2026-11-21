import type { CSSProperties, HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * Skeleton (components/Skeleton): a `.skel` bar inside the real element, so the structure keeps its
 * size; `plot` is the chart's bar (`.skel-plot`). `width` is the bar's length, as the boards set it
 * (`3em`). The loading region carries `aria-busy="true"` and a `.sr-only` `Loading…`.
 */
export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: CSSProperties["width"];
  plot?: boolean;
}

export function Skeleton({
  width,
  plot = false,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      {...rest}
      className={cx("skel", plot && "skel-plot", className)}
      style={width === undefined ? style : { ...style, width }}
    />
  );
}
