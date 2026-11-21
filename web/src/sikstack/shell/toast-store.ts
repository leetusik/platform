// The one-toast store (frame.md F4 and F10's recipe; F29 places the region): at most one toast,
// a new one replaces the old, and each leaves after 4 s unless a newer one replaced it first.
// Pure, with injectable timers, so the rule is tested without React (tests/sikstack-shell-toast.test.ts).

/** How long a toast stays: four seconds. */
export const TOAST_MS = 4000;

export interface Toast<M> {
  /** Grows with every publish, so a timer never clears a newer toast. */
  id: number;
  message: M;
}

export interface ToastTimers {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface ToastStore<M> {
  /** The toast on screen, or `null`. */
  get: () => Toast<M> | null;
  /** Show `message`, replacing any toast on screen. */
  publish: (message: M) => void;
  /** Take the toast down now. */
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
}

const realTimers: ToastTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createToastStore<M>(
  options: { duration?: number; timers?: ToastTimers } = {},
): ToastStore<M> {
  const duration = options.duration ?? TOAST_MS;
  const timers = options.timers ?? realTimers;
  const listeners = new Set<() => void>();
  let current: Toast<M> | null = null;
  let seq = 0;
  let timer: unknown = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const stopTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  return {
    get: () => current,
    publish(message) {
      stopTimer();
      const id = ++seq;
      current = { id, message };
      timer = timers.set(() => {
        if (current?.id !== id) return;
        current = null;
        timer = null;
        emit();
      }, duration);
      emit();
    },
    clear() {
      stopTimer();
      if (current === null) return;
      current = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
