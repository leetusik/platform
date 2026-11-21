import type { TableHTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * Data table (components/Table): a real `table.table` inside a `.table-scroll` box, the only thing on
 * a page that scrolls sideways. `capped`: a long table that scrolls inside itself and keeps its
 * header (`.is-capped`). `keys`: the keys table's declared columns (`.is-keys`, frame.md F21). The
 * caller supplies `thead` (every column a `th scope="col"`) and `tbody`; `.num`, `.nowrap`,
 * `td.has-control` and `td.at-end` go on the cells.
 */
export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  capped?: boolean;
  keys?: boolean;
}

export function Table({
  capped = false,
  keys = false,
  className,
  ...rest
}: TableProps) {
  return (
    <div className={cx("table-scroll", capped && "is-capped")}>
      <table {...rest} className={cx("table", keys && "is-keys", className)} />
    </div>
  );
}
