import { afterEach, describe, expect, it, vi } from "vitest";

import {
  blockCopyLabel,
  copyMachine,
  type CopyResult,
} from "@/hi2vi/frame/copy-state";

afterEach(() => {
  vi.useRealTimers();
});

describe("Copy's state", () => {
  it("reads Copied for 2 s after a copy that lands, then the rest label", async () => {
    vi.useFakeTimers();
    const seen: CopyResult[] = [];
    const writes: string[] = [];
    const machine = copyMachine((r) => seen.push(r));
    await machine.press("hi2vi.com/@june", {
      writeText: async (t) => {
        writes.push(t);
      },
    });
    expect(writes).toEqual(["hi2vi.com/@june"]);
    expect(seen).toEqual(["copied"]);
    vi.advanceTimersByTime(1999);
    expect(seen).toEqual(["copied"]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["copied", "rest"]);
  });

  it("gives the failure line and never Copied when the clipboard refuses", async () => {
    vi.useFakeTimers();
    const seen: CopyResult[] = [];
    const machine = copyMachine((r) => seen.push(r));
    await machine.press("vk_x", {
      writeText: () =>
        Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
    await machine.press("vk_x", undefined);
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(["failed", "failed"]);
  });

  it("restarts the 2 s on a second press", async () => {
    vi.useFakeTimers();
    const seen: CopyResult[] = [];
    const machine = copyMachine((r) => seen.push(r));
    const clipboard = { writeText: async () => {} };
    await machine.press("a", clipboard);
    vi.advanceTimersByTime(1500);
    await machine.press("a", clipboard);
    vi.advanceTimersByTime(1500);
    expect(seen).toEqual(["copied", "copied"]);
    vi.advanceTimersByTime(500);
    expect(seen).toEqual(["copied", "copied", "rest"]);
  });

  it("names the block form's button from what it copies", () => {
    expect(blockCopyLabel("Install command")).toBe("Copy install command");
  });
});
