import { ORG_HOME } from "@/content/dashboard";
import type { KeyRow } from "@/hi2vi/frame";
import { date, num, when, type FormatOptions } from "@/lib/format";
import { credentialStatus } from "@/lib/knowledge/credential-status";
import type {
  KbActivityEvent,
  KbCredential,
  KbDashboardProject,
} from "@/lib/knowledge/types";

/**
 * Org home's rules (job 01 round 03-instrument, `## Build` § *Org home*; `OrgHomeProjects.dc.html`,
 * `OrgHomeUrl.dc.html`, `OrgHomeActivity.dc.html`), pure so they are tested without a DOM
 * (tests/hi2vi-org-home.test.ts). The panels hold no other logic.
 */

/** The id on the Org API keys head: the landing's "Mint an org key" links to `/dashboard#org-keys-head`. */
export const ORG_KEYS_HEAD_ID = "org-keys-head";

// ── Projects ────────────────────────────────────────────────────────────────

/** Over this many rows the table's box is `.table-scroll.is-capped`: it scrolls under its sticky header and the next row shows cut. */
export const PROJECTS_CAP = 10;

export function projectsCapped(rows: number): boolean {
  return rows > PROJECTS_CAP;
}

/** A project row as the table shows it; every figure already formatted. */
export interface ProjectRowView {
  id: string;
  name: string;
  /** `ko` for a Korean name. */
  lang: "ko" | undefined;
  docs: string;
  keys: string;
  visibility: string;
  created: string;
  used: string;
}

const HANGUL = /[가-힣]/;

export function langOf(name: string): "ko" | undefined {
  return HANGUL.test(name) ? "ko" : undefined;
}

/**
 * The table's rows, newest first (a created project is the first row). `docs` is each project's active
 * documents now (`GET /app/documents?project=<id>`'s `total`), never the rollup's 30-day count.
 */
export function projectRows(
  projects: readonly KbDashboardProject[],
  docs: ReadonlyMap<string, number>,
  format: FormatOptions,
): ProjectRowView[] {
  return [...projects]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((p) => ({
      id: p.id,
      name: p.name,
      lang: langOf(p.name),
      docs: num(docs.get(p.id) ?? 0),
      keys: num(p.keys),
      visibility:
        p.visibility === "public"
          ? ORG_HOME.projects.visibility.public
          : ORG_HOME.projects.visibility.private,
      created: date(p.created_at, format),
      used: when(p.last_used_at, format),
    }));
}

export type ProjectsPhase =
  "list" | "create" | "creating" | "name-error" | "create-failed";

export interface ProjectsForm {
  phase: ProjectsPhase;
  draft: string;
}

/** What the page's create action answers. `invalid-name` is the server refusing the name. */
export type CreateProjectResult =
  { ok: true; name: string } | { ok: false; reason: "invalid-name" | "failed" };

export type ProjectsFormAction =
  | { type: "open" }
  | { type: "cancel" }
  | { type: "type"; value: string }
  | { type: "submit" }
  | { type: "answer"; result: CreateProjectResult };

export const initialProjectsForm: ProjectsForm = { phase: "list", draft: "" };

/** A name of 1 to 200 characters once trimmed. */
export function checkProjectName(draft: string): boolean {
  const name = draft.trim();
  return name.length >= 1 && name.length <= 200;
}

export function projectsForm(
  state: ProjectsForm,
  action: ProjectsFormAction,
): ProjectsForm {
  switch (action.type) {
    case "open":
      return state.phase === "list" ? { phase: "create", draft: "" } : state;
    case "cancel":
      return state.phase === "creating" ? state : initialProjectsForm;
    case "type":
      if (state.phase === "creating") return state;
      return {
        phase: state.phase === "name-error" ? "create" : state.phase,
        draft: action.value,
      };
    case "submit":
      if (state.phase === "creating" || state.phase === "list") return state;
      return {
        ...state,
        phase: checkProjectName(state.draft) ? "creating" : "name-error",
      };
    case "answer":
      if (state.phase !== "creating") return state;
      if (action.result.ok) return initialProjectsForm;
      return {
        ...state,
        phase:
          action.result.reason === "invalid-name"
            ? "name-error"
            : "create-failed",
      };
  }
}

/** The field error under Project name, or `null`. */
export function projectNameError(phase: ProjectsPhase): string | null {
  return phase === "name-error" ? ORG_HOME.projects.nameError : null;
}

// ── Public URL ──────────────────────────────────────────────────────────────

export type UrlPhase =
  "rest" | "change" | "saving" | "taken" | "invalid" | "save-failed";

