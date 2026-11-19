import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedbackDetail } from "@/lib/feedback/types";

// P65-nh.S6 — Add to agenda and the Agenda part, behind the agenda seam (job 04 round 02,
// `FeedbackItemSend*`, `FeedbackItemAgenda*`; frame.md F143, F341 to F344; operator decision 2;
// D237-we). The suite has no DOM: the confirm's native behaviour (showModal, focus moves) is checked
// in a real browser (S10); here its rules are pure steps and its states static markup, driven by props.

const detail = vi.fn();
const projects = vi.fn();

vi.mock("@/lib/auth-guards", () => ({
  requireIdentity: async () => ({
    token: "t",
    identity: { tenant: { name: "Personal" } },
  }),
}));
vi.mock("@/lib/feedback/app", () => ({
  getFeedbackDetail: (...args: unknown[]) => detail(...args),
}));
vi.mock("@/lib/knowledge/app", () => ({
  listProjects: (...args: unknown[]) => projects(...args),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { ADD, AGENDA } from "@/content/feedback-agenda";
import {
  AgendaHeadEnd,
  AgendaPart,
  AgendaScope,
  AgendaSlot,
  agendaPageState,
  answer,
  ask,
  cancel,
  focusBack,
  isLocked,
  send,
  type AddPhase,
  type AgendaScopeProps,
} from "@/hi2vi/feedback/agenda";
import { FeedbackItemBody } from "@/hi2vi/feedback/item/body";
import {
  agendaFiling,
  agendaStatus,
  AgendaUnavailableError,
  canAdd,
  fileAgendaItem,
  itemTitle,
  mintAgendaId,
  sent,
  type AgendaItem,
  type AgendaStatus,
} from "@/lib/feedback/agenda";

const ID = "0b9a6a52-2a0e-4c62-9a63-4a3c3f6d2f11";
const PROJECT = "7c1e1f7e-3f5c-4d55-8d0e-1b4b0f5f9a01";
const NO_WORKSPACE =
  "platform has no workspace linked, so it has no agenda to add this to.";
const NO_PROJECT =
  "This feedback has no project, so there is no agenda to add it to.";

function record(over: Partial<FeedbackDetail> = {}): FeedbackDetail {
  return {
    id: ID,
    message: "On my phone the top bar runs off the screen.",
    source_product: "",
    feedback_value: null,
    comment: null,
    channel: null,
    source_integration: null,
    recorded_by: null,
    conversation_id: null,
    session_id: null,
    user_id: null,
    trigger_type: null,
    trigger_message: null,
    trigger_metadata: {},
    target_type: null,
    target_id: null,
    target_role: null,
    target_text: null,
    event_at: null,
    ingested_at: "2026-11-15T01:00:00Z",
    tags: [],
    messages: [],
    used_context: [],
    source_metadata: {},
    attributes: {},
    project_id: null,
    comments: [],
    attachments: [],
    ...over,
  };
}

function item(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "A13-n1",
    project: PROJECT,
    title: "On my phone the top bar runs off the screen.",
    lang: "en",
    state: "open",
    created: "2026-11-15",
    sync: "waiting",
    href: "/agenda/A13-n1",
    ...over,
  };
}

async function page(over: Partial<FeedbackDetail> = {}) {
  detail.mockResolvedValue(record(over));
  const node = await FeedbackItemBody({
    scope: null,
    feedbackId: ID,
    from: undefined,
  });
  return renderToStaticMarkup(node as ReactElement);
}

function headEnd(phase: AddPhase, added: AgendaItem | null = null) {
  const props = { project: "platform", phase, item: added } as AgendaScopeProps;
  return renderToStaticMarkup(
    createElement(
      AgendaScope,
      props,
      createElement(AgendaHeadEnd),
      createElement(AgendaSlot),
    ),
  );
}

beforeEach(() => {
  detail.mockReset();
  projects.mockReset();
  projects.mockResolvedValue([{ id: PROJECT, name: "platform" }]);
});

describe("the seam today (decision 2)", () => {
  it("offers the add to no record: no project, then no workspace linked", () => {
    expect(canAdd({ project_id: null })).toEqual({
      offered: false,
      reason: "no-project",
    });
    expect(canAdd({ project_id: PROJECT }, "platform")).toEqual({
      offered: false,
      reason: "no-workspace",
      project: "platform",
    });
    expect(sent(record({ project_id: PROJECT }))).toBeNull();
  });

  it("never files: the write throws until a store exists", async () => {
    await expect(
      fileAgendaItem(record({ project_id: PROJECT })),
    ).rejects.toBeInstanceOf(AgendaUnavailableError);
  });

  it("files an Open item first, its title cut, its note the message and a link back; mints A<n>-n<k>", () => {
    expect(
      agendaFiling({
        id: ID,
        message: "Line one\nLine two",
        project_id: PROJECT,
      }),
    ).toEqual({
      project: PROJECT,
      title: "Line one",
      lang: "en",
      note: `Line one\nLine two\n\n/feedback/${ID}`,
      from: ID,
      state: "open",
      place: "first",
    });
    expect(mintAgendaId(13, 0)).toBe("A13-n1");
    expect(mintAgendaId(13, 1)).toBe("A14-n2");
  });
});

describe("itemTitle (F342)", () => {
  it("keeps a short first line whole, and takes only the first line", () => {
    expect(itemTitle("Short title.")).toBe("Short title.");
    expect(itemTitle("First line.\nSecond line.")).toBe("First line.");
    expect(itemTitle("결제가 안 돼요\n두 번째 줄")).toBe("결제가 안 돼요");
  });

  it("cuts a line over 200 at the last word before the limit, with an ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const title = itemTitle(words);
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith("…")).toBe(true);
    const kept = title.slice(0, -1);
    expect(words.startsWith(kept + " ")).toBe(true);
    expect(itemTitle("x".repeat(200))).toBe("x".repeat(200));
    expect(itemTitle("x".repeat(201))).toBe("x".repeat(199) + "…");
  });
});

