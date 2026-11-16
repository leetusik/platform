import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import { cx } from "@/lib/cx";

/**
 * Button (components/Button): `.btn`, the one control for an action, one height. Variants are the
 * bundle's: default (secondary), `primary`, `quiet`, `danger`. A pending send is `busy`: `data-busy`
 * and `aria-busy`, and with `busyLabel` both labels share one `.swap` cell so the width never changes.
 * A link drawn as a button is `ButtonLink` (`a.btn`), or `buttonClass()` on a framework link.
 */
export type ButtonVariant = "default" | "primary" | "quiet" | "danger";

export function buttonClass(
  variant: ButtonVariant = "default",
  className?: string,
): string {
  return cx("btn", variant !== "default" && `btn-${variant}`, className);
}

/** The swap cell: every label in one grid cell; the first shows, the last under `data-busy` or `data-swap`. */
export function Swap({ labels }: { labels: ReactNode[] }) {
  return (
    <span className="swap">
      {labels.map((label, i) => (
        <span key={i}>{label}</span>
      ))}
    </span>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
  busyLabel?: ReactNode;
}

export function Button({
  variant = "default",
  busy = false,
  busyLabel,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass(variant, className)}
      data-busy={busy ? "true" : undefined}
      aria-busy={busy ? true : undefined}
    >
      {busyLabel === undefined ? (
        children
      ) : (
        <Swap labels={[children, busyLabel]} />
      )}
    </button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
}

export function ButtonLink({
  variant = "default",
  className,
  ...rest
}: ButtonLinkProps) {
  return <a {...rest} className={buttonClass(variant, className)} />;
}
