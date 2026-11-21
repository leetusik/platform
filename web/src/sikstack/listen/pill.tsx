import { LISTEN } from "@/content/listen";
import { Ico } from "@/sikstack/ui";

import type { HeadControl } from "./model";

/**
 * Listen's pill (F207, listen:FG3, F234; `Listen.dc.html`): with no Listen and the head's control under the top
 * bar, the Library's `.pill` as one button in the dock's track: the play mark, **Listen** or **Continue
 * listening**, then its figure in `--ink-2`, the middle dot before it drawn by `.listen-q::before` (C04), so no
 * line opens with a dot. It does what the head's control does.
 */
export function ListenPill({
  control,
  onGo,
}: {
  control: HeadControl;
  onGo?: () => void;
}) {
  const label =
    control.form === "resume" ? LISTEN.control.continue : LISTEN.control.listen;
  return (
    <button type="button" className="pill listen-pill" onClick={() => onGo?.()}>
      <Ico name="play" />
      <span>{label}</span>
      {control.pillQ ? <span className="listen-q">{control.pillQ}</span> : null}
    </button>
  );
}