describe("the five statuses (F37, F301, D237-we)", () => {
  it("reads each in the Workspace's word and shape; Deferred never reads Open", () => {
    const all: Record<AgendaStatus, [string, string]> = {
      open: ["Open", "idle"],
      in_progress: ["In progress", "live"],
      deferred: ["Deferred", "idle"],
      solved: ["Solved", "done"],
      dropped: ["Dropped", "revoked"],
    };
    for (const [state, [word, shape]] of Object.entries(all)) {
      expect(agendaStatus(state as AgendaStatus)).toEqual({ word, shape });
    }
    const html = renderToStaticMarkup(
      createElement(AgendaPart, {
        state: { kind: "filed", item: item({ state: "deferred", sync: null }) },
      }),
    );
    expect(html).toContain('<span class="status status-idle">Deferred</span>');
    expect(html).not.toContain(">Open<");
  });
});

describe("the page's state (filed, else waiting, else not offered, else the add)", () => {
  const notOffered = canAdd({ project_id: null });
  const offered = { offered: true as const, project: "platform" };

  it("puts an item before the offer, and a filed item before a waiting one", () => {
    expect(agendaPageState(notOffered, item({ sync: null })).kind).toBe(
      "filed",
    );
    expect(agendaPageState(offered, item({ sync: null })).kind).toBe("filed");
    expect(agendaPageState(notOffered, item()).kind).toBe("waiting");
    expect(agendaPageState(offered, item()).kind).toBe("waiting");
    expect(agendaPageState(notOffered, null)).toEqual({
      kind: "not-offered",
      reason: "no-project",
      text: NO_PROJECT,
    });
    expect(agendaPageState(offered, null)).toEqual({
      kind: "offered",
      project: "platform",
    });
  });
});

describe("the page today: no add, the Agenda part says why (F341)", () => {
  it("reads a project's record as no workspace linked, a project-less one as no project", async () => {
    expect(AGENDA.noWorkspace("platform")).toBe(NO_WORKSPACE);
    expect(AGENDA.noProject).toBe(NO_PROJECT);
    const withProject = await page({ project_id: PROJECT });
    expect(withProject).toContain(`<p class="block-text">${NO_WORKSPACE}</p>`);
    expect(withProject).not.toContain(NO_PROJECT);
    const without = await page({ project_id: null });
    expect(without).toContain(`<p class="block-text">${NO_PROJECT}</p>`);
    expect(without).not.toContain("has no workspace linked");
  });

  it("renders no add button and no confirm for any record", async () => {
    for (const html of [
      await page({ project_id: PROJECT }),
      await page({ project_id: null }),
    ]) {
      expect(html).not.toContain(ADD.action);
      expect(html).not.toContain("<dialog");
      expect(html).not.toContain('class="fi-send"');
    }
  });
});

