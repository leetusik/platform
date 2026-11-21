import { describe, expect, it } from "vitest";

import { trendModel, trendWords } from "@/sikstack/frame/trend-model";

const LAST = "2026-11-15";

describe("Trend's geometry", () => {
  it("draws thirty bars for a series up to thirty days, padding a short one on the left", () => {
    for (const length of [0, 1, 7, 29, 30]) {
      const model = trendModel(new Array(length).fill(3), LAST);
      expect(model.bars).toHaveLength(30);
      const zeros = model.bars.slice(0, 30 - length);
      expect(zeros.every((b) => b.count === 0)).toBe(true);
      expect(model.bars.slice(30 - length).every((b) => b.count === 3)).toBe(
        true,
      );
    }
  });

  it("cuts a longer series to its last thirty days", () => {
    const series = Array.from({ length: 45 }, (_, i) => i + 1);
    const model = trendModel(series, LAST);
    expect(model.bars.map((b) => b.count)).toEqual(series.slice(-30));
  });

  it("gives the tallest count the full height and a zero count the zero bar", () => {
    const series = [...new Array(27).fill(10), 0, 105, 42];
    const model = trendModel(series, LAST);
    expect(model.peak).toBe(105);
    expect(model.bars[28].height).toBe("100%");
    expect(model.bars[27].height).toBe("0%");
    expect(model.bars[29].height).toBe("40%");
    expect(model.bars[0].height).toBe("9.5%");
  });

  it("is the empty state when every count is zero", () => {
    expect(trendModel(new Array(30).fill(0), LAST).kind).toBe("empty");
    expect(trendModel([], LAST).kind).toBe("empty");
    expect(trendModel([0, 0, 1], LAST).kind).toBe("filled");
  });

  it("marks only the last bar as today, on the last day", () => {
    const model = trendModel([1, 2, 3], LAST);
    expect(model.bars.filter((b) => b.today)).toHaveLength(1);
    expect(model.bars[29].today).toBe(true);
    expect(model.bars[29].day).toBe(LAST);
  });

  it("writes the axis and the caption as the board does", () => {
    const model = trendModel([1554 - 105, 105], LAST);
    const words = trendWords(model, {
      now: Date.parse("2026-11-15T01:00:00Z"),
    });
    expect([words.first, words.last]).toEqual(["Oct 17", "Nov 15"]);
    expect([words.total, words.peak]).toEqual(["1,554", "1,449"]);
    expect(words.tip(model.bars[29])).toBe("Nov 15: 105");
  });
});
