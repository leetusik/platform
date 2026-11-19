import { UNDO_MS } from "@/lib/reader/notes";

/**
 * A delete that waits out its undo line (P63-fk.S11; frame.md F65, F91; P30.S20's delayed delete). MOVED out of the
 * annotation layer's `scheduleDelete` so the waiting is one rule for both looks, and a node test reaches it:
 *
 *  - `start(key, send)`: the mark is gone from the page at once (the caller hides it); `send` runs after ten
 *    seconds. With `alone` (the undo line in the bottom slot: one at a time) a delete still waiting is sent first,
 *    as the old layer did ("a later change replaces it"). A row of the Notes sheet is its own undo line, so rows
 *    wait side by side.
 *  - `undo(key)`: within the ten seconds, nothing is sent (true); after them, too late (false).
 *  - `fire(key)`: send now, if it still waits (a row's own ten seconds ran out first).
 *  - `flush()`: send every delete still waiting (leaving the page, the layer going away).
 *
 * Each `send` runs at most once. Timers are injectable for the test.
 */
export interface UndoClock {
  start(key: string, send: () => void, alone?: boolean): void;
  undo(key: string): boolean;
  fire(key: string): void;
  flush(): void;
  waiting(key: string): boolean;
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const WINDOW_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function undoClock(
  ms: number = UNDO_MS,
  timers: Timers = WINDOW_TIMERS,
): UndoClock {
  const pending = new Map<string, { timer: unknown; send: () => void }>();
  const fire = (key: string) => {
    const p = pending.get(key);
    if (!p) return;
    pending.delete(key);
    timers.clear(p.timer);
    p.send();
  };
  return {
    start(key, send, alone = false) {
      if (alone) for (const k of [...pending.keys()]) fire(k);
      else fire(key);
      const timer = timers.set(() => fire(key), ms);
      pending.set(key, { timer, send });
    },
    undo(key) {
      const p = pending.get(key);
      if (!p) return false;
      pending.delete(key);
      timers.clear(p.timer);
      return true;
    },
    fire,
    flush() {
      for (const k of [...pending.keys()]) fire(k);
    },
    waiting: (key) => pending.has(key),
  };
}
