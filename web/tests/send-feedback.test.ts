import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Core from "@/lib/send-feedback/core";
import type { FeedbackSettings } from "@/lib/send-feedback/config";

// hi2vi's own feedback control: the guards of the send, on `core.ts` with injected
// headers, key, post and identity, and the env reading of `config.ts`. Each test gets
// a fresh module graph, so the in-memory limiter starts empty.

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

const KEY = "vk_test_capture_key";
const SETTINGS: FeedbackSettings = {
  maxChars: 20,
  ipLimit: 2,
  ipWindowS: 600,
  accountLimit: 2,
  accountWindowS: 600,
  dailyCeiling: 3,
};

let core: typeof Core;
let ApiError: typeof import("@/lib/knowledge/client").ApiError;

beforeEach(async () => {
  vi.resetModules();
  core = await import("@/lib/send-feedback/core");
  ({ ApiError } = await import("@/lib/knowledge/client"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function hdrs(values: Record<string, string> = {}): Core.HeaderReader {
  const h = new Headers({ "sec-fetch-site": "same-origin", ...values });
  return { get: (name) => h.get(name) };
}

function visitorDeps(over: Partial<Core.SendDeps> = {}) {
  const post = vi.fn(async (_body: Core.CaptureBody, _key: string) => ({
    status: "accepted",
  }));
  const log = vi.fn();
  return {
    post,
    log,
    deps: {
      headers: hdrs({ "x-real-ip": "198.51.100.7" }),
      settings: SETTINGS,
      captureKey: KEY,
      post,
      log,
      ...over,
    } satisfies Core.SendDeps,
  };
}

function accountDeps(over: Partial<Core.AccountSendDeps> = {}) {
  const post = vi.fn(async (_body: Core.CaptureBody, _key: string) => ({
    status: "accepted",
  }));
  return {
    post,
    deps: {
      headers: hdrs(),
      settings: SETTINGS,
      captureKey: KEY,
      post,
      log: vi.fn(),
      identify: async () => ({ userId: "user-1", email: "june@example.com" }),
      ...over,
    } satisfies Core.AccountSendDeps,
  };
}

describe("the visitor's guards", () => {
  it("refuses a cross-origin request before anything is counted or posted", async () => {
    const limit = vi.fn(() => ({ ok: true }));
    const refused: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site", "x-real-ip": "198.51.100.7" },
      {
        "sec-fetch-site": "",
        origin: "https://evil.example",
        host: "hi2vi.com",
      },
      { "sec-fetch-site": "" },
    ];
    for (const h of refused) {
      const { deps, post } = visitorDeps({ headers: hdrs(h), limit });
      expect(
        await core.sendVisitorFeedback({ message: "hello" }, deps),
      ).toEqual({
        status: "failed",
      });
      expect(post).not.toHaveBeenCalled();
    }
    expect(limit).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot as sent, posting and counting nothing", async () => {
    const limit = vi.fn(() => ({ ok: true }));
    const { deps, post } = visitorDeps({ limit });
    expect(
      await core.sendVisitorFeedback(
        { message: "buy now", website: "spam.example" },
        deps,
      ),
    ).toEqual({ status: "sent" });
    expect(post).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
  });

  it("never posts an empty, overlong or badly addressed message", async () => {
    const { deps, post } = visitorDeps();
    const cases: [Core.VisitorInput, unknown][] = [
      [
        { message: "" },
        { status: "invalid", field: "message", reason: "empty" },
      ],
      [
        { message: "   \n " },
        { status: "invalid", field: "message", reason: "empty" },
      ],
      [
        { message: 42 },
        { status: "invalid", field: "message", reason: "empty" },
      ],
      [
        { message: "x".repeat(21) },
        { status: "invalid", field: "message", reason: "too-long" },
      ],
      [
        { message: "hi", email: "a@x.invalid, b@y.invalid" },
        { status: "invalid", field: "email", reason: "not-one" },
      ],
      [
        { message: "hi", email: "Name <a@x.invalid>" },
        { status: "invalid", field: "email", reason: "not-one" },
      ],
      [
        { message: "hi", email: "noor@example" },
        { status: "invalid", field: "email", reason: "not-one" },
      ],
    ];
    for (const [input, answer] of cases) {
      expect(await core.sendVisitorFeedback(input, deps)).toEqual(answer);
    }
    expect(post).not.toHaveBeenCalled();
  });

  it("counts length in code points of the trimmed message", async () => {
    const { deps, post } = visitorDeps();
    // 20 emoji are 40 UTF-16 units but 20 characters: at the cap, not past it.
    const message = `  ${"😀".repeat(20)}  `;
    expect(await core.sendVisitorFeedback({ message }, deps)).toEqual({
      status: "sent",
    });
    expect(post.mock.calls[0][0].message).toBe("😀".repeat(20));
  });

  it("refuses past the per-address limit and never posts the refused one", async () => {
    const { deps, post } = visitorDeps();
    expect(await core.sendVisitorFeedback({ message: "one" }, deps)).toEqual({
      status: "sent",
    });
    expect(await core.sendVisitorFeedback({ message: "two" }, deps)).toEqual({
      status: "sent",
    });
    expect(await core.sendVisitorFeedback({ message: "three" }, deps)).toEqual({
      status: "refused",
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("keys the limit on X-Real-IP alone, whatever X-Forwarded-For says", async () => {
    const { deps, post } = visitorDeps();
    const send = (xff: string, realIp = "198.51.100.7") =>
      core.sendVisitorFeedback(
        { message: "hi" },
        {
          ...deps,
          headers: hdrs({ "x-real-ip": realIp, "x-forwarded-for": xff }),
        },
      );
    expect(await send("203.0.113.1")).toEqual({ status: "sent" });
    expect(await send("203.0.113.2")).toEqual({ status: "sent" });
    expect(await send("203.0.113.3")).toEqual({ status: "refused" });
    expect(await send("203.0.113.3", "198.51.100.8")).toEqual({
      status: "sent",
    });
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("refuses for today past the site-wide ceiling, without posting", async () => {
    const { deps, post } = visitorDeps();
    const from = (ip: string) =>
      core.sendVisitorFeedback(
        { message: "hi" },
        { ...deps, headers: hdrs({ "x-real-ip": ip }) },
      );
    for (const ip of ["192.0.2.1", "192.0.2.2", "192.0.2.3"]) {
      expect(await from(ip)).toEqual({ status: "sent" });
    }
    expect(await from("192.0.2.4")).toEqual({ status: "refused-site" });
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("posts no IP address, and the reply email only when given", async () => {
    const { deps, post } = visitorDeps({
      headers: hdrs({
        "x-real-ip": "198.51.100.7",
        "x-forwarded-for": "203.0.113.9",
      }),
    });
    await core.sendVisitorFeedback(
      { message: " hello ", email: " reader@example.com " },
      deps,
    );
    await core.sendVisitorFeedback({ message: "again" }, deps);
    const [withEmail, without] = post.mock.calls.map((call) => call[0]);
    expect(withEmail).toEqual({
      message: "hello",
      source: { product: "hi2vi", integration: "landing" },
      channel: "web",
      source_metadata: { reply_email: "reader@example.com" },
    });
    expect(without).not.toHaveProperty("source_metadata");
    const posted = JSON.stringify(post.mock.calls);
    expect(posted).not.toContain("198.51.100.7");
    expect(posted).not.toContain("203.0.113.9");
  });
});

describe("the signed-in guards", () => {
  it("refuses past the per-account limit", async () => {
    const { deps, post } = accountDeps();
    expect(await core.sendAccountFeedback({ message: "one" }, deps)).toEqual({
      status: "sent",
    });
    expect(await core.sendAccountFeedback({ message: "two" }, deps)).toEqual({
      status: "sent",
    });
    expect(await core.sendAccountFeedback({ message: "three" }, deps)).toEqual({
      status: "refused",
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("takes the email and the integration from the session, never the client", async () => {
    const { deps, post } = accountDeps();
    const tampered = {
      message: "hello",
      email: "attacker@evil.example",
      source: { integration: "landing" },
      integration: "landing",
    };
    expect(await core.sendAccountFeedback(tampered, deps)).toEqual({
      status: "sent",
    });
    expect(post.mock.calls[0][0]).toEqual({
      message: "hello",
      source: { product: "hi2vi", integration: "org-home" },
      channel: "web",
      user_id: "user-1",
      source_metadata: { reply_email: "june@example.com" },
    });
  });

  it("refuses a cross-origin request before the identity is asked", async () => {
    const identify = vi.fn(async () => ({ userId: "u", email: null }));
    const { deps, post } = accountDeps({
      headers: hdrs({ "sec-fetch-site": "cross-site" }),
      identify,
    });
    expect(await core.sendAccountFeedback({ message: "hi" }, deps)).toEqual({
      status: "failed",
    });
    expect(identify).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("the post", () => {
  it("maps the API's 429 to refused and anything else to failed, logging the status only", async () => {
    const answers: [unknown, string][] = [
      [new ApiError(429, "too many requests"), "refused"],
      [new ApiError(500, "storage write failed"), "failed"],
      [new TypeError("fetch failed"), "failed"],
    ];
    for (const [error, status] of answers) {
      const log = vi.fn();
      const post = vi.fn(async () => {
        throw error;
      });
      const { deps } = visitorDeps({
        post,
        log,
        headers: hdrs({ "x-real-ip": `10.0.0.${status.length}` }),
      });
      expect(
        await core.sendVisitorFeedback(
          { message: "secret words", email: "reader@example.com" },
          deps,
        ),
      ).toEqual({ status });
      const logged = JSON.stringify(log.mock.calls);
      for (const leak of ["secret words", "reader@example.com", KEY]) {
        expect(logged).not.toContain(leak);
      }
    }
  });

  it("posts nothing without a capture key", async () => {
    const { deps, post } = visitorDeps({ captureKey: null });
    expect(await core.sendVisitorFeedback({ message: "hi" }, deps)).toEqual({
      status: "failed",
    });
    const signedIn = accountDeps({ captureKey: null });
    expect(
      await core.sendAccountFeedback({ message: "hi" }, signedIn.deps),
    ).toEqual({
      status: "failed",
    });
    expect(post).not.toHaveBeenCalled();
    expect(signedIn.post).not.toHaveBeenCalled();
  });

  it("sends the key as the bearer, with no org and no address headers", async () => {
    vi.stubEnv("KB_API_BASE_URL", "http://kb.test:8766");
    const fetchMock = vi.fn(
      async (..._args: [string, RequestInit]) =>
        new Response("{}", { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await core.postCapture(
      {
        message: "hi",
        source: { product: "hi2vi", integration: "landing" },
        channel: "web",
      },
      KEY,
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://kb.test:8766/api/feedback");
    const sent = init.headers as Record<string, string>;
    expect(sent.Authorization).toBe(`Bearer ${KEY}`);
    expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toEqual(
      expect.arrayContaining(["x-hi2vi-org"]),
    );
    expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toEqual(
      expect.arrayContaining(["x-real-ip"]),
    );
  });
});

describe("the config", () => {
  it("is not configured without a key, and never hands the key to a page", async () => {
    const { feedbackControl } = await import("@/lib/send-feedback/config");
    vi.stubEnv("HI2VI_FEEDBACK_CAPTURE_KEY", "");
    expect(feedbackControl()).toEqual({ configured: false, limit: 2000 });
    vi.stubEnv("HI2VI_FEEDBACK_CAPTURE_KEY", "   ");
    expect(feedbackControl().configured).toBe(false);
    vi.stubEnv("HI2VI_FEEDBACK_CAPTURE_KEY", KEY);
    const control = feedbackControl();
    expect(control).toEqual({ configured: true, limit: 2000 });
    expect(JSON.stringify(control)).not.toContain(KEY);
  });

  it("falls back to each default when a number is unset or not a positive integer", async () => {
    const { feedbackSettings, FEEDBACK_DEFAULTS } =
      await import("@/lib/send-feedback/config");
    const names = [
      "HI2VI_FEEDBACK_MAX_CHARS",
      "HI2VI_FEEDBACK_IP_LIMIT",
      "HI2VI_FEEDBACK_IP_WINDOW_S",
      "HI2VI_FEEDBACK_ACCOUNT_LIMIT",
      "HI2VI_FEEDBACK_ACCOUNT_WINDOW_S",
      "HI2VI_FEEDBACK_DAILY_CEILING",
    ];
    for (const bad of [
      undefined,
      "",
      "abc",
      "0",
      "-3",
      "1.5",
      "1e3",
      "12abc",
    ]) {
      for (const name of names) vi.stubEnv(name, bad);
      expect(feedbackSettings()).toEqual(FEEDBACK_DEFAULTS);
    }
    for (const name of names) vi.stubEnv(name, " 7 ");
    expect(Object.values(feedbackSettings())).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it("reads the key only in server-only modules", () => {
    const dir = join(__dirname, "../src/lib/send-feedback");
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      if (/HI2VI_FEEDBACK_CAPTURE_KEY|readCaptureKey|captureKey/.test(text)) {
        expect(
          text.startsWith('import "server-only"') ||
            text.startsWith('"use server"'),
        ).toBe(true);
      }
    }
  });
});
