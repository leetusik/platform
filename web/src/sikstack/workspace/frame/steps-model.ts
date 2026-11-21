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

/** The narrowest step drawn, in px: under it a phase's steps are one bar (the 4px of the system's switch to the bar). */
export const STEPS_LEAST = 4;
/** The room between two steps, in px (the system's `--space-1`). */
export const STEPS_GAP = 4;
/** A step at its widest in a list of phases, in px (`--steps-seg`). */
const STEPS_SEG = 72;

/**
 * The least width, in px, at which a list whose longest phase is `n` slices draws its steps: every step
 * `STEPS_LEAST` wide. The system's sheet compares it with the steps' own width at layout.
 */
export function stepsFit(n: number): number {
  return Math.max(1, whole(n)) * (STEPS_LEAST + STEPS_GAP) - STEPS_GAP;
}

/** How steps `width` px wide draw: the signed steps (`seg` px each, `width` the room they take), or one bar. */
export type StepsDrawing =
  | { kind: "steps"; seg: number; width: number }
  | { kind: "bar"; width: number };

/**
 * The drawing steps `width` px wide get in a list whose longest phase is `n` (`seg` the widest step: 72 px in a
 * list, 16 px compact). Where a step would be under `STEPS_LEAST` the steps are one bar, at most `width` long.
 */
export function stepsDrawing(
  n: number,
  width: number,
  seg: number = STEPS_SEG,
): StepsDrawing {
  const k = Math.max(1, whole(n));
  if (width < stepsFit(k)) return { kind: "bar", width };
  // a step is never narrower than its two 1 px edges, so steps under the fit would run past `width`
  const step = Math.max(2, Math.min(seg, (width - (k - 1) * STEPS_GAP) / k));
  return { kind: "steps", seg: step, width: k * step + (k - 1) * STEPS_GAP };
}

/** The bar's fill, each a share of the phase (0 to 1): its done slices, then the one running. */
export function stepsBar(
  done: number,
  total: number,
  live: boolean,
): { done: number; now: number } {
  const all = whole(total);
  if (all === 0) return { done: 0, now: 0 };
  const finished = Math.min(whole(done), all);
  return {
    done: finished / all,
    now: live && finished < all ? 1 / all : 0,
  };
}
