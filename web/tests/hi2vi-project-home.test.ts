import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspacePanel } from "@/app/(app)/projects/[projectId]/parts";
import {
  isMissingProjectStatus,
  libraryRows,
  mintOutcome,
  projectHomeId,
  requestOrigin,
  visibilityOutcome,
  visibilityReducer,
  workspaceWords,
} from "@/app/(app)/projects/[projectId]/model";
import { MINT_CREDENTIAL_ERRORS } from "@/content/project";
import { railFor } from "@/hi2vi/shell/model";
import type { KbOrgLibrary } from "@/lib/knowledge/types";

// Project home's core rules (job 01 round 03-instrument; operator D1): the Workspace panel's signed
// sentence with the link command, the Library's five newest, a refused visibility change, and Not
// found's statuses.

describe("Workspace panel (operator D1)", () => {
  it("reads the signed sentence with the link command for this origin and project", () => {
    const w = workspaceWords({
      origin: "https://hi2vi.com",
      projectId: "p_42",
    });
    expect(w.empty).toBe("No workspace linked yet.");
    expect(w.run).toEqual({
      before: "Run ",
      command:
        "python3 workflow/scripts/workflow.py link https://hi2vi.com/projects/p_42",
      after: " in the project’s repo.",
    });
    expect(w.badge).toBe("Coming");
  });

  it("takes the origin from the request, behind a proxy or not", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(
      requestOrigin(h({ host: "hi2vi.com", "x-forwarded-proto": "https" })),
    ).toBe("https://hi2vi.com");
    expect(requestOrigin(h({ host: "127.0.0.1:3030" }))).toBe(
      "http://127.0.0.1:3030",
    );
    expect(
      requestOrigin(
        h({
          host: "internal:3000",
          "x-forwarded-host": "staging.hi2vi.com",
          "x-forwarded-proto": "https,http",
        }),
      ),
    ).toBe("https://staging.hi2vi.com");
    expect(requestOrigin(h({}))).toBeNull();
  });

  it("finds the project id in project home's own path, and nowhere else", () => {
    expect(projectHomeId("/projects/p_42")).toBe("p_42");
    expect(projectHomeId("/projects/p_42?x=1")).toBe("p_42");
    expect(projectHomeId("/projects/p_42/feedback")).toBeNull();
    expect(projectHomeId(null)).toBeNull();
  });

  it("lets the link command, and only it, break anywhere inside its card", () => {
    // A self-hosted origin with a port is one run longer than a phone's card; `.ui`'s keep-all
    // would otherwise push the page sideways.
    const html = renderToStaticMarkup(
      createElement(WorkspacePanel, {
        origin: "http://kb.example.test:60592",
        projectId: "f4cd8de2-2872-45a5-a975-a964542f1dbc",
      }),
    );
    const codes = [...html.matchAll(/<code\b[^>]*>/g)].map((m) => m[0]);
    expect(codes).toEqual(['<code class="mono ph-cmd">']);
    const css = readFileSync(
      join(
        __dirname,
        "..",
        "src/app/(app)/projects/[projectId]/project-home.css",
      ),
      "utf8",
    );
    const rules = (css.match(/\.ph-cmd\s*\{[^}]*\}/g) ?? []).map((r) =>
      r.replace(/\s+/g, " "),
    );
    expect(rules).toEqual([".ph-cmd { overflow-wrap: anywhere; }"]);
  });

  it("leaves no placeholder in the shipped words", () => {
    const sources = [
      "src/content/project.ts",
      "src/app/(app)/projects/[projectId]/parts.tsx",
      "src/app/(app)/projects/[projectId]/model.ts",
    ].map((f) => readFileSync(join(__dirname, "..", f), "utf8"));
    for (const s of sources) expect(s).not.toContain("[LINK COMMAND]");
  });
});

const variant = (doc: string) => ({
  lang: "en",
  doc,
  doc_id: 1,
  title: "x",
  version: 1,
  format: "native" as const,
});

const doc = (id: number, date: string, project = "platform") => ({
  id,
  project,
  slug: `d${id}`,
  doc: `${date}-d${id}`,
  title: `Doc ${id}`,
  date,
  format: "md" as const,
  lang: id === 2 ? "ko" : "en",
  version: 1,
  subject: null,
  canonical_path: null,
});

