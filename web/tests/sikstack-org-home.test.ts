import { describe, expect, it } from "vitest";

import {
  initialProjectsForm,
  ORG_KEYS_HEAD_ID,
  projectNameError,
  projectsForm,
  PROJECTS_CAP,
  projectsCapped,
  slugError,
  urlForm,
} from "@/app/(app)/dashboard/org-home-model";

// Org home (job 01 round 03, `OrgHome*.dc.html`): the rules a page without a DOM can prove.

describe("the projects table's cap", () => {
  it("is ten rows, then the box scrolls under its header with the cut row showing", () => {
    expect(PROJECTS_CAP).toBe(10);
  });

  it("caps only when there are more rows than the cap", () => {
    expect(projectsCapped(0)).toBe(false);
    expect(projectsCapped(3)).toBe(false);
    expect(projectsCapped(10)).toBe(false);
    expect(projectsCapped(11)).toBe(true);
    expect(projectsCapped(24)).toBe(true);
  });
});

describe("the public URL form", () => {
  const typed = { slug: null, phase: "rest" as const, draft: "fieldnotes" };

  it("maps a name the server refuses as taken to the signed sentence", () => {
    const next = urlForm(
      { ...typed, phase: "saving" },
      { type: "answer", result: { ok: false, reason: "taken" } },
    );
    expect(next.phase).toBe("taken");
    expect(next.draft).toBe("fieldnotes");
    expect(slugError(next.phase)).toBe(
      "That URL name is already taken. Try another one.",
    );
  });

  it("maps a name the server refuses as invalid to the signed sentence", () => {
    const next = urlForm(
      { ...typed, phase: "saving" },
      { type: "answer", result: { ok: false, reason: "invalid" } },
    );
    expect(next.phase).toBe("invalid");
    expect(slugError(next.phase)).toBe(
      "Use 2–40 characters: lowercase letters, numbers and single hyphens.",
    );
  });

  it("shows the notice, not a field error, only when the send itself failed", () => {
    const next = urlForm(
      { ...typed, phase: "saving" },
      { type: "answer", result: { ok: false, reason: "failed" } },
    );
    expect(next.phase).toBe("save-failed");
    expect(slugError(next.phase)).toBeNull();
  });

  it("refuses a malformed name before the server sees it", () => {
    const next = urlForm({ ...typed, draft: "KRPD team" }, { type: "submit" });
    expect(next.phase).toBe("invalid");
  });

  it("closes without a send when the claimed name is saved unchanged", () => {
    const next = urlForm(
      { slug: "june", phase: "change", draft: " june " },
      { type: "submit" },
    );
    expect(next.phase).toBe("rest");
  });

  it("clears the error when the field is typed in", () => {
    const next = urlForm(
      { slug: "june", phase: "taken", draft: "fieldnotes" },
      { type: "type", value: "fieldnote" },
    );
    expect(next.phase).toBe("change");
    expect(slugError(next.phase)).toBeNull();
  });
});

describe("the new project form", () => {
  const open = projectsForm(initialProjectsForm, { type: "open" });

  it("maps a name the server refuses to the signed error and keeps what was typed", () => {
    const sending = projectsForm(
      projectsForm(open, { type: "type", value: "  changple  " }),
      { type: "submit" },
    );
    expect(sending.phase).toBe("creating");
    const refused = projectsForm(sending, {
      type: "answer",
      result: { ok: false, reason: "invalid-name" },
    });
    expect(refused.phase).toBe("name-error");
    expect(refused.draft).toBe("  changple  ");
    expect(projectNameError(refused.phase)).toBe(
      "Enter a project name of 1–200 characters.",
    );
  });

  it("refuses an empty or too long name before the server sees it", () => {
    expect(projectsForm(open, { type: "submit" }).phase).toBe("name-error");
    const long = projectsForm(open, { type: "type", value: "x".repeat(201) });
    expect(projectsForm(long, { type: "submit" }).phase).toBe("name-error");
  });

  it("keeps the name and shows the notice when the send failed", () => {
    const sending = projectsForm(
      projectsForm(open, { type: "type", value: "changple" }),
      { type: "submit" },
    );
    const failed = projectsForm(sending, {
      type: "answer",
      result: { ok: false, reason: "failed" },
    });
    expect(failed.phase).toBe("create-failed");
    expect(failed.draft).toBe("changple");
    expect(projectNameError(failed.phase)).toBeNull();
  });

  it("closes the form on a created project", () => {
    const sending = projectsForm(
      projectsForm(open, { type: "type", value: "changple" }),
      { type: "submit" },
    );
    const done = projectsForm(sending, {
      type: "answer",
      result: { ok: true, name: "changple" },
    });
    expect(done.phase).toBe("list");
    expect(done.draft).toBe("");
  });
});

describe("the org keys head", () => {
  it("carries the id the landing links to", () => {
    expect(ORG_KEYS_HEAD_ID).toBe("org-keys-head");
  });
});
