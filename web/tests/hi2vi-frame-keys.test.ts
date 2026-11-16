import { describe, expect, it, vi } from "vitest";

import {
  initialKeysState,
  keysReducer,
  sendMint,
  type KeysAction,
  type KeysState,
  type MintResult,
} from "@/hi2vi/frame/keys-state";

const SECRET = "vk_FAKE00example00key00not00real00";

function run(actions: KeysAction[], from: KeysState = initialKeysState) {
  const states: KeysState[] = [];
  let s = from;
  for (const a of actions) {
    s = keysReducer(s, a);
    states.push(s);
  }
  return states;
}

const shown: KeysAction[] = [
  { type: "toggle-form" },
  { type: "set-draft", draft: "CI ingest" },
  { type: "mint-start" },
  { type: "mint-ok", key: SECRET },
];

describe("Keys' show-once rule", () => {
  it("holds the minted key only while it is shown, and clears it on close", () => {
    const states = run([...shown, { type: "close-key" }]);
    const open = states[3];
    expect(open.phase).toBe("shown");
    expect(open.key).toBe(SECRET);
    const closed = states[4];
    expect(closed.phase).toBe("list");
    expect(closed.key).toBeNull();
  });

  it("no later state carries the key, whatever follows the close", () => {
    const after: KeysAction[] = [
      { type: "close-key" },
      { type: "toggle-form" },
      { type: "mint-start" },
      { type: "mint-failed" },
      { type: "cancel-form" },
      { type: "ask-revoke", id: "k2" },
      { type: "revoke-start" },
      { type: "revoke-ok", id: "k2" },
      { type: "close-key" },
    ];
    const states = run([...shown, ...after]).slice(4);
    for (const s of states) {
      expect(s.key).toBeNull();
      expect(JSON.stringify(s)).not.toContain(SECRET);
    }
  });
});

describe("Keys' form", () => {
  it("refuses an over-long name with the board's error and never calls mint", async () => {
    const mint = vi.fn(async (): Promise<MintResult> => ({
      ok: true,
      key: SECRET,
    }));
    const action = await sendMint("x".repeat(201), "full", mint);
    expect(action).toEqual({ type: "name-invalid" });
    expect(mint).not.toHaveBeenCalled();
    const s = run([{ type: "toggle-form" }, action]).at(-1)!;
    expect(s.phase).toBe("mint");
    expect(s.nameError).toBe(true);
  });

  it("sends an empty name as no name, since the name is optional", async () => {
    const mint = vi.fn(async (): Promise<MintResult> => ({
      ok: true,
      key: SECRET,
    }));
    const action = await sendMint("   ", "capture", mint);
    expect(mint).toHaveBeenCalledWith({ name: null, access: "capture" });
    expect(action).toEqual({ type: "mint-ok", key: SECRET });
  });

  it("keeps the failure notice while the form is sent again, until the answer", () => {
    const states = run([
      { type: "toggle-form" },
      { type: "mint-start" },
      { type: "mint-failed" },
      { type: "mint-start" },
    ]);
    expect(states[2].failed).toBe(true);
    expect(states[3].phase).toBe("minting");
    expect(states[3].failed).toBe(true);
  });

  it("clears the name error when the name is edited", () => {
    const s = run([
      { type: "toggle-form" },
      { type: "name-invalid" },
      { type: "set-draft", draft: "a" },
    ]).at(-1)!;
    expect(s.nameError).toBe(false);
  });
});
