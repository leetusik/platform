/**
 * Keys' state (`Keys.dc.html`, frame.md F1, F3, F4, F21, F22), pure so it can be tested without a DOM.
 *
 * Phases are the board's: `list`, `mint` (the form in place), `minting`, `shown` (the new key in the
 * show-once dialog), `confirm` (revoke asks), `revoking`. The board's `mint-failed` is `mint` with the
 * notice (`failed`), which stays while the form is sent again, until the next answer (F22). A
 * failed revoke is `confirm` with its own notice (`revokeFailed`, the operator's OQ6 answer), kept
 * the same way through the retry and gone when the confirm closes or another opens.
 *
 * The show-once rule: the minted key's value lives only in `key`, set by `mint-ok` and cleared by
 * every action that leaves `shown`; no other state carries it.
 */
import { KEYS } from "@/content/hi2vi-frame";

/** `workspace` links one checkout of a project's workspace; only the project form offers it. */
export type KeyAccess = "full" | "capture" | "workspace";
export type KeyStatus = "active" | "idle" | "revoked";

/** A key as the table lists it: its prefix only, never its value. */
export interface KeyRow {
  id: string;
  /** `null`: an unnamed key (`Unnamed key`). */
  name: string | null;
  /** `vk_91c4e7`; the table adds the ellipsis. */
  prefix: string;
  access: KeyAccess;
  status: KeyStatus;
  /** A calendar date or an instant (`@/lib/format` `date`). */
  created: string;
  /** An instant, or `null` for never (`Never`). */
  lastUsed: string | null;
}

export interface MintInput {
  /** The trimmed name, or `null` for none (the name is optional). */
  name: string | null;
  access: KeyAccess;
}

/** What a page's mint action answers. `invalid-name` is the server refusing the name. */
export type MintResult =
  { ok: true; key: string } | { ok: false; reason: "invalid-name" | "failed" };

/** What a page's revoke action answers. */
export type RevokeResult = { ok: true } | { ok: false };

export type KeysPhase =
  "list" | "mint" | "minting" | "shown" | "confirm" | "revoking";

export interface KeysState {
  phase: KeysPhase;
  draft: string;
  access: KeyAccess;
  /** The field error under Key name (F4: over 200 characters). Leaves when the name is edited. */
  nameError: boolean;
  /** The notice over the form: `Could not create the key. Try again.` */
  failed: boolean;
  /** The minted key's value, only while `shown`. */
  key: string | null;
  /** The notice in the revoke confirm: `Could not revoke the key. Try again.` */
  revokeFailed: boolean;
  /** The key a `confirm` or `revoking` is about. */
  target: string | null;
  /** Keys revoked here, read as Revoked before the page's list catches up. */
  revoked: readonly string[];
}

export const KEY_NAME_MAX = 200;

export const initialKeysState: KeysState = {
  phase: "list",
  draft: "",
  access: "full",
  nameError: false,
  failed: false,
  key: null,
  revokeFailed: false,
  target: null,
  revoked: [],
};

export type KeysAction =
  | { type: "toggle-form" }
  | { type: "cancel-form" }
  | { type: "set-draft"; draft: string }
  | { type: "set-access"; access: KeyAccess }
  | { type: "name-invalid" }
  | { type: "mint-start" }
  | { type: "mint-ok"; key: string }
  | { type: "mint-failed" }
  | { type: "close-key" }
  | { type: "ask-revoke"; id: string }
  | { type: "cancel-revoke" }
  | { type: "revoke-start" }
  | { type: "revoke-ok"; id: string }
  | { type: "revoke-failed" };

const closedForm = {
  draft: "",
  access: "full" as const,
  nameError: false,
  failed: false,
};

export function keysReducer(state: KeysState, action: KeysAction): KeysState {
  // Every state but `shown` drops the key's value, whatever led there.
  const next = step(state, action);
  return next.phase === "shown" || next.key === null
    ? next
    : { ...next, key: null };
}

