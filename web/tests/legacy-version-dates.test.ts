import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReaderVersions } from "@/lib/reader/types";

// The legacy reader's Version history (an html chapter of a book) dates each version on the
// viewer's day (D5), in the legacy reader's own `d Mon yyyy` form; UTC until the zone is known.
// A `YYYY-MM-DD` day (a filled v1, a read without the stamp) stays that day in every zone.

const seen = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
vi.mock("@/components/reader/legacy-reader", () => ({
  LegacyReader: (props: Record<string, unknown>) => {
    seen.props = props;
    return null;
  },
}));

const { versionDay, publishedDate } = await import("@/lib/reader/date");
const { VersionList } = await import("@/components/reader/version-list");
const { LegacyReaderPage } =
  await import("@/components/reader/legacy-reader-page");

const LATE = "2026-11-17T23:30:12Z"; // Nov 18 in Seoul, Nov 17 in UTC
const EARLY = "2026-11-18T02:00:00Z"; // Nov 17 in Los Angeles

const versions = (dates: string[]): ReaderVersions =>
  ({
    ok: true,
    label: "English",
    rows: dates.map((date, i) => ({ n: dates.length - i, date, from: null })),
  }) as unknown as ReaderVersions;

const rows = (dates: string[], timeZone?: string) =>
  renderToStaticMarkup(
    createElement(VersionList, {
      versions: versions(dates),
      version: dates.length,
      newest: dates.length,
      noun: "chapter",
      onOpen: () => {},
      timeZone,
    } as Parameters<typeof VersionList>[0]),
  );

describe("legacy Version history: the viewer's day", () => {
  it("a stamp late in the UTC day reads the next day in Seoul, its UTC day with no zone", () => {
    expect(rows([LATE], "Asia/Seoul")).toContain("Published 18 Nov 2026");
    expect(rows([LATE])).toContain("Published 17 Nov 2026");
    expect(rows([LATE], "UTC")).toContain("Published 17 Nov 2026");
  });

  it("a stamp early in the UTC day reads the day before in Los Angeles", () => {
    expect(rows([EARLY], "America/Los_Angeles")).toContain(
      "Published 17 Nov 2026",
    );
    expect(rows([EARLY])).toContain("Published 18 Nov 2026");
  });

  it("a YYYY-MM-DD day (a filled v1, a read without the stamp) is never shifted", () => {
    for (const zone of [
      undefined,
      "UTC",
      "Asia/Seoul",
      "America/Los_Angeles",
    ]) {
      expect(versionDay("2026-11-01", zone)).toBe("1 Nov 2026");
    }
    expect(rows(["2026-11-01"], "America/Los_Angeles")).toContain(
      "Published 1 Nov 2026",
    );
  });

  it("a bad zone is UTC; an unreadable value is the old reading", () => {
    expect(versionDay(LATE, "Not/AZone")).toBe("17 Nov 2026");
    expect(versionDay("soon", "Asia/Seoul")).toBe("soon");
  });

  it("the head and the print sheet keep the document's calendar date", () => {
    expect(publishedDate("2026-11-01")).toBe("1 Nov 2026");
    expect(publishedDate(LATE)).toBe("17 Nov 2026");
  });

  it("the page passes the viewer's zone through to the legacy reader", () => {
    const legacy = {
      docId: 9,
      view: { version: 2 },
      frame: {},
    } as unknown as Parameters<typeof LegacyReaderPage>[0]["legacy"];
    renderToStaticMarkup(
      createElement(LegacyReaderPage, {
        legacy,
        timeZone: "Asia/Seoul",
      } as Parameters<typeof LegacyReaderPage>[0]),
    );
    expect(seen.props?.timeZone).toBe("Asia/Seoul");
  });
});
