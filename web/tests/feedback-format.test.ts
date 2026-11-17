import { describe, expect, it } from "vitest";

import {
  at,
  bytes,
  countLine,
  json,
  ratingOf,
  when,
  word,
  zoneLabel,
} from "@/lib/feedback/format";

// The Feedback frame's formats (job 04 round 02, frame.md F122, F123, F126, F343, and the fixture's
// `FW`): every date in the viewer's zone, UTC until it is known (P63-fk's one time zone).

const NOW = Date.parse("2026-11-15T10:00:00+09:00");

describe("a rating (F122)", () => {
  it("reads feedback_value 1, 2 and null as Liked, Disliked and Unrated", () => {
    expect(ratingOf(1)).toEqual({
      key: "liked",
      word: "Liked",
      className: "rating rating-liked",
    });
    expect(ratingOf(2)).toEqual({
      key: "disliked",
      word: "Disliked",
      className: "rating rating-disliked",
    });
    expect(ratingOf(null)).toEqual({
      key: "unrated",
      word: "Unrated",
      className: "rating rating-unrated",
    });
  });
});

describe("a file's size (F123, FW.bytes)", () => {
  it("uses binary units, one decimal from KB up", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(248112)).toBe("242.3 KB");
    expect(bytes(1258291)).toBe("1.2 MB");
    expect(bytes(18204)).toBe("17.8 KB");
    expect(bytes(0)).toBe("0 B");
    expect(bytes(1023)).toBe("1,023 B");
    expect(bytes(1024)).toBe("1.0 KB");
  });
});

describe("the count line (F343)", () => {
  it("reads the total at rest and the matches under a search or a filter", () => {
    expect(countLine(230, false)).toBe("230 pieces of feedback");
    expect(countLine(1, false)).toBe("1 piece of feedback");
    expect(countLine(0, false)).toBe("0 pieces of feedback");
    expect(countLine(12, true)).toBe("12 matches");
    expect(countLine(1, true)).toBe("1 match");
    expect(countLine(0, true)).toBe("0 matches");
    expect(countLine(1554, false)).toBe("1,554 pieces of feedback");
  });
});

describe("an exact time (F123, FW.at)", () => {
  it("is the day and a 24-hour clock in the given zone, with that zone's label", () => {
    const options = { now: NOW, timeZone: "Asia/Seoul" };
    expect(at("2026-11-14T23:00:00Z", options)).toBe("Nov 15, 08:00");
    expect(at("2026-11-14T22:59:00Z", options)).toBe("Nov 15, 07:59");
    expect(at("2025-11-20T01:00:00Z", options)).toBe("Nov 20, 2025, 10:00");
    expect(at("2026-11-14T15:00:00Z", options)).toBe("Nov 15, 00:00");
    expect(zoneLabel("Asia/Seoul", NOW)).toBe("GMT+9");
    expect(
      zoneLabel("America/New_York", Date.parse("2026-01-15T12:00:00Z")),
    ).toBe("GMT-5");
    expect(zoneLabel("Asia/Kolkata", NOW)).toBe("GMT+5:30");
  });

  it("is in UTC while the viewer's zone is unknown", () => {
    expect(at("2026-11-14T23:00:00Z", { now: NOW })).toBe("Nov 14, 23:00");
    expect(at("2026-11-14T23:00:00Z", { now: NOW, timeZone: "UTC" })).toBe(
      "Nov 14, 23:00",
    );
    expect(zoneLabel(undefined, NOW)).toBe(zoneLabel("UTC", NOW));
  });

  it("draws the dash for a value that is not a time", () => {
    expect(at("not a time", { now: NOW })).toBe("—");
  });
});

describe("a time that passed (F123, FW.when)", () => {
  it("is relative, then the day in the viewer's zone", () => {
    expect(when("2026-11-15T08:00:00+09:00", { now: NOW })).toBe("2h ago");
    expect(when("2026-11-12T10:00:00+09:00", { now: NOW })).toBe("3d ago");
    // 20:00 UTC on Nov 5 is 05:00 on Nov 6 in Seoul
    expect(
      when("2026-11-05T20:00:00Z", { now: NOW, timeZone: "Asia/Seoul" }),
    ).toBe("Nov 6");
    expect(when("2026-11-05T20:00:00Z", { now: NOW })).toBe("Nov 5");
    expect(when("2025-11-20T01:00:00Z", { now: NOW })).toBe("Nov 20, 2025");
  });
});

describe("the closed sets, as words (F121, FW.word)", () => {
  it("reads each closed value as its word and a free string as written", () => {
    expect(word("recordedBy", "agent")).toBe("Agent");
    expect(word("recordedBy", "human")).toBe("Human");
    expect(word("trigger", "dislike")).toBe("Dislike");
    expect(word("trigger", "survey")).toBe("Survey");
    expect(word("target", "surface")).toBe("Surface");
    expect(word("target", "conversation")).toBe("Conversation");
    expect(word("trigger", "thumbs")).toBe("thumbs");
    expect(word("trigger", null)).toBeNull();
    expect(word("recordedBy", undefined)).toBeNull();
  });
});

describe("raw JSON (F126, FW.json)", () => {
  it("is nothing for an empty value, else indented by two", () => {
    expect(json({})).toBeNull();
    expect(json([])).toBeNull();
    expect(json(null)).toBeNull();
    expect(json(undefined)).toBeNull();
    expect(json({ control: "thumbs_down", shown_for_ms: 8420 })).toBe(
      '{\n  "control": "thumbs_down",\n  "shown_for_ms": 8420\n}',
    );
    expect(json([{ role: "user" }])).toBe('[\n  {\n    "role": "user"\n  }\n]');
  });
});
