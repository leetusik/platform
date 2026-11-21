import type { HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * The three marks (components/Badge): `.badge` states a fact about the thing beside it, `.count` holds
 * a number (use `due()` from `@/lib/format`: `99+` over 99, absent at 0), `.status` names a state with
 * a shape. The caller supplies the word.
 */
export function Badge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={cx("badge", className)} />;
}

export function Count({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={cx("count", className)} />;
}

/**
 * `active` is the filled dot (`.status`); the others are the bundle's more shapes: `busy` (the turning ring) and
 * `fail` (the error mark) are Listen and Review's (job 07 F204).
 */
export type StatusState =
  "active" | "idle" | "live" | "revoked" | "done" | "busy" | "fail";

export interface StatusProps extends HTMLAttributes<HTMLSpanElement> {
  state?: StatusState;
}

export function Status({ state = "active", className, ...rest }: StatusProps) {
  return (
    <span
      {...rest}
      className={cx(
        "status",
        state !== "active" && `status-${state}`,
        className,
      )}
    />
  );
}
