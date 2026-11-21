import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Saved } from "@/sikstack/review";
import type { EndKind } from "@/lib/review/model";
import type { ReviewQueue } from "@/lib/review/types";

// The end's saved line after a reopen (job 07-listen-review, round 01: frame.md F241; P64-3y.S9's second attempt).
// Going back to `/review` after the day's session ended opens the same end with its saved line: the page keeps the
// day's last line in this browser, keyed by the account and the review day. The claims: what is kept (the line's
// parts and its day, nothing else), when it is stored, shown and dropped, that another account and another day never
// see it, that storage which throws or is absent reads as empty, and that the page reads it only after mount (the
// server render and the first client render agree).

const store = vi.hoisted(() => ({
  readKept: vi.fn((): string | null => null),
  writeKept: vi.fn(),
  dropKept: vi.fn(),
}));
const actions = vi.hoisted(() => ({
  loadReviewQueue: vi.fn(),
  loadReviewContinue: vi.fn(),
  rateReviewCard: vi.fn(),
  saveReviewSettings: vi.fn(),
  setReviewCardStatus: vi.fn(),
}));
vi.mock("@/lib/review/actions", () => actions);
vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: vi.fn(async () => ({
    token: "tok",
    identity: { user: { id: "u-june" } },
  })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/navigation", async (real) => ({
  ...(await real<typeof import("next/navigation")>()),
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  usePathname: () => "/review",
}));

const line = await import("@/sikstack/review/saved-line");
const real = await vi.importActual<typeof import("@/sikstack/review/saved-store")>(
  "@/sikstack/review/saved-store",
);
vi.mock("@/sikstack/review/saved-store", () => store);
const ReviewPage = (await import("@/app/review/page")).default;

const html = (el: ReactElement) => renderToStaticMarkup(el);

const TODAY = "2026-11-16T19:00:00.000Z";
const TOMORROW = "2026-11-17T19:00:00.000Z";
const GOOD: Saved = { word: "Saved", rest: "Good · next review in 3d" };
const SETTINGS: Saved = {
  word: "Settings saved",
  rest: "60 reviews and 40 new highlights a day",
};
const ENDS: EndKind[] = ["done", "limit", "limitNew", "paused", "empty"];

/** A browser's storage, in memory. */
function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what is kept and when (F241)", () => {
  it("stores the line on every end, keyed by the account, holding the day and the line's two parts only", () => {
    for (const kind of ENDS) {
      const step = line.keepStep({
        account: "u-june",
        kind,
        saved: GOOD,
        day: TODAY,
      });
      expect(step).toEqual({
        t: "store",
        key: "sikstack.review.saved.u-june",
        value: JSON.stringify({ day: TODAY, ...GOOD }),
      });
    }
    const step = line.keepStep({
      account: "u-june",
      kind: "done",
      saved: SETTINGS,
      day: TODAY,
    });
    expect(step.t === "store" && JSON.parse(step.value)).toEqual({
      day: TODAY,
      word: "Settings saved",
      rest: "60 reviews and 40 new highlights a day",
    });
  });

  it("drops it once the session has cards again", () => {
    expect(
      line.keepStep({
        account: "u-june",
        kind: "card",
        saved: GOOD,
        day: TODAY,
      }),
    ).toEqual({ t: "drop", key: "sikstack.review.saved.u-june" });
    expect(
      line.keepStep({
        account: "u-june",
        kind: "card",
        saved: null,
        day: TODAY,
      }),
    ).toEqual({ t: "drop", key: "sikstack.review.saved.u-june" });
  });

  it("leaves it while loading or failed, on an end with no line yet, and with no account", () => {
    const none = { t: "none" };
    expect(
      line.keepStep({ account: "u-june", kind: null, saved: GOOD, day: TODAY }),
    ).toEqual(none);
    expect(
      line.keepStep({
        account: "u-june",
        kind: "done",
        saved: null,
        day: TODAY,
      }),
    ).toEqual(none);
    expect(
      line.keepStep({ account: null, kind: "done", saved: GOOD, day: TODAY }),
    ).toEqual(none);
    expect(
      line.keepStep({ account: null, kind: "card", saved: GOOD, day: TODAY }),
    ).toEqual(none);
  });

  it("reads it back only on an end with no saved line yet, for a known account", () => {
    for (const kind of ENDS)
      expect(line.restoreKey({ account: "u-june", kind, saved: null })).toBe(
        "sikstack.review.saved.u-june",
      );
    expect(
      line.restoreKey({ account: "u-june", kind: "card", saved: null }),
    ).toBeNull();
    expect(
      line.restoreKey({ account: "u-june", kind: null, saved: null }),
    ).toBeNull();
    expect(
      line.restoreKey({ account: "u-june", kind: "done", saved: GOOD }),
    ).toBeNull();
    expect(
      line.restoreKey({ account: null, kind: "done", saved: null }),
    ).toBeNull();
  });
});

