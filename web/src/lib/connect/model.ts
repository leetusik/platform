import { date } from "@/lib/format";

/**
 * The connect page's model (job 09, `ConnectColumn.dc.html`): what the API answers for a
 * code and the session (`GET /app/connect/{code}`, `server/installs_api.py`) becomes the
 * column's state, one of the board's ten phases. Pure, so it is tested without a server.
 *
 * - From the server: `out`, `ready`, `already`, `other`, `declined`, `expired`.
 * - Only in the page: `waitlisted` (a sign-up or sign-in that answered "waitlisted", carried
 *   in the `(auth)` layout's memory, never in the address), `connecting`, `error` and
 *   `connected` (the send and its answer).
 */
export type ConnectPhase =
  | "out"
  | "waitlisted"
  | "ready"
  | "connecting"
  | "error"
  | "connected"
  | "declined"
  | "already"
  | "other"
  | "expired";

export interface ConnectInstall {
  /** As shown: its first four, an ellipsis, its last four. */
  id: string;
  version: string;
  /** `Nov 20`. */
  setUp: string;
  email: string;
}

export interface ConnectOrg {
  id: string;
  name: string;
}

export interface ConnectAccount {
  email: string;
  orgs: ConnectOrg[];
}

export interface ConnectProject {
  /** Known once connected (the link to its Workspace). */
  id: string | null;
  /** The repo folder's name. */
  name: string;
}

export interface ConnectView {
  phase: ConnectPhase;
  code: string;
  install: ConnectInstall | null;
  account: ConnectAccount | null;
  project: ConnectProject;
}

const SERVER_PHASES: ReadonlySet<string> = new Set([
  "out",
  "ready",
  "already",
  "other",
  "declined",
  "expired",
]);

const str = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** The code as the address carries it, uppercased; a value that is not one reads as itself, trimmed. */
export function shownCode(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 20) : "";
}

/** The expired view: the code no longer works (or never did). */
export function expiredView(code: string): ConnectView {
  return {
    phase: "expired",
    code,
    install: null,
    account: null,
    project: { id: null, name: "" },
  };
}

/**
 * The API's answer as the column's view. Anything malformed reads as expired: the page never
 * shows a half-known install.
 */
export function viewFromServer(
  raw: unknown,
  code: string,
  options: { timeZone?: string; now?: number } = {},
): ConnectView {
  const body = obj(raw);
  const phase = str(body?.state);
  if (!body || !phase || !SERVER_PHASES.has(phase)) return expiredView(code);
  const shown = str(body.code) ?? code;
  const projectRaw = obj(body.project);
  const project: ConnectProject = {
    id: str(projectRaw?.id),
    name: str(projectRaw?.name) ?? "",
  };
  let install: ConnectInstall | null = null;
  const inst = obj(body.install);
  if (inst) {
    const id = str(inst.id);
    const version = str(inst.version);
    const setUp = str(inst.set_up);
    const email = str(inst.email);
    if (id && version && setUp && email) {
      install = {
        id,
        version,
        setUp: date(setUp, { timeZone: options.timeZone, now: options.now }),
        email,
      };
    }
  }
  let account: ConnectAccount | null = null;
  const acct = obj(body.account);
  if (acct && str(acct.email)) {
    const orgs = Array.isArray(acct.orgs)
      ? acct.orgs
          .map((o) => obj(o))
          .filter((o): o is Record<string, unknown> => !!o)
          .map((o) => ({ id: str(o.id) ?? "", name: str(o.name) ?? "" }))
          .filter((o) => o.id !== "")
      : [];
    account = { email: str(acct.email) as string, orgs };
  }
  if ((phase === "out" || phase === "ready") && (!install || !project.name)) {
    return expiredView(shown);
  }
  if (phase === "ready" && (!account || account.orgs.length === 0)) {
    return expiredView(shown);
  }
  if (phase === "already" && !project.id) return expiredView(shown);
  return { phase: phase as ConnectPhase, code: shown, install, account, project };
}

/** The confirm's phases: the code still shows, with the install and the action pair. */
export function isConfirm(phase: ConnectPhase): boolean {
  return (
    phase === "out" ||
    phase === "ready" ||
    phase === "connecting" ||
    phase === "error"
  );
}

/**
 * Where a Connect lands, by the BFF's status: 200 connected; 410 the code is gone; 403 another
 * account owns the install; 401 the session ended (signed out); anything else the error.
 */
export function phaseAfterConnect(status: number | null): ConnectPhase {
  if (status === 200) return "connected";
  if (status === 410) return "expired";
  if (status === 403) return "other";
  if (status === 401) return "out";
  return "error";
}

/** Where Don't connect lands: 200 not connected, else as Connect would. */
export function phaseAfterDecline(status: number | null): ConnectPhase {
  return status === 200 ? "declined" : phaseAfterConnect(status);
}

/** The page's own address for a code, the `next` that Sign in and Create account carry. */
export function connectPath(code: string): string {
  return `/connect?code=${encodeURIComponent(code)}`;
}

/** Whether a laundered `next` returns to a connect page (the waitlist goes there). */
export function isConnectNext(next: string): boolean {
  return next.startsWith("/connect?");
}

/** `/projects/<id>/workspace`, the way on after a connection. */
export function projectHref(id: string): string {
  return `/projects/${encodeURIComponent(id)}/workspace`;
}

/** An email as `local` and `@domain`, so a line breaks only before its `@` (F501). */
export function splitEmail(email: string): { local: string; domain: string } {
  const at = email.indexOf("@");
  return at < 0
    ? { local: email, domain: "" }
    : { local: email.slice(0, at), domain: email.slice(at) };
}

/** `KQ4M-7TZP` as its two groups, the hyphen kept on the first: `["KQ4M-", "7TZP"]`. */
export function codeGroups(code: string): [string, string] {
  const at = code.indexOf("-");
  return at < 0 ? [code, ""] : [code.slice(0, at + 1), code.slice(at + 1)];
}

/** The code a connect page's `next` carries, as `shownCode` reads it, or `""`. */
export function codeOfNext(next: string): string {
  if (!isConnectNext(next)) return "";
  const query = next.slice(next.indexOf("?") + 1).split("#")[0];
  return shownCode(new URLSearchParams(query).get("code") ?? undefined);
}