const listing: KbOrgLibrary = {
  org: { id: "t1", slug: "june", name: "Personal", label: "june" },
  member: true,
  projects: [{ name: "platform", visibility: "private" }],
  books: [
    {
      project: "platform",
      slug: "handbook",
      title: "The platform handbook",
      kind: "codebase",
      subject: null,
      chapters: Array.from({ length: 14 }, (_, i) => ({
        key: `c${i}`,
        position: i,
        title: null,
        variants: [
          variant(`2026-11-${String(i < 13 ? 1 : 10).padStart(2, "0")}-c${i}`),
        ],
      })),
    },
  ],
  documents: [
    doc(1, "2026-11-14"),
    doc(2, "2026-11-12"),
    doc(3, "2026-11-09"),
    doc(4, "2026-11-06"),
    doc(5, "2026-10-01"),
    doc(6, "2026-11-15", "vocky"),
    doc(7, "2026-09-01"),
  ],
};

describe("Library panel", () => {
  it("lists at most five of the project's rows, newest first", () => {
    const rows = libraryRows(listing, "platform");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-11-14",
      "2026-11-12",
      "2026-11-10",
      "2026-11-09",
      "2026-11-06",
    ]);
    expect(rows.some((r) => r.title === "Doc 6")).toBe(false);
    expect(rows[1].lang).toBe("ko");
  });

  it("gives a book its badge, its chapter count and its link", () => {
    const book = libraryRows(listing, "platform").find((r) => r.book);
    expect(book).toBeDefined();
    expect(book?.title).toBe("The platform handbook");
    expect(book?.length).toBe("14 chapters");
    expect(book?.href).toBe("/@june/platform/books/handbook");
  });
});

describe("Head: visibility", () => {
  it("a refused change shows the not-saved state and keeps the shown visibility", () => {
    const saving = visibilityReducer(
      { visibility: "private", phase: "idle" },
      { type: "press" },
    );
    expect(saving).toEqual({ visibility: "private", phase: "saving" });
    const answer = visibilityOutcome({
      error: "Could not update visibility. Please try again.",
    });
    expect(answer).toBe("refused");
    expect(visibilityReducer(saving, { type: answer })).toEqual({
      visibility: "private",
      phase: "failed",
    });
  });

  it("a second press while saving does nothing; a saved change flips", () => {
    const saving = { visibility: "private", phase: "saving" } as const;
    expect(visibilityReducer(saving, { type: "press" })).toBe(saving);
    expect(
      visibilityReducer(saving, { type: visibilityOutcome({ error: null }) }),
    ).toEqual({ visibility: "public", phase: "idle" });
  });

  it("takes the server's visibility on a refresh, unless a change is being saved", () => {
    const shown = { visibility: "public", phase: "idle" } as const;
    expect(
      visibilityReducer(shown, { type: "sync", visibility: "private" }),
    ).toEqual({ visibility: "private", phase: "idle" });
    expect(
      visibilityReducer(shown, { type: "sync", visibility: "public" }),
    ).toBe(shown);
    const saving = { visibility: "public", phase: "saving" } as const;
    expect(
      visibilityReducer(saving, { type: "sync", visibility: "private" }),
    ).toBe(saving);
  });
});

describe("Not found", () => {
  it("draws the Shell with no project and no rail item current", () => {
    const rail = railFor("/projects/no-such-project", false);
    expect(rail.form).toBe("org");
    expect([...rail.items, rail.review].some((i) => i.current)).toBe(false);
    expect(railFor("/projects/p1", true).form).toBe("project");
  });

  it("maps a missing, foreign or malformed id to Not found, and nothing else", () => {
    for (const s of [404, 400, 422])
      expect(isMissingProjectStatus(s)).toBe(true);
    for (const s of [401, 403, 500, 502])
      expect(isMissingProjectStatus(s)).toBe(false);
  });
});

describe("Keys: mint answer", () => {
  it("maps the kept action's answers to Keys' result", () => {
    expect(mintOutcome({ error: null, key: "vk_x", ok: 1 })).toEqual({
      ok: true,
      key: "vk_x",
    });
    expect(mintOutcome({ error: MINT_CREDENTIAL_ERRORS.invalidName })).toEqual({
      ok: false,
      reason: "invalid-name",
    });
    expect(mintOutcome({ error: MINT_CREDENTIAL_ERRORS.generic })).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
