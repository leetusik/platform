import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

import type { WsStatusWord } from "./status-model";

/**
 * A list of Workspace rows (frame.md F43): `ul.ws-list`, the size container whose width picks the rows' layout.
 * `longest` sets `--steps-n`, the list's longest phase, so every row's steps are the same width.
 */
export function WsList({
  longest,
  label,
  className,
  children,
}: {
  longest?: number;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <ul
      className={cx("ws-list", className)}
      aria-label={label}
      style={
        longest === undefined
          ? undefined
          : ({ "--steps-n": longest } as CSSProperties)
      }
    >
      {children}
    </ul>
  );
}

/**
 * A Workspace row (frame.md F43, `WsProgress.dc.html`): the id, the name as the row's one link (with an optional
 * second line), the status, then one cell of its own (a phase's progress, a job's date, a slice's kind):
 *
 *   li.row.ws-row > span.ws-id + a.link-strong.ws-open.ws-name > span.row-stack > span.ws-name-text + span.meta.ws-sub
 *                 + span.<status>.ws-state + .ws-end
 *
 * A string `end` is wrapped in `span.ws-end`; an element is the cell itself and carries `ws-end` (a `Steps`
 * passes `className="ws-end"`). `lang` marks Korean data (`lang="ko"`).
 */
export function WsRow({
  id,
  name,
  href,
  lang,
  sub,
  subLang,
  status,
  end,
  className,
}: {
  id: ReactNode;
  name: string;
  href: string;
  lang?: string | null;
  sub?: ReactNode;
  subLang?: string | null;
  status: WsStatusWord | null;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cx("row ws-row", className)}>
      <span className="ws-id">{id}</span>
      <Link className="link-strong ws-open ws-name" href={href}>
        <span className="row-stack">
          <span className="ws-name-text" lang={lang ?? undefined}>
            {name}
          </span>
          {sub ? (
            <span className="meta ws-sub" lang={subLang ?? undefined}>
              {sub}
            </span>
          ) : null}
        </span>
      </Link>
      {status ? (
        <span className={cx(status.cls, "ws-state")}>{status.word}</span>
      ) : (
        <span className="ws-state" />
      )}
      {typeof end === "string" || typeof end === "number" ? (
        <span className="ws-end">{end}</span>
      ) : (
        (end ?? null)
      )}
    </li>
  );
}
