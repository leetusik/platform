import type { HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * Blocks (components/Block): the empty, error and not-found states. `.block` with `.block-text` (one
 * sentence, one action), inside a panel as `block panel-body has-rule`; `page` is a whole page's block
 * (`.block-page`) with its `h1.block-title` on the line a page title takes (frame.md F32).
 */
export interface BlockProps extends HTMLAttributes<HTMLDivElement> {
  page?: boolean;
}

export function Block({ page = false, className, ...rest }: BlockProps) {
  return (
    <div {...rest} className={cx("block", page && "block-page", className)} />
  );
}

export function BlockText({
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...rest} className={cx("block-text", className)} />;
}

export function BlockTitle({
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 {...rest} className={cx("block-title", className)} />;
}
