import { describe, expect, it, vi } from "vitest";

import { documentBack } from "@/sikstack/reader/document/model";
import { decodeFrom } from "@/lib/library/from";

// P63-fk.S26 — a visitor's way back names the org by the name its read carries, on its own
// public library only, and by the address's slug when the read carries none. P63-fk.F4: another
// org's list is not trusted; the way back is the item's own default (way-back-label.test.ts).

vi.mock("@/lib/auth-guards", () => ({
  optionalIdentity: vi.fn(async () => null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));

const { bookBack } = await import("@/lib/book/load");

const read = {
  member: false,
  owner: "p63-fid",
  slug: "p63-fid",
  orgName: "Personal",
  project: "platform",
};

describe("the book's way back", () => {
  it("reads the org's name on its own public library", () => {
    expect(bookBack(decodeFrom("/@p63-fid?page=2"), read)).toEqual({
      href: "/@p63-fid?page=2",
      label: "Personal",
    });
  });
  it("reads the slug when the read has no name; another org's list is the book's own", () => {
    expect(
      bookBack(decodeFrom("/@p63-fid"), { ...read, orgName: null }).label,
    ).toBe("p63-fid");
    expect(bookBack(decodeFrom("/@someone"), read)).toEqual({
      href: "/@p63-fid",
      label: "Personal",
    });
  });
  it("keeps the other lists' names", () => {
    expect(bookBack(decodeFrom("/@p63-fid/platform"), read).label).toBe(
      "platform",
    );
    expect(bookBack(decodeFrom(""), { ...read, member: true }).label).toBe(
      "Library",
    );
  });
});

describe("the document's way back", () => {
  const names = { project: "platform", org: "Personal" };
  it("reads the org's name on its own public library, with or without ?from=", () => {
    expect(
      documentBack({ member: false, from: null, org: "p63-fid", names }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
    expect(
      documentBack({
        member: false,
        from: "/@p63-fid?q=a",
        org: "p63-fid",
        names,
      }),
    ).toMatchObject({ href: "/@p63-fid?q=a", label: "Personal" });
  });
  it("reads the slug when the read has no name; another org's list is the document's own", () => {
    expect(
      documentBack({ member: false, from: null, org: "p63-fid" })?.label,
    ).toBe("p63-fid");
    expect(
      documentBack({ member: false, from: "/@someone", org: "p63-fid", names }),
    ).toMatchObject({ href: "/@p63-fid", label: "Personal" });
  });
});
