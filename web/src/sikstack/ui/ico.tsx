import type { HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/** The marks the system draws (job 07 F202): CSS shapes, never SVG artwork. */
export type IcoName = "play" | "pause" | "prev" | "next" | "again" | "up";

export interface IcoProps extends HTMLAttributes<HTMLSpanElement> {
  name: IcoName;
}

/**
 * A mark inside a control (`.ico`): a 16 px square centred on the label's line, hidden from assistive
 * technology; the control carries the words. A control that holds only a mark is `.btn-ico` with an
 * `aria-label`.
 */
export function Ico({ name, className, ...rest }: IcoProps) {
  return (
    <span
      {...rest}
      aria-hidden="true"
      className={cx("ico", `ico-${name}`, className)}
    />
  );
}
