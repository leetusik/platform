import { describe, expect, it } from "vitest";

import {
  decodeFrom,
  encodeFrom,
  FROM_PARAM,
  LIBRARY_ORIGIN,
  type ListOrigin,
  wayBack,
  withFrom,
} from "@/lib/library/from";

// A list's place and the way back (F324, F328): a `?from=` value is a return address, so a hostile
// one must land on the Library, and a real one must come back exactly as it left.

/** As a page reads it: the value set on an item's address, then read back from its query. */
function throughAddress(from: ListOrigin): ListOrigin {
  const href = withFrom("/@acme/handbook/onboarding?v=2#s-intro", from);
  const url = new URL(href, "https://x.invalid");
  expect(url.hash).toBe("#s-intro");
  expect(url.searchParams.get("v")).toBe("2");
  return decodeFrom(url.searchParams.get(FROM_PARAM));
}

describe("a list's place round-trips", () => {
  it.each<[string, ListOrigin]>([
    ["library, By project", { origin: "library", place: {} }],
    [
      "library, All documents",
      {
        origin: "library",
        place: { view: "all", page: 3, q: "a&b=c #x", filter: "platform" },
      },
    ],
    [
      "a project's library, member",
      {
        origin: "project-library",
        viewer: "member",
        project: "17",
        place: { page: 2, q: "로드맵" },
      },
    ],
    [
      "a project's library, visitor",
      {
        origin: "project-library",
        viewer: "visitor",
        org: "acme",
        project: "bootstrap_agentic_workspace",
        place: { page: 4, q: "review" },
      },
    ],
    [
      "the public library",
      {
        origin: "public-library",
        org: "acme",
        place: { view: "all", page: 2, q: "x", filter: "p" },
      },
    ],
  ])("%s", (_name, from) => {
    expect(decodeFrom(encodeFrom(from))).toEqual(from);
    expect(throughAddress(from)).toEqual(from);
  });
});

describe("a hostile way back falls back to the Library", () => {
  it.each([
    ["//evil.example.com"],
    ["https://evil.example.com"],
    ["https://evil.example.com/library"],
    ["/\\evil.example.com"],
    ["/%2F%2Fevil.example.com/library"],
    ["javascript:alert(1)"],
    ["library"],
    ["not a path"],
    [""],
    ["/dashboard"],
    ["/documents/41"],
    ["/@acme/handbook/books/phases"],
    ["/projects/17"],
    ["/login?next=/library"],
    ["/acme"],
  ])("%j", (raw) => {
    expect(decodeFrom(raw)).toEqual(LIBRARY_ORIGIN);
    expect(wayBack(decodeFrom(raw))).toEqual({
      href: "/library",
      label: "Library",
    });
  });

  it("a repeated or missing value", () => {
    expect(decodeFrom(["/library", "//evil.example.com"])).toEqual(
      LIBRARY_ORIGIN,
    );
    expect(decodeFrom(undefined)).toEqual(LIBRARY_ORIGIN);
  });
});

describe("the way back names where it goes", () => {
  it("Library, the project's name, the org's name", () => {
    expect(wayBack(decodeFrom("/library?view=all&page=2"))).toEqual({
      href: "/library?view=all&page=2",
      label: "Library",
    });
    expect(
      wayBack(decodeFrom("/projects/17/library?page=2"), {
        project: "platform",
      }),
    ).toEqual({
      href: "/projects/17/library?page=2",
      label: "platform",
    });
    expect(
      wayBack(decodeFrom("/@acme/platform"), { project: "Platform" }),
    ).toEqual({
      href: "/@acme/platform",
      label: "Platform",
    });
    expect(wayBack(decodeFrom("/@acme"), { org: "Acme" })).toEqual({
      href: "/@acme",
      label: "Acme",
    });
  });

  it("carries through the reader to the book (F328)", () => {
    const from: ListOrigin = {
      origin: "library",
      place: { view: "all", page: 2 },
    };
    const chapter = withFrom("/@acme/handbook/books/phases/p8?lang=ko", from);
    const fromChapter = new URL(chapter, "https://x.invalid").searchParams.get(
      FROM_PARAM,
    );
    const book = withFrom(
      "/@acme/handbook/books/phases",
      decodeFrom(fromChapter),
    );
    expect(
      decodeFrom(
        new URL(book, "https://x.invalid").searchParams.get(FROM_PARAM),
      ),
    ).toEqual(from);
    expect(withFrom("/x#h", null)).toBe("/x#h");
  });
});
