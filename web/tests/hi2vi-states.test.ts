import { describe, expect, it } from "vitest";

import { HI2VI_STATES } from "@/content/hi2vi-states";
import { errorState, notFoundState } from "@/hi2vi/states/model";

// The shared states (job 01 round 03-instrument, `## Build` § Shared states; `States.dc.html`).

describe("errorState", () => {
  it("shows the reference line only when there is a digest, and shows that digest", () => {
    expect(errorState({ orgName: "Personal" }).reference).toBeNull();
    expect(
      errorState({ orgName: "Personal", digest: "" }).reference,
    ).toBeNull();
    expect(
      errorState({ orgName: "Personal", digest: "7f3a-2c91" }).reference,
    ).toBe("Reference 7f3a-2c91");
  });

  it("offers exactly the two signed actions: Try again, then Back to the org", () => {
    const state = errorState({ orgName: "Personal", digest: "x" });
    expect(state.title).toBe("This page did not load");
    expect(state.text).toBe(
      "Something failed on our side. Try again. If it keeps failing, send us the reference.",
    );
    expect(state.actions).toEqual([
      { kind: "retry", label: "Try again", variant: "primary" },
      {
        kind: "link",
        label: "Back to Personal",
        href: "/dashboard",
        variant: "default",
      },
    ]);
  });
});

describe("notFoundState", () => {
  it("offers its one action, Back to the org, and names the org", () => {
    const state = notFoundState({ orgName: "Personal" });
    expect(state.title).toBe("Page not found");
    expect(state.text).toBe(
      "This page doesn’t exist, or it isn’t part of Personal.",
    );
    expect(state.reference).toBeNull();
    expect(state.actions).toEqual([
      {
        kind: "link",
        label: "Back to Personal",
        href: "/dashboard",
        variant: "default",
      },
    ]);
  });

  it("with nobody signed in keeps only the signed title (no org to name or go back to)", () => {
    const state = notFoundState({ orgName: null });
    expect(state.title).toBe(HI2VI_STATES.notFound.title);
    expect(state.text).toBeNull();
    expect(state.actions).toEqual([]);
  });
});
