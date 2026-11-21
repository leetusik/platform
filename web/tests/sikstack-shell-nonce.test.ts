import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { describe, expect, it, vi } from "vitest";

import { requestNonce } from "@/sikstack/shell/data";
import { proxy } from "@/proxy";

// P58 — the Shell's scheme script takes the nonce Next stamps on its own scripts: the one the proxy
// put in the REQUEST's CSP header on a reader path. A wrong source (the response, another header)
// would leave the inline script blocked under `'strict-dynamic'`. `next/headers` needs a request
// scope, so it is handed exactly the request headers the proxy forwards to the page.

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

/** The request headers Next gives the page after `proxy` (its `x-middleware-request-*` overrides). */
function forwardedBy(response: Response): Headers {
  const out = new Headers();
  const names = response.headers.get("x-middleware-override-headers") ?? "";
  for (const name of names.split(",").filter(Boolean)) {
    const value = response.headers.get(`x-middleware-request-${name}`);
    if (value !== null) out.set(name, value);
  }
  return out;
}

async function nonceAfterProxy(path: string) {
  const response = proxy(new NextRequest(`http://localhost${path}`));
  vi.mocked(headers).mockResolvedValue(
    forwardedBy(response) as unknown as Awaited<ReturnType<typeof headers>>,
  );
  const policy = response.headers.get("content-security-policy");
  return {
    read: await requestNonce(),
    sent: policy ? /'nonce-([^']+)'/.exec(policy)?.[1] : undefined,
  };
}

describe("the Shell's nonce", () => {
  it("is the one the proxy put in a reader path's request CSP", async () => {
    const { read, sent } = await nonceAfterProxy("/documents/1/versions/1");
    expect(sent).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(read).toBe(sent);
    // a second request gets a fresh nonce, and the Shell follows it
    const next = await nonceAfterProxy("/@acme/handbook/getting-started");
    expect(next.read).toBe(next.sent);
    expect(next.read).not.toBe(read);
  });

  it("is absent off the reader paths, where the proxy sets no CSP", async () => {
    const { read, sent } = await nonceAfterProxy("/library");
    expect(sent).toBeUndefined();
    expect(read).toBeUndefined();
  });
});