export interface UrlForm {
  /** The org's claimed name, or `null` (no public URL: the form is the panel's body). */
  slug: string | null;
  phase: UrlPhase;
  draft: string;
}

/** What the page's save action answers. */
export type SaveSlugResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "invalid" | "taken" | "failed" };

export type UrlFormAction =
  | { type: "change" }
  | { type: "cancel" }
  | { type: "type"; value: string }
  | { type: "submit" }
  | { type: "answer"; result: SaveSlugResult }
  | { type: "sync"; slug: string | null };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 2 to 40 lowercase letters, numbers and single hyphens (the server's rule; it also holds reserved words). */
export function checkSlug(value: string): boolean {
  return value.length >= 2 && value.length <= 40 && SLUG.test(value);
}

export function initialUrlForm(slug: string | null): UrlForm {
  return { slug, phase: "rest", draft: "" };
}

/** Whether the claimed address is shown (else the form is). */
export function urlShown(state: UrlForm): boolean {
  return state.slug !== null && state.phase === "rest";
}

export function urlForm(state: UrlForm, action: UrlFormAction): UrlForm {
  const open: UrlPhase = state.slug ? "change" : "rest";
  switch (action.type) {
    case "change":
      return state.slug && state.phase === "rest"
        ? { ...state, phase: "change", draft: state.slug }
        : state;
    case "cancel":
      return state.phase === "saving"
        ? state
        : { ...state, phase: "rest", draft: "" };
    case "type":
      if (state.phase === "saving") return state;
      return {
        ...state,
        phase:
          state.phase === "taken" || state.phase === "invalid"
            ? open
            : state.phase,
        draft: action.value,
      };
    case "submit": {
      if (state.phase === "saving" || urlShown(state)) return state;
      const value = state.draft.trim();
      if (state.slug && value === state.slug)
        return { ...state, phase: "rest", draft: "" };
      return { ...state, phase: checkSlug(value) ? "saving" : "invalid" };
    }
    case "answer":
      if (state.phase !== "saving") return state;
      if (action.result.ok)
        return { slug: action.result.slug, phase: "rest", draft: "" };
      return {
        ...state,
        phase:
          action.result.reason === "failed"
            ? "save-failed"
            : action.result.reason,
      };
    case "sync":
      return action.slug === state.slug || state.phase !== "rest"
        ? state
        : { ...state, slug: action.slug };
  }
}

/** The field error under Org slug, or `null`. */
export function slugError(phase: UrlPhase): string | null {
  if (phase === "taken") return ORG_HOME.url.taken;
  if (phase === "invalid") return ORG_HOME.url.invalid;
  return null;
}

// ── Recent activity ─────────────────────────────────────────────────────────

/** The panel's lines: newest first, seven. */
export const ACTIVITY_LINES = 7;

export interface ActivityLineView {
  key: string;
  text: string;
  name: string;
  lang: "ko" | undefined;
  when: string;
}

interface ActivityItem {
  type: KbActivityEvent["type"];
  name: string | null;
  at: string;
}

/**
 * The feed: the rollup's lines (projects and project keys, `GET /app/dashboard`) with the org keys'
 * own (`GET /app/credentials`: minted at `created_at`, revoked at `revoked_at`), which the rollup does
 * not carry. The rollup sends its newest eight, so the newest seven of the union are exact.
 */
export function activityLines(
  events: readonly KbActivityEvent[],
  orgKeys: readonly KbCredential[],
  format: FormatOptions,
): ActivityLineView[] {
  const items: ActivityItem[] = events.map((e) => ({
    type: e.type,
    name: e.type === "project_created" ? e.project_name : e.credential_name,
    at: e.at,
  }));
  for (const k of orgKeys) {
    items.push({ type: "key_minted", name: k.name, at: k.created_at });
    if (k.revoked_at !== null)
      items.push({ type: "key_revoked", name: k.name, at: k.revoked_at });
  }
  return items
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, ACTIVITY_LINES)
    .map((item, i) => {
      const name = item.name || ORG_HOME.activity.unnamedKey;
      return {
        key: `${item.type}-${item.at}-${i}`,
        text: ORG_HOME.activity.text[item.type],
        name,
        lang: langOf(name),
        when: when(item.at, format),
      };
    });
}

// ── Org API keys ────────────────────────────────────────────────────────────

/** An org key as `Keys` lists it: the prefix only, never the value. */
export function keyRow(c: KbCredential): KeyRow {
  return {
    id: c.id,
    name: c.name,
    prefix: c.token_prefix,
    access: c.scope,
    status: credentialStatus(c),
    created: c.created_at,
    lastUsed: c.last_used_at,
  };
}
