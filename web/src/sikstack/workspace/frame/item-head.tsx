import type { ReactNode } from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

import type { WsBack } from "./states-model";
import type { WsStatusWord } from "./status-model";
import { WsSync } from "./sync";
import type { WsSyncLine } from "./sync-model";

/**
 * An item page's first row (frame.md F35, F41, F84): the way back, reading its destination's name (F36), and the
 * sync line at the row's end, in every state of the page (error and not found included). `ariaLabel` names a
 * back link whose text is not its whole name (a slice's back link reads the phase's id).
 */
export function BackRow({
  href,
  label,
  ariaLabel,
  line,
  loading = false,
}: WsBack & {
  ariaLabel?: string;
  line: WsSyncLine;
  loading?: boolean;
}) {
  return (
    <div className="ws-top">
      <Link className="back" href={href} aria-label={ariaLabel}>
        {label}
      </Link>
      <WsSync line={line} loading={loading} />
    </div>
  );
}

/**
 * An item's page head (frame.md F35, F41, F81, F85): the back row, then the title row (`.page-head.ws-head`, 8 px
 * above its first line and below its last): the `h1` with the id before the name in `--ink-2`, the status after
 * it on the title's baseline, then `after` (a kind's badge, the waiting badge), and the page's actions at the
 * row's end. `headClass` adds a page's own class to the title row; `children` follow the title row inside the
 * header (a sentence under the title, the facts).
 */
export function ItemHead({
  back,
  backLabel,
  line,
  loading = false,
  id,
  name,
  lang,
  status,
  after,
  actions,
  headClass,
  children,
}: {
  back: WsBack;
  backLabel?: string;
  line: WsSyncLine;
  loading?: boolean;
  id: string;
  name: string;
  lang?: string | null;
  status?: WsStatusWord | null;
  after?: ReactNode;
  actions?: ReactNode;
  headClass?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-top">
      <BackRow {...back} ariaLabel={backLabel} line={line} loading={loading} />
      <div className={cx("page-head ws-head", headClass)}>
        <div className="page-title">
          <h1>
            <span className="ws-id">{id}</span>{" "}
            {lang ? <span lang={lang}>{name}</span> : name}
          </h1>
          {status ? <span className={status.cls}>{status.word}</span> : null}
          {after}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
}
