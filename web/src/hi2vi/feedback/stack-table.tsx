import type { ReactNode, TableHTMLAttributes } from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

/**
 * A table that stacks (`Stack.dc.html`, frame.md F130, F139): `div.table-scroll.table-stack >
 * table.table`. Under 48em of its own width each row is its main cell (`td.has-control.is-main`), then
 * its other cells on one line in the second ink, the `td.to-end` cell at the line's end; the column
 * heads stay for a screen reader. `set` (`.stack-set`) sets the columns, never sized by what the rows
 * hold: the list's heads take `.stack-rating`, `.stack-project`, `.stack-product`, `.stack-when`, a cell
 * whose value may run long `.stack-wrap`, and its message stops at 56ch (F140).
 */
export interface StackTableProps extends TableHTMLAttributes<HTMLTableElement> {
  set?: boolean;
}

export function StackTable({
  set = false,
  className,
  ...rest
}: StackTableProps) {
  return (
    <div className="table-scroll table-stack">
      <table {...rest} className={cx("table", set && "stack-set", className)} />
    </div>
  );
}

/**
 * A row's one link (frame.md F130): `a.link-strong` holding the text cut at two lines (`.clamp-2`),
 * 12 px over and under it, so one line is the 44 px target. The href is the caller's (the item's
 * address, with the way back the list's place gives).
 */
export function ClampLink({
  href,
  lang,
  prefetch,
  children,
}: {
  href: string;
  lang?: string;
  prefetch?: boolean;
  children: ReactNode;
}) {
  return (
    <Link className="link-strong" lang={lang} href={href} prefetch={prefetch}>
      <span className="clamp-2">{children}</span>
    </Link>
  );
}