function step(state: KeysState, action: KeysAction): KeysState {
  switch (action.type) {
    case "toggle-form":
      if (state.phase === "list") return { ...state, phase: "mint" };
      if (state.phase === "mint")
        return { ...state, ...closedForm, phase: "list" };
      return state;
    case "cancel-form":
      if (state.phase !== "mint") return state;
      return { ...state, ...closedForm, phase: "list" };
    case "set-draft":
      if (state.phase !== "mint") return state;
      return { ...state, draft: action.draft, nameError: false };
    case "set-access":
      if (state.phase !== "mint") return state;
      return { ...state, access: action.access };
    case "name-invalid":
      if (state.phase !== "mint" && state.phase !== "minting") return state;
      return { ...state, phase: "mint", nameError: true, failed: false };
    case "mint-start":
      if (state.phase !== "mint") return state;
      return { ...state, phase: "minting", nameError: false };
    case "mint-ok":
      if (state.phase !== "minting") return state;
      return { ...state, ...closedForm, phase: "shown", key: action.key };
    case "mint-failed":
      if (state.phase !== "minting") return state;
      return { ...state, phase: "mint", failed: true };
    case "close-key":
      if (state.phase !== "shown") return state;
      return { ...state, phase: "list", key: null };
    case "ask-revoke":
      if (state.phase !== "list") return state;
      return {
        ...state,
        phase: "confirm",
        target: action.id,
        revokeFailed: false,
      };
    case "cancel-revoke":
      if (state.phase !== "confirm") return state;
      return { ...state, phase: "list", target: null, revokeFailed: false };
    case "revoke-start":
      if (state.phase !== "confirm" || state.target === null) return state;
      return { ...state, phase: "revoking" };
    case "revoke-ok":
      if (state.phase !== "revoking") return state;
      return {
        ...state,
        phase: "list",
        target: null,
        revokeFailed: false,
        revoked: state.revoked.includes(action.id)
          ? state.revoked
          : [...state.revoked, action.id],
      };
    case "revoke-failed":
      if (state.phase !== "revoking") return state;
      return { ...state, phase: "confirm", revokeFailed: true };
  }
}

/** The name as sent: trimmed, `null` when empty (optional); over 200 characters it is refused. */
export function checkKeyName(
  draft: string,
): { ok: true; name: string | null } | { ok: false } {
  const name = draft.trim();
  if (name.length > KEY_NAME_MAX) return { ok: false };
  return { ok: true, name: name === "" ? null : name };
}

/**
 * One send of the form: the name is checked first, and a refused name never reaches `mint`. Returns
 * the action that ends the send (`mint-start` is the caller's, dispatched before it awaits this).
 */
export async function sendMint(
  draft: string,
  access: KeyAccess,
  mint: (input: MintInput) => Promise<MintResult>,
): Promise<KeysAction> {
  const checked = checkKeyName(draft);
  if (!checked.ok) return { type: "name-invalid" };
  try {
    const result = await mint({ name: checked.name, access });
    if (result.ok) return { type: "mint-ok", key: result.key };
    return result.reason === "invalid-name"
      ? { type: "name-invalid" }
      : { type: "mint-failed" };
  } catch {
    return { type: "mint-failed" };
  }
}

/** The rows as the table shows them: a key revoked here reads Revoked at once. */
export function shownRows(
  rows: readonly KeyRow[],
  revoked: readonly string[],
): KeyRow[] {
  return rows.map((r) =>
    revoked.includes(r.id) && r.status !== "revoked"
      ? { ...r, status: "revoked" }
      : r,
  );
}

/** The form's Access options in order: the project form adds `workspace` when the page asks. */
export function accessOptions(workspace: boolean): KeyAccess[] {
  return workspace ? ["full", "capture", "workspace"] : ["full", "capture"];
}

/** A key's scope as the table's Access cell reads it. */
export function accessWord(access: KeyAccess): string {
  return KEYS.accessWord[access];
}

/** A key's label in a dialog title and a button's name: its name, else its prefix and an ellipsis. */
export function keyLabel(row: Pick<KeyRow, "name" | "prefix">): string {
  return row.name || `${row.prefix}…`;
}
