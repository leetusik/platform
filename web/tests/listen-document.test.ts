import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Listen on a loose document (P64-3y.S6; job 07 round 01: `## Build` › Listen, frame.md F206, F207, F234 FG8;
// `Listen.dc.html`'s document presets): both addresses read the document's Listen state once, for a member on
// the newest version of a Markdown or native document, and hand the seed to the Library's reader, which mounts
// AudioHead in ReaderHead's slot, the dock's track (16 px from the foot: a document has no foot bar) and the
// player. An older version and the html original get none.

const actions = vi.hoisted(() => ({
  saveReaderPosition: vi.fn(async () => ({ ok: true })),
  saveQuizAttempt: vi.fn(async () => ({ ok: true })),
  saveAnnotation: vi.fn(async () => ({ ok: true })),
  editAnnotation: vi.fn(async () => ({ ok: true })),
  removeAnnotation: vi.fn(async () => ({ ok: true })),
  saveBookmark: vi.fn(async () => ({ ok: true })),
  editBookmark: vi.fn(async () => ({ ok: true })),
  removeBookmark: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/reader/actions", () => actions);

const up = vi.hoisted(() => ({
  identity: null as { token: string } | null,
  load: null as unknown,
  getListenState: vi.fn(),
  getDocument: vi.fn(),
  resolveDocument: vi.fn(),
  loadLooseReader: vi.fn(),
}));
vi.mock("@/lib/auth-guards", () => ({
  optionalIdentity: async () => up.identity,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/hi2vi/shell/data", () => ({ requestNonce: async () => "n0" }));
vi.mock("@/lib/knowledge/app", async (orig) => ({
  ...(await orig<object>()),
  getDocument: up.getDocument,
  resolveDocument: up.resolveDocument,
}));
vi.mock("@/lib/knowledge/listen", async (orig) => ({
  ...(await orig<object>()),
  getListenState: up.getListenState,
}));
vi.mock("@/lib/reader/load", async (orig) => ({
  ...(await orig<object>()),
  loadLooseReader: up.loadLooseReader,
}));

import {
  documentListen,
  renderDocument,
} from "@/components/reader/document-page";
import { DocumentReader } from "@/hi2vi/reader/document";
import { headOf, holdOf } from "@/hi2vi/listen";
import type { KbListenState } from "@/lib/knowledge/listen";
import type { KbDocument } from "@/lib/knowledge/types";
import { noteKey, type ListenKey } from "@/lib/listen/machine";
import type { Listen, ListenSeed } from "@/lib/listen/types";
import { dockView, noteView, playerView } from "@/lib/listen/view";
import { validateChapter } from "@/lib/native";
import type { LoadedReader, ReaderLoad } from "@/lib/reader/load";
import type { ReaderView } from "@/lib/reader/types";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
} as unknown as AppRouterInstance;
const inApp = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: router }, el),
  );

const KEY = {
  org: "june",
  project: "platform",
  doc: "2026-11-02-how-a-phase-becomes-slices",
};
const PRETTY = "/@june/platform/how-a-phase-becomes-slices";

function view(over: Partial<ReaderView> = {}): ReaderView {
  return {
    kind: "loose",
    member: true,
    title: "How a phase becomes slices",
    lang: "en",
    langs: [],
    version: 3,
    newest: 3,
    summary:
      "A phase states a goal. This document follows one phase from that sentence to the list of slices an executor can run.",
    date: "2026-11-02",
    project: "platform",
    staleSource: null,
    target: { kind: "document", id: 41, canonicalPath: PRETTY },
    write: { ...KEY },
    progress: {
      state: "unopened",
      finishedVersion: null,
      maxFraction: 0,
      resume: null,
    },
    versions: { ok: true, label: "English", rows: [] },
    book: null,
    headings: [
      { id: "the-goal", level: 2, text: "The goal, in one sentence" },
      { id: "cutting", level: 2, text: "Cutting it into slices" },
    ],
    settings: { size: 3, theme: "system" },
    ...over,
  };
}

const TEXT = {
  md: "# How a phase becomes slices\n\n## The goal, in one sentence\n\nA phase states a goal, and the decomposition reads it before anything else is planned.\n\n## Cutting it into slices\n\n각 슬라이스는 하나의 일을 합니다. Each slice does one job and names the files it touches.\n",
  native:
    "---\nformat: native\nsyntax: 1\ntitle: How a phase becomes slices\n---\n\n## The goal, in one sentence {#the-goal}\n\nA phase states a goal, and the decomposition reads it before anything else is planned.\n",
};

function loaded(format: "md" | "native", v: ReaderView): LoadedReader {
  return {
    view: v,
    checked: validateChapter(TEXT[format], format),
    docId: 41,
    assets: null,
    resolveRef: () => null,
    quiz: {},
    notes: null,
  };
}

const STATE = {
  state: "made",
  len: 860,
  entries: [],
  position: null,
  resume: null,
  listen: { lang: "en" },
} as unknown as KbListenState;

const legacyLoad = (): ReaderLoad =>
  ({
    kind: "legacy",
    legacy: {
      docId: 41,
      view: {
        version: 3,
        newest: 3,
        title: "Capture queue: design notes",
        write: { ...KEY },
      },
      frame: { src: "/x" },
      marks: [],
      orgName: null,
    },
  }) as unknown as ReaderLoad;

const seed = (): ListenSeed => ({
  key: { ...KEY },
  title: "How a phase becomes slices",
  lang: "en",
  state: STATE,
  href: PRETTY,
  book: null,
  chapter: null,
});

beforeEach(() => {
  up.getListenState.mockReset();
  up.getListenState.mockResolvedValue(STATE);
  up.loadLooseReader.mockReset();
  up.getDocument.mockReset();
  up.resolveDocument.mockReset();
  up.identity = null;
});

// ---- the page's one read --------------------------------------------------------------------------------

describe("the document's Listen seed (one read, a member on the newest version)", () => {
  it("a member's Markdown or native document reads its state once by the write key and seeds it", async () => {
    for (const f of ["md", "native"] as const) {
      up.getListenState.mockClear();
      const s = await documentListen(
        { kind: "reader", reader: loaded(f, view()) },
        "tok",
      );
      expect(up.getListenState).toHaveBeenCalledTimes(1);
      expect(up.getListenState).toHaveBeenCalledWith("tok", KEY);
      expect(s).toMatchObject({
        key: KEY,
        title: "How a phase becomes slices",
        href: PRETTY,
        book: null,
        chapter: null,
      });
    }
  });

  it("an older version, a visitor, a member with no write key and the html original read nothing", async () => {
    const none = [
      documentListen(
        {
          kind: "reader",
          reader: loaded("md", view({ version: 2, newest: 3 })),
        },
        "tok",
      ),
      documentListen(
        { kind: "reader", reader: loaded("md", view()) },
        undefined,
      ),
      documentListen(
        { kind: "reader", reader: loaded("md", view({ write: null })) },
        "tok",
      ),
      documentListen(legacyLoad(), "tok"),
    ];
    for (const s of await Promise.all(none)) expect(s).toBeNull();
    expect(up.getListenState).not.toHaveBeenCalled();
  });

  it("a document the server cannot read aloud as a whole (unavailable) or a failed read has no Listen", async () => {
    up.getListenState.mockResolvedValueOnce({ ...STATE, state: "unavailable" });
    expect(
      await documentListen(
        { kind: "reader", reader: loaded("md", view()) },
        "tok",
      ),
    ).toBeNull();
    up.getListenState.mockRejectedValueOnce(new Error("down"));
    expect(
      await documentListen(
        { kind: "reader", reader: loaded("md", view()) },
        "tok",
      ),
    ).toBeNull();
  });
});

// ---- both addresses render through renderDocument with the seed ------------------------------------------

const kbDoc = (): KbDocument =>
  ({
    id: 41,
    project: "platform",
    rel_path: "2026-11-02-how-a-phase-becomes-slices.md",
    title: "How a phase becomes slices",
    date: "2026-11-02",
    version: 3,
    format: "native",
    markdown: TEXT.md,
    canonical_path: PRETTY,
  }) as KbDocument;

type Page = (p: {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string>>;
}) => Promise<unknown>;

async function pages(): Promise<[string, Page, Record<string, string>][]> {
  const byId = (await import("@/app/(public)/documents/[id]/page"))
    .default as unknown as Page;
  const pretty = (await import("@/app/(public)/[org]/[project]/[slug]/page"))
    .default as unknown as Page;
  return [
    ["/documents/<id>", byId, { id: "41" }],
    [
      "/@org/project/slug",
      pretty,
      { org: "@june", project: "platform", slug: "how-a-phase-becomes-slices" },
    ],
  ];
}

describe("both addresses hand the seed to the reader (and none to the html original)", () => {
  it("a member on the newest version: one Listen read, the reader gets the seed", async () => {
    up.identity = { token: "tok" };
    up.getDocument.mockResolvedValue(kbDoc());
    up.resolveDocument.mockResolvedValue(kbDoc());
    for (const [where, Page, params] of await pages()) {
      up.getListenState.mockClear();
      up.loadLooseReader.mockResolvedValue({
        kind: "reader",
        reader: loaded("native", view()),
      });
      const el = await Page({
        params: Promise.resolve(params),
        searchParams: Promise.resolve({}),
      });
      if (!isValidElement<{ listen?: ListenSeed | null }>(el))
        throw new Error(`no element at ${where}`);
      expect(el.type, where).toBe(DocumentReader);
      expect(up.getListenState, where).toHaveBeenCalledTimes(1);
      expect(el.props.listen?.key, where).toEqual(KEY);
    }
  });

  it("an older version and the html original: no read, no seed", async () => {
    up.identity = { token: "tok" };
    up.getDocument.mockResolvedValue(kbDoc());
    up.resolveDocument.mockResolvedValue(kbDoc());
    for (const [where, Page, params] of await pages()) {
      for (const load of [
        {
          kind: "reader",
          reader: loaded("native", view({ version: 2, newest: 3 })),
        },
        legacyLoad(),
      ]) {
        up.getListenState.mockClear();
        up.loadLooseReader.mockResolvedValue(load);
        const el = await Page({
          params: Promise.resolve(params),
          searchParams: Promise.resolve({ v: "2" }),
        });
        if (!isValidElement<{ listen?: ListenSeed | null }>(el))
          throw new Error(`no element at ${where}`);
        expect(up.getListenState, where).not.toHaveBeenCalled();
        expect(el.props.listen ?? null, where).toBeNull();
      }
    }
  });

  it("renderDocument gives the html original no Listen whatever it is handed", () => {
    const el = renderDocument(legacyLoad(), {
      from: null,
      org: "june",
      listen: seed(),
    });
    if (!isValidElement<Record<string, unknown>>(el)) throw new Error("no el");
    expect("listen" in el.props).toBe(false);
  });
});

// ---- the reader's head, track and player ---------------------------------------------------------------

describe("the document's reader mounts AudioHead in ReaderHead's slot", () => {
  const html = (v: ReaderView, listen: ListenSeed | null) =>
    inApp(
      createElement(
        DocumentReader,
        { view: v, marks: "none", listen },
        createElement("p", null, "the text"),
      ),
    );

  it("a member on the newest version: the slot under the head's facts, before the text, holding Listen · its length", () => {
    const out = html(view(), seed());
    const slot = out.indexOf('class="listen-slot"');
    expect(slot).toBeGreaterThan(out.indexOf("Document in platform"));
    expect(slot).toBeLessThan(out.indexOf('class="read-flow"'));
    expect(out.match(/class="listen-slot"/g)).toHaveLength(1);
    expect(out).toContain(">Listen<");
    expect(out).toContain("14 min");
    // the document's three tallest notes are not held at rest (no press, no Listen)
    expect(out).not.toContain("You’re offline, so playback stopped");
  });

  it("an older version and a visitor: no slot", () => {
    expect(html(view({ version: 2, newest: 3 }), seed())).not.toContain(
      "listen-slot",
    );
    expect(
      html(view({ member: false, write: null, progress: null }), seed()),
    ).not.toContain("listen-slot");
    expect(html(view(), null)).not.toContain("listen-slot");
  });
});

// ---- the 11 document presets (Listen.dc.html), through the head, the dock and the player ------------------

function docListen(state: ListenKey, more: Partial<Listen> = {}): Listen {
  return {
    unit: `${KEY.org}/${KEY.project}/${KEY.doc}`,
    key: { ...KEY },
    kind: "doc",
    title: "How a phase becomes slices",
    titleLang: "en",
    lang: "en",
    href: PRETTY,
    book: null,
    from: null,
    ch: null,
    chPos: 0,
    chLen: null,
    chSoFar: false,
    making: null,
    entries: [],
    spans: [],
    state,
    back: null,
    old: false,
    updating: false,
    soFar: false,
    len: 860,
    pos: 125,
    part: null,
    parts: 4,
    partsMade: 4,
    left: null,
    seen: null,
    loaded: 0,
    stoppedAt: null,
    speed: 1,
    follow: true,
    play: null,
    segs: [],
    seg: -1,
    ...more,
  };
}

// [preset, engine state, more, note key, word, dock lead, head's own button]
const PRESETS: [
  string,
  ListenKey,
  Partial<Listen>,
  string,
  string,
  string,
  boolean,
][] = [
  ["Document, playing", "playing", {}, "playing", "Playing", "pause", false],
  [
    "Waiting for the Mac",
    "waiting",
    { pos: 0, len: null, partsMade: 0 },
    "waiting",
    "Waiting",
    "play-off",
    false,
  ],
  [
    "Preparing, first part",
    "making",
    { pos: 0, len: null, partsMade: 0, part: { n: 1, of: 4 } },
    "making",
    "Preparing…",
    "play-off",
    false,
  ],
  [
    "Ready, the rest preparing",
    "ready",
    { pos: 0, len: 215, soFar: true, partsMade: 1 },
    "ready",
    "Ready",
    "play",
    false,
  ],
  ["One more tap, a phone", "tap", { pos: 0 }, "tap", "Ready", "play", false],
  [
    "Offline, before starting",
    "offline-start",
    { pos: 0 },
    "offline-start",
    "Offline",
    "play-off",
    false,
  ],
  [
    "Offline, playing",
    "offline-play",
    { pos: 365 },
    "offline-play",
    "Offline",
    "pause",
    false,
  ],
  [
    "Offline, stopped",
    "offline-stopped",
    { pos: 365 },
    "offline-stopped",
    "Offline",
    "play",
    false,
  ],
  [
    "Earlier version of the audio",
    "playing",
    { old: true, pos: 190 },
    "outdated",
    "Earlier version",
    "pause",
    true,
  ],
  [
    "Can’t be read aloud",
    "fail-unreadable",
    { pos: 0, len: null },
    "fail-unreadable",
    "Can’t be read aloud",
    "retry",
    false,
  ],
];

describe("a document's Listen states map to the record's document presets", () => {
  for (const [label, state, more, key, word, lead, act] of PRESETS) {
    it(label, () => {
      const l = docListen(state, more);
      const head = headOf({
        listen: l,
        seed: seed(),
        kept: null,
        starting: false,
      });
      expect(head.show).toBe("note");
      expect(head.note?.key).toBe(key);
      expect(noteKey(l.state, l.old)).toBe(key);
      expect(head.note?.view.word).toBe(word);
      expect(head.act).toBe(act);
      // the document's three tallest notes (F206): preparing stopped, the daily limit, offline stopped
      expect(head.hold.map((h) => h.key)).toEqual([
        "fail-voice",
        "fail-limit",
        "offline-stopped",
      ]);
      expect(dockView(l).act).toBe(lead);
    });
  }

  it("Document and Continue listening: the control, no note, nothing held", () => {
    const rest = headOf({
      listen: null,
      seed: seed(),
      kept: null,
      starting: false,
    });
    expect(rest.show).toBe("control");
    expect(rest.control).toMatchObject({ form: "listen", q: "14 min" });
    expect(rest.hold).toEqual([]);
    const kept = headOf({
      listen: null,
      seed: seed(),
      kept: {
        unit: `${KEY.org}/${KEY.project}/${KEY.doc}`,
        ch: null,
        pos: 125,
        len: 860,
        lang: "en",
      } as never,
      starting: false,
    });
    expect(kept.control.form).toBe("resume");
    expect(kept.control.q).toBe("2:05");
  });

  it("the earlier version's note carries Update audio; can't be read aloud carries its reference and no button", () => {
    const old = noteView(docListen("playing", { old: true }), "outdated");
    expect(old.action).toBe("update");
    const bad = noteView(docListen("fail-unreadable"), "fail-unreadable");
    expect(bad.ref).toBe("Error · 422");
    expect(bad.text).toBe(
      "Something on our side couldn’t read this document aloud.",
    );
  });

  it("holds the document's notes whoever plays (a chapter's third is the next chapter's)", () => {
    expect(holdOf(docListen("playing"), false).map((h) => h.key)[2]).toBe(
      "offline-stopped",
    );
    expect(holdOf(docListen("playing"), true).map((h) => h.key)[2]).toBe(
      "next-waiting",
    );
  });
});

describe("the document's player: no Previous/Next and no Chapters; its meta line is the head's", () => {
  it("Document in platform, no book, no neighbours, no rows", () => {
    const p = playerView(docListen("playing"), {
      docWhere: "Document in platform",
    });
    expect(p.meta).toBe("Document in platform");
    expect(p.isBook).toBe(false);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
    expect(p.rows).toEqual([]);
  });
});
