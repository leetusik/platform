import { discarded, retried, type Overlay } from "@/lib/workspace/optimistic";
import type { WriteAnswer } from "@/lib/workspace/types";

import type { AgendaPartKey } from "./model";

export interface UnplacedDone {
  /** The overlay with the notice's entry closed (Try again: its new entry waiting); unchanged when the send failed. */
  overlay: Overlay;
  /** The part whose box takes the focus (Add item when the part or its box is gone). */
  focus: AgendaPartKey;
}

/**
 * Discard or Try again on a notice of an open change no row carries, answered. The notices sit in the open part, and
 * the pressed button is gone with its notice (or was disabled while the send ran, which drops the focus), so the
 * focus follows F303's rule for a finished action: the open part's box, Add item when the part is gone.
 */
export function unplacedDone(
  overlay: Overlay,
  entry: string,
  act: "discard" | "retry",
  answer: WriteAnswer,
  timeZone: string,
  now?: number | Date,
): UnplacedDone {
  if (!answer.ok) return { overlay, focus: "open" };
  return {
    overlay:
      act === "discard"
        ? discarded(overlay, answer.entry)
        : retried(overlay, entry, answer.entry, timeZone, now),
    focus: "open",
  };
}