describe("the add's phases (F143)", () => {
  it("does nothing on Cancel or Escape while adding; Cancel otherwise closes", () => {
    expect(isLocked("adding")).toBe(true);
    expect(cancel("adding")).toBe("adding");
    expect(isLocked("confirm")).toBe(false);
    expect(cancel("confirm")).toBe("rest");
    expect(cancel("failed")).toBe("rest");
  });

  it("asks, adds, and answers added or failed; a failure can be sent again", () => {
    expect(ask("rest")).toBe("confirm");
    expect(send("confirm")).toBe("adding");
    expect(answer("adding", true)).toBe("added");
    expect(answer("adding", false)).toBe("failed");
    expect(send("failed")).toBe("adding");
    expect(send("adding")).toBe("adding");
  });

  it("returns focus to the button on Cancel, and to the status after an add", () => {
    const button = { name: "button" };
    const status = { name: "status" };
    expect(focusBack(null, button)).toBe(button);
    expect(focusBack(status, null)).toBe(status);
    // the status took the button's place: it wins whenever it stands
    expect(focusBack(status, button)).toBe(status);
  });
});

describe("the add's markup, every state by props", () => {
  it("at rest: the page's one primary, no confirm", () => {
    const html = headEnd("rest");
    expect(html).toBe(
      '<div class="fi-send"><button type="button" class="btn btn-primary">Add to agenda</button></div>',
    );
  });

  it("asking: the confirm's title, text, Cancel then Add to agenda", () => {
    const html = headEnd("confirm");
    expect(html).toContain(
      '<dialog class="dlg" aria-label="Add this feedback to platform’s agenda?"><div class="dlg-body"><h2>Add this feedback to platform’s agenda?</h2><p>It becomes the first open item there, with this message and a link back to it. You cannot undo this from here.</p><div class="dlg-actions"><button type="button" class="btn">Cancel</button><button type="button" class="btn btn-primary"><span class="swap"><span>Add to agenda</span><span>Adding…</span></span></button></div></div></dialog>',
    );
    expect(html).not.toContain('role="alert"');
  });

  it("adding: Cancel disabled, the primary busy with Adding… in its swap", () => {
    const html = headEnd("adding");
    expect(html).toContain(
      '<button disabled="" type="button" class="btn">Cancel</button>',
    );
    expect(html).toContain(
      '<button type="button" class="btn btn-primary" data-busy="true" aria-busy="true"><span class="swap"><span>Add to agenda</span><span>Adding…</span></span></button>',
    );
  });

  it("failed: the notice with role=alert between the title and the sentence", () => {
    const html = headEnd("failed");
    expect(html).toContain(
      '</h2><p role="alert" class="notice notice-danger">Could not add this feedback to the agenda. Try again.</p><p>It becomes',
    );
  });

  it("added: the head reads Added to agenda, a status that can take focus; the Agenda part shows the item waiting", () => {
    const html = headEnd("added", item());
    expect(html).toContain(
      '<div class="fi-send"><p class="cluster baseline" role="status" tabindex="-1"><span class="strong">Added to agenda</span></p></div>',
    );
    expect(html).not.toContain("<button");
    expect(html).toContain(
      '<li class="row fi-item"><span class="dim">A13-n1</span><span class="fi-item-title"><a class="link-strong fi-item-open" href="/agenda/A13-n1">On my phone the top bar runs off the screen.</a><span class="badge is-waiting is-ink">Waiting for sync</span></span><span class="status status-idle">Open</span></li>',
    );
    expect(html).toContain(
      '<div class="panel-body has-rule"><p class="meta">The workspace takes this change at its next sync.</p></div>',
    );
  });

  it("filed: no waiting mark and no sync sentence; a Korean title is marked", () => {
    const html = renderToStaticMarkup(
      createElement(AgendaPart, {
        state: {
          kind: "filed",
          item: item({ sync: null, title: "결제가 안 돼요", lang: "ko" }),
        },
      }),
    );
    expect(html).toContain('lang="ko"');
    expect(html).not.toContain("Waiting for sync");
    expect(html).not.toContain(AGENDA.sync);
  });
});
