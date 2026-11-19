import { describe, expect, it } from "vitest";

const nextConfig = (await import("../next.config")).default;

// Next 16.3 turns optimistic routing on by default. With it on, a prefetch predicted from a public
// `/@org/...` link carries the raw `@org` segment while the server renders it as `%40org`; the client
// reads that as a dynamic rewrite, invalidates its whole route cache and prefetches every visible
// link again, without end. The browser is what shows the loop; this holds the setting that ends it.
describe("link prefetching", () => {
  it("keeps optimistic routing off, so public /@org links are prefetched once, not in a loop", () => {
    expect(nextConfig.experimental?.optimisticRouting).toBe(false);
  });
});
