import type { WsStatusKind } from "@/content/workspace/frame";
import { cx } from "@/lib/cx";

import { wsStatus } from "./status-model";

/**
 * A status (frame.md F37, `WsStatus.dc.html`): the word in its shape, `span.status…`. Nothing when the value is
 * none. `className` adds the place's own class (`ws-state` in a row).
 */
export function WsStatus({
  kind,
  value,
  className,
}: {
  kind: WsStatusKind;
  value: string | null | undefined;
  className?: string;
}) {
  const s = wsStatus(kind, value);
  return s ? <span className={cx(s.cls, className)}>{s.word}</span> : null;
}
