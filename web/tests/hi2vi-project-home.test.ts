import { describe, expect, it } from "vitest";

import {
  isMissingProjectStatus,
  libraryRows,
  mintOutcome,
  visibilityOutcome,
  visibilityReducer,
  workspaceWords,
} from "@/app/(app)/projects/[projectId]/model";
import { MINT_CREDENTIAL_ERRORS } from "@/content/project";
import type { KbOrgLibrary } from "@/lib/knowledge/types";

// Project home's core rules (job 01 round 03-instrument; operator D1): the Workspace panel's held-back
// sentence, the Library's five newest, a refused visibility change, and Not found's statuses.

describe("Workspace panel (operator D1)", () => {
  it("reads exactly the first signed sentence, without the held-back command", () => {
    const w = workspaceWords();
    expect(w.empty).toBe("No workspace linked yet.");
    expect(w.empty).not.toContain("[LINK COMMAND]");
    expect(w.empty).not.toMatch(/\bRun\b/);
    expect(w.badge).toBe("Coming");
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
});

describe("Not found", () => {
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
