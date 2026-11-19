import { useSyncExternalStore } from "react";

/**
 * P64-3y.F1 — the text whose head press is out (`textOf`), one per page: the head's control and its pill set it
 * at the press, so the head (Starting…) and the dock's track (nothing yet) read one answer (`startingOf`), and the
 * head clears it once its Listen answers or the page goes. A module store, as `@/lib/listen/store` is.
 */
let pressed: string | null = null;
const listeners = new Set<() => void>();

export function getPressed(): string | null {
  return pressed;
}

export function setPressed(next: string | null): void {
  if (next === pressed) return;
  pressed = next;
  for (const fn of listeners) fn();
}

export function usePressed(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getPressed,
    () => null,
  );
}
