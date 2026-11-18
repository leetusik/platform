import { WS_PROGRESS } from "@/content/workspace/frame";

/** One step a slice: done (`is-done`), the one running (`is-now`), or still to come (`""`). */
export type WsStep = "is-done" | "is-now" | "";

/** A phase's progress (frame.md F39, `WS.track`): `1/7`, its name, and one step a slice. */
export interface WsSteps {
  count: string;
  label: string;
  segs: WsStep[];
}

const whole = (n: number) => Math.max(0, Math.floor(Number(n)) || 0);

/** `done` of `total` slices; `live` marks the step after the last done one as running. */
export function wsSteps(done: number, total: number, live: boolean): WsSteps {
  const all = whole(total);
  const finished = Math.min(whole(done), all);
  const running = live && finished < all;
  return {
    count: WS_PROGRESS.count(finished, all),
    label: WS_PROGRESS.label(finished, all, running),
    segs: Array.from({ length: all }, (_, i) =>
      i < finished ? "is-done" : running && i === finished ? "is-now" : "",
    ),
  };
}

/** A phase's steps: one slice runs only while the phase is in progress and not every slice is done. */
export function phaseSteps(phase: {
  done: number;
  total: number;
  status: string | null;
}): WsSteps {
  return wsSteps(
    phase.done,
    phase.total,
    phase.status === "in_progress" && phase.done < phase.total,
  );
}

/** `--steps-n` for a list: its longest phase, so every row's segment is the same width (at least 1). */
export function stepsN(totals: number[]): number {
  return Math.max(1, ...totals.map(whole));
}
