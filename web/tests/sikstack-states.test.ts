import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootError from "@/app/error";
import { SIKSTACK_STATES } from "@/content/sikstack-states";
import { errorState, notFoundState } from "@/sikstack/states/model";
import { boundaryRetry } from "@/sikstack/states/retry";

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

describe("the root error (a layout's throw: no Shell, no org)", () => {
  it("keeps the signed title, sentence and Try again, and goes to the landing in place of the org", () => {
    const state = errorState({ orgName: null, digest: "x" });
    expect(state.title).toBe("This page did not load");
    expect(state.text).toBe(
      "Something failed on our side. Try again. If it keeps failing, send us the reference.",
    );
    expect(state.actions).toEqual([
      { kind: "retry", label: "Try again", variant: "primary" },
      { kind: "link", label: "Go to sikstack", href: "/", variant: "default" },
    ]);
    expect(state.reference).toBe("Reference x");
  });

  it("renders the signed block in its own .ui root, not the old 500 page", () => {
    const html = renderToString(
      createElement(RootError, {
        error: Object.assign(new Error("x"), { digest: "123" }),
        reset: () => {},
      }),
    );
    expect(html).toContain('class="ui"');
    expect(html).toContain('class="block block-page"');
    expect(html).toContain("This page did not load");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/"');
    expect(html).toContain("Go to sikstack");
    expect(html).toContain("Reference 123");
    expect(html).not.toContain("kb-editorial");
    expect(html).not.toContain("Back to");
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

  it("with nobody signed in keeps the title and one link to the landing (OQ7), no sentence", () => {
    const state = notFoundState({ orgName: null });
    expect(state.title).toBe("Page not found");
    expect(state.text).toBeNull();
    expect(state.actions).toEqual([
      { kind: "link", label: "Go to sikstack", href: "/", variant: "default" },
    ]);
    expect(state.reference).toBeNull();
  });
});

describe("boundaryRetry (Try again in every system route's error boundary)", () => {
  const retry = () => {};
  const unstableRetry = () => {};
  const reset = () => {};

  it("prefers the re-fetching retry (Next 16.3), then unstable_retry (16.2), then reset", () => {
    expect(boundaryRetry({ retry, unstable_retry: unstableRetry, reset })).toBe(
      retry,
    );
    expect(boundaryRetry({ retry, reset })).toBe(retry);
    expect(boundaryRetry({ unstable_retry: unstableRetry, reset })).toBe(
      unstableRetry,
    );
    expect(boundaryRetry({ reset })).toBe(reset);
  });
});
