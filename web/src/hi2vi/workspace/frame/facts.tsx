import type { ReactNode } from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

/** An item's short facts (frame.md F44): `dl.facts`, label-over-value pairs that wrap. */
export function Facts({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <dl className={cx("facts", className)}>{children}</dl>;
}

/** A link as a fact's value: the id it opens, and its name when the id alone is not (`Depends on S1`). */
export interface FactLink {
  id: string;
  href: string;
  label?: string;
}

/**
 * One fact, `div.fact > dt + dd`. `long` gives a sentence its own line at the measure (F80, `.ws-fact-long`).
 * `links` are a fact's value as links (a slice it depends on, a job's source): each link's 44 px box is its hit
 * area only and its focus ring is on the id (F80, `.ws-fact-links`).
 */
export function Fact({
  label,
  long = false,
  links,
  lang,
  className,
  children,
}: {
  label: ReactNode;
  long?: boolean;
  links?: FactLink[];
  lang?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("fact", long && "ws-fact-long", className)}>
      <dt>{label}</dt>
      {links ? (
        <dd className="ws-fact-links">
          {links.map((link) => (
            <Link
              key={link.href}
              className="link ws-fact-link"
              href={link.href}
              aria-label={link.label}
            >
              <span className="ws-fact-link-id">{link.id}</span>
            </Link>
          ))}
        </dd>
      ) : (
        <dd lang={lang ?? undefined}>{children}</dd>
      )}
    </div>
  );
}
