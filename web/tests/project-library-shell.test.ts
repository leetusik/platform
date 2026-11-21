import { describe, expect, it } from "vitest";

import { projectSwitchHref, railFor } from "@/sikstack/shell/model";

// P63 — a project's library and the Shell (job 03 round 02, F321): the rail's Library with a project
// picked goes to that project's library and reads current there; the project switcher on a library
// page goes to the chosen project's library. With no project picked the rail is the org's, unchanged.

const item = (path: string, key: string) =>
  railFor(path).items.find((i) => i.key === key);

const current = (path: string) =>
  [...railFor(path).items, railFor(path).review]
    .filter((i) => i.current)
    .map((i) => i.key);

describe("the rail's Library with a project picked", () => {
  it("goes to that project's library", () => {
    expect(item("/projects/p1", "library")?.href).toBe("/projects/p1/library");
    expect(item("/projects/p%201/library", "library")?.href).toBe(
      "/projects/p%201/library",
    );
  });

  it("reads current on the project's library, and Overview there does not", () => {
    expect(current("/projects/p1/library")).toEqual(["library"]);
    expect(current("/projects/p1/library/")).toEqual(["library"]);
    expect(current("/projects/p1")).toEqual(["overview"]);
  });

  it("keeps the project form there, and none current when the project is unknown", () => {
    expect(railFor("/projects/p1/library").form).toBe("project");
    expect(railFor("/projects/nope/library", false).form).toBe("org");
    expect(current("/projects/nope/library").length).toBe(1);
    expect(
      [
        ...railFor("/projects/nope/library", false).items,
        railFor("/projects/nope/library", false).review,
      ].filter((i) => i.current),
    ).toEqual([]);
  });
});

describe("the rail's Library with no project picked", () => {
  it("is the org's library, current on it", () => {
    expect(item("/dashboard", "library")?.href).toBe("/library");
    expect(item("/library", "library")).toEqual({
      key: "library",
      href: "/library",
      current: true,
    });
  });
});

describe("the project switcher", () => {
  it("leads to the chosen project's library on a library page", () => {
    expect(projectSwitchHref("/library", "p2")).toBe("/projects/p2/library");
    expect(projectSwitchHref("/library?view=all", "p2")).toBe(
      "/projects/p2/library",
    );
    expect(projectSwitchHref("/projects/p1/library", "p 2")).toBe(
      "/projects/p%202/library",
    );
  });

  it("leads to the chosen project's home anywhere else", () => {
    for (const path of [
      "/dashboard",
      "/projects/p1",
      "/feedback",
      "/review",
      "/libraryx",
    ])
      expect(projectSwitchHref(path, "p2")).toBe("/projects/p2");
  });
});
