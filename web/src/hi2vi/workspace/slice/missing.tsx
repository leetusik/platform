import { WS_SLICE } from "@/content/workspace/slice";
import { StateBlock, type StateModel } from "@/hi2vi/states";
import { BackRow, type WsBack, type WsSyncLine } from "@/hi2vi/workspace/frame";

/**
 * Not found and Error (`Slice.dc.html`; F49), directly under the back row: the back link reads the phase's id,
 * and the sync line stands when the page knows it (null: the workspace's own read failed too, so there is no
 * line to draw).
 */
export function SliceMissing({
  back,
  line,
  state,
  onRetry,
}: {
  back: WsBack;
  line: WsSyncLine | null;
  state: StateModel;
  onRetry?: () => void;
}) {
  return (
    <div className="column">
      <div>
        {line ? (
          <BackRow
            {...back}
            ariaLabel={WS_SLICE.back(back.label)}
            line={line}
          />
        ) : (
          <div className="ws-top">
            <a
              className="back"
              href={back.href}
              aria-label={WS_SLICE.back(back.label)}
            >
              {back.label}
            </a>
          </div>
        )}
        <StateBlock state={state} onRetry={onRetry} />
      </div>
    </div>
  );
}
