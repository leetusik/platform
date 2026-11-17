import { describe, expect, it } from "vitest";

import { date, due, num, plural, when } from "@/lib/format";

// The canvas's today (frame.md F2): Sunday, Nov 15, 2026, 10:00 in Seoul.
const NOW = Date.parse("2026-11-15T10:00:00+09:00");
const SEOUL = { now: NOW, timeZone: "Asia/Seoul" };
const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("num", () => {
  it("groups thousands, en-US", () => {
    expect(num(1554)).toBe("1,554");
    expect(num(0)).toBe("0");
    expect(num(1234567)).toBe("1,234,567");
  });
});

describe("plural", () => {
  it("writes a count with its unit", () => {
    expect(plural(1, "project")).toBe("1 project");
    expect(plural(24, "project")).toBe("24 projects");
    expect(plural(0, "project")).toBe("0 projects");
    expect(plural(1554, "document")).toBe("1,554 documents");
    expect(plural(14, "chapter")).toBe("14 chapters");
    expect(plural(2, "activity", "activities")).toBe("2 activities");
  });
});

describe("date", () => {
  it("writes Nov 13 for 13 November of this year", () => {
    expect(date("2026-11-13", SEOUL)).toBe("Nov 13");
    expect(date("2026-11-14", SEOUL)).toBe("Nov 14");
  });

  it("adds the year only when it is not this one", () => {
    expect(date("2025-12-09", SEOUL)).toBe("Dec 9, 2025");
  });

  it("reads an instant in the given time zone, a calendar date as written", () => {
    expect(date("2026-11-13T01:30:00Z", SEOUL)).toBe("Nov 13");
    expect(
      date("2026-11-13T01:30:00Z", {
        now: NOW,
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("Nov 12");
    expect(
      date("2026-11-13", { now: NOW, timeZone: "America/Los_Angeles" }),
    ).toBe("Nov 13");
  });

  it("writes the dash for a value that is not a date", () => {
    expect(date("not a date", SEOUL)).toBe("—");
  });
});

describe("when", () => {
  it("writes Never for a time that never happened", () => {
    expect(when(null, SEOUL)).toBe("Never");
    expect(when(undefined, SEOUL)).toBe("Never");
  });

  it("writes recent times as just now, minutes, hours and days ago", () => {
    expect(when(ago(30e3), SEOUL)).toBe("just now");
    expect(when(ago(12 * MIN), SEOUL)).toBe("12m ago");
    expect(when(ago(40 * MIN), SEOUL)).toBe("40m ago");
    expect(when(ago(2 * HOUR), SEOUL)).toBe("2h ago");
    expect(when(ago(3 * DAY), SEOUL)).toBe("3d ago");
    expect(when(ago(7 * DAY - MIN), SEOUL)).toBe("6d ago");
  });

  it("writes the date from 7 days on", () => {
    expect(when(ago(7 * DAY), SEOUL)).toBe("Nov 8");
    expect(when(ago(61 * DAY), SEOUL)).toBe("Sep 15");
    expect(when("2025-12-09T08:45:00Z", SEOUL)).toBe("Dec 9, 2025");
  });
});

describe("due", () => {
  it("writes Review's count: nothing at 0, 99+ over 99", () => {
    expect(due(0)).toBe("");
    expect(due(7)).toBe("7");
    expect(due(99)).toBe("99");
    expect(due(112)).toBe("99+");
  });
});