describe("the line read back (F241: for the rest of that day)", () => {
  it("shows today's line as it was kept", () => {
    expect(line.restored(line.keptValue(TODAY, GOOD), TODAY)).toEqual({
      line: GOOD,
      drop: false,
    });
    expect(line.restored(line.keptValue(TODAY, SETTINGS), TODAY)).toEqual({
      line: SETTINGS,
      drop: false,
    });
    expect(line.restored(null, TODAY)).toEqual({ line: null, drop: false });
  });

  it("never shows yesterday's line, and drops it", () => {
    expect(line.restored(line.keptValue(TODAY, GOOD), TOMORROW)).toEqual({
      line: null,
      drop: true,
    });
  });

  it("drops anything that is not a kept line of the page's own words", () => {
    for (const raw of [
      "not json",
      "null",
      "42",
      JSON.stringify({ day: TODAY, word: "Paid", rest: "x" }),
      JSON.stringify({ day: TODAY, word: "Saved" }),
      JSON.stringify({ day: TODAY, word: "Saved", rest: "x".repeat(161) }),
    ])
      expect(line.restored(raw, TODAY)).toEqual({ line: null, drop: true });
  });

  it("another account on the same browser never sees it", () => {
    const ls = memory();
    vi.stubGlobal("window", { localStorage: ls });
    real.writeKept(line.keptKey("u-june"), line.keptValue(TODAY, GOOD));
    expect(real.readKept(line.keptKey("u-kai"))).toBeNull();
    expect(
      line.restored(real.readKept(line.keptKey("u-june")), TODAY).line,
    ).toEqual(GOOD);
  });

  it("takes the account from the signed-in identity, and none from an identity without one", () => {
    expect(line.accountOf({ user: { id: "u-june" } })).toBe("u-june");
    expect(line.accountOf(undefined)).toBeNull();
    expect(line.accountOf({})).toBeNull();
    expect(line.accountOf({ user: { id: "" } })).toBeNull();
  });
});

describe("a day on /review, rule by rule (F237, F241)", () => {
  it("the last rating's line, then a save that lifts nothing, then a lifting save, then the next day", () => {
    const ls = memory();
    vi.stubGlobal("window", { localStorage: ls });
    const account = "u-june";
    // What the frame does after each render, and what it shows when /review opens (saved starts empty).
    const after = (kind: EndKind | null, saved: Saved | null, day: string) => {
      const step = line.keepStep({ account, kind, saved, day });
      if (step.t === "store") real.writeKept(step.key, step.value);
      else if (step.t === "drop") real.dropKept(step.key);
    };
    const open = (kind: EndKind, day: string): Saved | null => {
      const key = line.restoreKey({ account, kind, saved: null });
      if (key === null) return null;
      const out = line.restored(real.readKept(key), day);
      if (out.drop) real.dropKept(key);
      return out.line;
    };
    // Mid-session: a rating's line on a card is not kept.
    after("card", GOOD, TODAY);
    expect(open("done", TODAY)).toBeNull();
    // The last rating ends the session: reopening shows its line.
    after("done", GOOD, TODAY);
    expect(open("done", TODAY)).toEqual(GOOD);
    // A save on the end that lifts nothing stays on the end and keeps Settings saved.
    after("limit", SETTINGS, TODAY);
    expect(open("limit", TODAY)).toEqual(SETTINGS);
    // A lifting save brings the cards back: the line is dropped.
    after("card", SETTINGS, TODAY);
    expect(ls.m.size).toBe(0);
    // The next day: a line kept yesterday is never shown, and goes.
    after("done", GOOD, TODAY);
    expect(open("done", TOMORROW)).toBeNull();
    expect(ls.m.size).toBe(0);
  });
});

describe("the storage wrapper: absent or throwing reads as empty", () => {
  it("with no window (the server render)", () => {
    expect(real.readKept("k")).toBeNull();
    expect(() => real.writeKept("k", "v")).not.toThrow();
    expect(() => real.dropKept("k")).not.toThrow();
  });

  it("with storage that refuses to open, read, write or drop", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(real.readKept("k")).toBeNull();
    expect(() => real.writeKept("k", "v")).not.toThrow();
    const boom = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("window", {
      localStorage: { getItem: boom, setItem: boom, removeItem: boom },
    });
    expect(real.readKept("k")).toBeNull();
    expect(() => real.writeKept("k", "v")).not.toThrow();
    expect(() => real.dropKept("k")).not.toThrow();
  });
});

describe("read after mount: the server render never reads storage (no hydration mismatch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.readKept.mockReturnValue(line.keptValue(TODAY, GOOD));
  });

  it("/review opening on an end renders the saved line empty and reads nothing", async () => {
    const q: ReviewQueue = {
      now: "2026-11-17T01:00:00.000Z",
      day: { start: TODAY, end: TOMORROW, time_zone: "Asia/Seoul" },
      profile: {
        time_zone: "Asia/Seoul",
        day_starts_at_hour: 4,
        max_reviews_per_day: 200,
        new_highlights_per_day: 40,
      },
      counts: { due: 0, new_highlights: 0, done_today: 52, by_book: [] },
      limit_reached: null,
      next_due_at: "2026-11-18T00:30:00.000Z",
      cards: [],
    };
    actions.loadReviewQueue.mockResolvedValue({ ok: true, data: q });
    actions.loadReviewContinue.mockResolvedValue(null);
    const out = html(await ReviewPage());
    expect(out).toContain('data-rv-end="done"');
    expect(out).toContain('class="say saved-line is-empty"');
    expect(out).not.toContain("Good · next review in 3d");
    expect(store.readKept).not.toHaveBeenCalled();
  });
});
