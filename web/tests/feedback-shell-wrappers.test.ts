import { existsSync } from "node:fs";
import { join } from "node:path";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// P65 — the old Feedback pages stay whole until each is rebuilt, and each route carries its own
// old-page boundary (`LegacyPage`), so the list (S4) and the item (S5) are rebuilt apart: no shared
// `feedback/layout.tsx`; the list's page, loading and not-found each wrap themselves; the item's own
// `[feedbackId]/layout.tsx` wraps the item and its not-found. One boundary per route, never two.
// Transitional: S4 drops the list's half of this file when it rebuilds the list, S5 the item's.

vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: async () => ({
    token: "t",
    identity: { tenant: { name: "Personal" } },
  }),
}));
vi.mock("@/lib/feedback/app", () => ({
  listFeedback: async () => ({ records: [] }),
}));
vi.mock("@/lib/knowledge/app", () => ({ listProjects: async () => [] }));

const ROUTE = join(__dirname, "..", "src", "app", "(app)", "feedback");
const BOUNDARY = /class="kb-app kb-legacy-page"/g;
const boundaries = (node: ReactElement) =>
  renderToStaticMarkup(node).match(BOUNDARY)?.length ?? 0;

describe("the old Feedback list", () => {
  it("has no shared wrapper over the list and the item", () => {
    expect(existsSync(join(ROUTE, "layout.tsx"))).toBe(false);
  });

  it("wraps its page, its loading and its not-found once each", async () => {
    const { default: Page } = await import("@/app/(app)/feedback/page");
    const { default: Loading } = await import("@/app/(app)/feedback/loading");
    const { default: NotFound } =
      await import("@/app/(app)/feedback/not-found");
    const page = await Page({ searchParams: Promise.resolve({}) });
    expect(boundaries(page)).toBe(1);
    expect(boundaries(createElement(Loading))).toBe(1);
    expect(boundaries(createElement(NotFound))).toBe(1);
  });
});

describe("the old piece of feedback", () => {
  it("is wrapped once, by its own layout, its not-found inside it", async () => {
    const { default: Layout } =
      await import("@/app/(app)/feedback/[feedbackId]/layout");
    const { default: NotFound } =
      await import("@/app/(app)/feedback/[feedbackId]/not-found");
    expect(boundaries(createElement(NotFound))).toBe(0);
    const html = renderToStaticMarkup(
      createElement(Layout, null, createElement(NotFound)),
    );
    expect(html.match(BOUNDARY)?.length).toBe(1);
    expect(html).toContain('<div class="kb-app-main">');
  });
});
