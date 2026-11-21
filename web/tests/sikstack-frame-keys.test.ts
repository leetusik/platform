import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { KEYS } from "@/content/sikstack-frame";
import { keyRowOf } from "@/app/(app)/projects/[projectId]/model";
import { Keys } from "@/sikstack/frame/keys";
import {
  accessOptions,
  accessWord,
  initialKeysState,
  keysReducer,
  sendMint,
  type KeysAction,
  type KeysState,
  type MintResult,
} from "@/sikstack/frame/keys-state";

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

describe("Keys' revoke failure", () => {
  const failed: KeysAction[] = [
    { type: "ask-revoke", id: "k2" },
    { type: "revoke-start" },
    { type: "revoke-failed" },
  ];

  it("leaves the confirm open for the same key, not busy, with the notice", () => {
    const s = run(failed).at(-1)!;
    expect(s.phase).toBe("confirm");
    expect(s.target).toBe("k2");
    expect(s.revokeFailed).toBe(true);
  });

  it("clears the notice and closes the confirm when a retry succeeds", () => {
    const states = run([
      ...failed,
      { type: "revoke-start" },
      { type: "revoke-ok", id: "k2" },
    ]);
    expect(states[3].revokeFailed).toBe(true);
    const done = states[4];
    expect(done.phase).toBe("list");
    expect(done.target).toBeNull();
    expect(done.revokeFailed).toBe(false);
    expect(done.revoked).toContain("k2");
  });

  it("opens any later confirm without the notice", () => {
    for (const id of ["k2", "k3"]) {
      const s = run([
        ...failed,
        { type: "cancel-revoke" },
        { type: "ask-revoke", id },
      ]);
      expect(s[3].revokeFailed).toBe(false);
      expect(s[4].phase).toBe("confirm");
      expect(s[4].target).toBe(id);
      expect(s[4].revokeFailed).toBe(false);
    }
  });
});

describe("Keys' Access options", () => {
  it("draws two options on the org page and three on the project page", () => {
    expect(accessOptions(false)).toEqual(["full", "capture"]);
    expect(accessOptions(true)).toEqual(["full", "capture", "workspace"]);
  });

  it("names the third option and its hint in the signed words", () => {
    expect(KEYS.accessWorkspace).toBe("Workspace sync");
    expect(KEYS.accessWorkspaceHint).toBe(
      "A workspace key links one checkout of this project's workspace and reaches nothing else.",
    );
  });

  it("sends the workspace scope when the third option is chosen", async () => {
    const mint = vi.fn(async (): Promise<MintResult> => ({
      ok: true,
      key: SECRET,
    }));
    const s = run([
      { type: "toggle-form" },
      { type: "set-access", access: "workspace" },
    ]).at(-1)!;
    await sendMint("sync", s.access, mint);
    expect(mint).toHaveBeenCalledWith({ name: "sync", access: "workspace" });
  });
});

describe("Keys' table", () => {
  const credential = (scope: "full" | "capture" | "workspace") =>
    keyRowOf({
      id: `k-${scope}`,
      name: scope,
      token_prefix: "vk_91c4e7",
      created_at: "2026-11-01T00:00:00Z",
      last_used_at: null,
      revoked_at: null,
      scope,
    } as Parameters<typeof keyRowOf>[0]);

  it("reads Workspace for a workspace key, never Full access", () => {
    const row = credential("workspace");
    expect(row.access).toBe("workspace");
    expect(accessWord(row.access)).toBe("Workspace");
    const html = renderToStaticMarkup(
      createElement(Keys, {
        scope: "project",
        workspace: true,
        subject: "Docs",
        rows: [row, credential("full"), credential("capture")],
        mint: async (): Promise<MintResult> => ({
          ok: false,
          reason: "failed",
        }),
        revoke: async () => ({ ok: false }) as const,
      }),
    );
    expect(html).toContain(">Workspace</td>");
    expect(html.match(/>Full access<\/td>/g)).toHaveLength(1);
    expect(html).toContain(">Capture only</td>");
  });
});
