import { LISTEN } from "@/content/listen";
import { Ico } from "@/sikstack/ui";

import type { HeadControl } from "./model";

/**
 * Listen's control in a head (F207, `AudioHead.dc.html`): **Listen** with its scope or length, reading
 * **Starting…** in Listen's own width while busy (F238: the cell starts at the mark), or **Continue
 * listening** at its place with **Start over**, the quieter text link, at the row's end.
 */
export function Control({
  control,
  busy,
  onListen,
  onResume,
  onStartOver,
}: {
  control: HeadControl;
  busy: boolean;
  onListen: () => void;
  onResume: () => void;
  onStartOver: () => void;
}) {
  const C = LISTEN.control;
  if (control.form === "resume" && !busy) {
    return (
      <div className="listen-ctl">
        <button type="button" className="btn" onClick={onResume}>
          <Ico name="play" />
          {C.continue}
        </button>
        <span className="listen-q">{control.at}</span>
        <button type="button" className="link-row" onClick={onStartOver}>
          {C.startOver}
        </button>
      </div>
    );
  }
  return (
    <div className="listen-ctl">
      <button
        type="button"
        className="btn"
        data-busy={busy ? "true" : "false"}
        onClick={busy ? undefined : onListen}
      >
        <Ico name="play" />
        <span className="swap">
          <span>{C.listen}</span>
          <span>{C.starting}</span>
        </span>
      </button>
      <span className="listen-q">
        {busy || control.form === "resume" ? "" : control.q}
      </span>
    </div>
  );
}
