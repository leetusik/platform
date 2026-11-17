import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createOrgProject, saveOrgSlug } from "@/app/(app)/dashboard/actions";

// Org home's calls map the API's refusals by status to the panel's cases, never to a generic
// failure: the session guard and Next's cache are mocked, the API is a stubbed fetch.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({ token: "tok", identity: {} })),
}));

beforeAll(() => {
  process.env.KB_API_BASE_URL = "http://kb.test:8766";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(status: number, body: unknown = { detail: "x" }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

describe("saving the public URL name", () => {
  it("maps a 409 to taken", async () => {
    answer(409);
    expect(await saveOrgSlug("fieldnotes")).toEqual({
      ok: false,
      reason: "taken",
    });
  });

  it("maps a 422 (a reserved word) to invalid", async () => {
    answer(422);
    expect(await saveOrgSlug("admin")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("maps any other failure to the failed send", async () => {
    answer(500);
    expect(await saveOrgSlug("krpd")).toEqual({ ok: false, reason: "failed" });
  });
});

describe("creating a project", () => {
  it("maps a refused name to the name error", async () => {
    answer(422);
    expect(await createOrgProject("changple")).toEqual({
      ok: false,
      reason: "invalid-name",
    });
  });

  it("maps any other failure to the failed send", async () => {
    answer(500);
    expect(await createOrgProject("changple")).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
