import type { HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * Panel (components/Panel): `section.panel` with `.panel-head` (an `h2`, then a `.meta` count and one
 * button), `.panel-body` (`rule` draws the hairline under the head: `.has-rule`) and `.panel-foot`
 * (one `.link-row`). A list in a panel is a `ul` of `.row`.
 */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={cx("panel", className)} />;
}

export function PanelHead({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("panel-head", className)} />;
}

export interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  rule?: boolean;
}

export function PanelBody({
  rule = false,
  className,
  ...rest
}: PanelBodyProps) {
  return (
    <div
      {...rest}
      className={cx("panel-body", rule && "has-rule", className)}
    />
  );
}

export function PanelFoot({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("panel-foot", className)} />;
}
