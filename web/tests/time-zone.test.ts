import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_ZONE,
  TIME_ZONE_COOKIE,
  resolveTimeZone,
  timeZoneCookieString,
  viewerTimeZone,
  zoneToWrite,
} from "@/lib/time-zone";

// The one time zone: every date is in the viewer's zone, from a cookie, UTC until it is known.
// The core rules only: what the server reads, and when the setter writes.

const store = (value?: string) => ({
  get: (name: string) =>
    name === TIME_ZONE_COOKIE && value !== undefined ? { value } : undefined,
});

describe("viewerTimeZone", () => {
  it("is UTC with no cookie", () => {
    expect(viewerTimeZone(store())).toBe("UTC");
    expect(DEFAULT_TIME_ZONE).toBe("UTC");
  });

  it.each([
    ["Mars/Base"],
    [""],
    ["Asia/Seoul; Path=/"],
    ["<script>"],
    ["x".repeat(65)],
  ])("is UTC for an invalid or unknown zone %j", (value) => {
    expect(viewerTimeZone(store(value))).toBe("UTC");
    expect(resolveTimeZone(value)).toBe("UTC");
  });

  it.each([
    ["Asia/Seoul"],
    ["America/Argentina/Buenos_Aires"],
    ["Etc/GMT+9"],
    ["UTC"],
  ])("uses a valid zone %s as given", (value) => {
    expect(viewerTimeZone(store(value))).toBe(value);
  });
});

describe("zoneToWrite: the setter writes once", () => {
  it("writes the browser's zone when the cookie is missing", () => {
    expect(zoneToWrite("", "Asia/Seoul")).toBe("Asia/Seoul");
    expect(zoneToWrite("kb_reader=size=3", "Asia/Seoul")).toBe("Asia/Seoul");
  });

  it("writes nothing when the cookie already holds that zone", () => {
    const jar = `kb_reader=size=3; ${timeZoneCookieString("Asia/Seoul", false).split(";")[0]}`;
    expect(zoneToWrite(jar, "Asia/Seoul")).toBeNull();
    const encoded = timeZoneCookieString(
      "America/Argentina/Buenos_Aires",
      true,
    ).split(";")[0];
    expect(zoneToWrite(encoded, "America/Argentina/Buenos_Aires")).toBeNull();
  });

  it("rewrites a different or tampered zone, and never writes an invalid one", () => {
    expect(zoneToWrite(`${TIME_ZONE_COOKIE}=Europe/Paris`, "Asia/Seoul")).toBe(
      "Asia/Seoul",
    );
    expect(zoneToWrite(`${TIME_ZONE_COOKIE}=Mars/Base`, "Asia/Seoul")).toBe(
      "Asia/Seoul",
    );
    expect(zoneToWrite("", "Mars/Base")).toBeNull();
    expect(zoneToWrite("", undefined)).toBeNull();
  });

  it("writes a Lax, path-wide, long-lived cookie, Secure only on https", () => {
    const plain = timeZoneCookieString("Asia/Seoul", false);
    expect(plain).toMatch(
      /^kb_tz=Asia%2FSeoul; Path=\/; Max-Age=\d+; SameSite=Lax$/,
    );
    expect(timeZoneCookieString("Asia/Seoul", true)).toMatch(/; Secure$/);
  });
});
