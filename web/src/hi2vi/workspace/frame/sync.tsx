import { WS_SYNC } from "@/content/workspace/frame";
import { cx } from "@/lib/cx";

import type { WsSyncLine } from "./sync-model";

/**
 * The sync line (frame.md F40, `WsSync.dc.html`), 12 px at the right end of a Workspace page's first row: the
 * state in its shape and the workspace's version (`Workspace v97` to a screen reader); behind, the words in ink.
 * While the page loads, a skeleton bar.
 */
export function WsSync({
  line,
  loading = false,
}: {
  line: WsSyncLine;
  loading?: boolean;
}) {
  return (
    <p
      className={cx("sync", !loading && line.state !== "fresh" && "is-behind")}
      aria-busy={loading ? true : undefined}
    >
      {loading ? (
        <>
          <span className="skel" style={{ width: "9em" }} />
          <span className="sr-only">{WS_SYNC.loading}</span>
        </>
      ) : (
        <>
          <span className={line.cls}>{line.text}</span>
          {line.version ? (
            <span>
              <span className="sr-only">{WS_SYNC.versionLabel}</span>
              {line.version}
            </span>
          ) : null}
        </>
      )}
    </p>
  );
}
