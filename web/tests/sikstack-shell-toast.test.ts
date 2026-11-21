import { describe, expect, it } from "vitest";

import { createToastStore, TOAST_MS } from "@/sikstack/shell/toast-store";

// P58 — the one toast (frame.md F4, F10's recipe): at most one at a time, a new one replaces the
// old, each leaves after 4 s unless a newer one replaced it first.

function fakeTimers() {
  let now = 0;
  const pending = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    timers: {
      set: (run: () => void, ms: number) => {
        const id = next++;
        pending.set(id, { at: now + ms, run });
        return id;
      },
      clear: (handle: unknown) => {
        pending.delete(handle as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.run();
        }
      }
    },
    pendingCount: () => pending.size,
  };
}

describe("the toast publisher", () => {
  it("holds at most one toast; a new one replaces the old", () => {
    const clock = fakeTimers();
    const store = createToastStore<string>({ timers: clock.timers });
    store.publish("Project changple created.");
    store.publish("platform is now public.");
    expect(store.get()?.message).toBe("platform is now public.");
    expect(clock.pendingCount()).toBe(1);
  });

  it("leaves after 4 s, counted from the newest toast", () => {
    const clock = fakeTimers();
    const store = createToastStore<string>({ timers: clock.timers });
    store.publish("first");
    clock.advance(3000);
    store.publish("second");
    clock.advance(TOAST_MS - 1);
    expect(store.get()?.message).toBe("second");
    clock.advance(1);
    expect(store.get()).toBeNull();
  });

  it("tells its subscribers, and stops after unsubscribe", () => {
    const clock = fakeTimers();
    const store = createToastStore<string>({ timers: clock.timers });
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.publish("a");
    store.clear();
    off();
    store.publish("b");
    expect(calls).toBe(2);
    expect(TOAST_MS).toBe(4000);
  });
});
