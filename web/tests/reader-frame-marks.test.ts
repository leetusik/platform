import { createElement, createRef, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mark as finished and Mark as unread (P63-fk.S8; frame.md F64: `{ state: 'finished', v }` and
// `{ state: 'none' }`) write through the product's own action with the payloads it always sent: the
// new frame's end calls `useReading`'s `mark`, unchanged, and `mark` calls `saveReaderPosition`.
// A guard of existing behaviour: it holds the payloads as they are.

const save = vi.hoisted(() =>
  vi.fn(async (_input: Record<string, unknown>) => ({ ok: true })),
);
vi.mock("@/lib/reader/actions", () => ({ saveReaderPosition: save }));

import { useReading } from "@/components/reader/use-reading";
import type { ReaderView } from "@/lib/reader/types";

function view(version: number, newest: number): ReaderView {
  return {
    kind: "chapter",
    member: true,
    title: "t",
    lang: "en",
    langs: [{ lang: "en", label: "English" }],
    version,
    newest,
    summary: null,
    date: "2026-11-02",
    project: "platform",
    staleSource: null,
    target: {
      kind: "chapter",
      org: "june",
      project: "platform",
      book: "handbook",
      chapter: "c6",
    },
    write: { org: "june", project: "platform", doc: "2026-11-02-c6" },
    progress: {
      state: "started",
      finishedVersion: null,
      maxFraction: 0.3,
      resume: null,
    },
    versions: null,
    book: null,
    headings: [],
    settings: { size: 3, theme: "system" },
  };
}

/** `useReading`'s `mark`, as the frame gets it (rendered once; the effects never run on the server). */
function markOf(v: ReaderView): (finished: boolean) => Promise<void> {
  let mark: ((finished: boolean) => Promise<void>) | null = null;
  function Probe() {
    const rd = useReading({
      view: v,
      ready: true,
      rootRef: createRef<HTMLDivElement>() as RefObject<HTMLDivElement | null>,
      topRef: createRef<HTMLElement>() as RefObject<HTMLElement | null>,
      quiet: () => {},
    });
    mark = rd.mark;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return mark!;
}

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  save.mockClear();
});
afterEach(() => {
  delete g.document;
  delete g.window;
});

/** The page at half its scroll: what `mark` samples. */
function pageAtHalf() {
  g.document = { documentElement: { scrollHeight: 3000 } };
  g.window = { innerHeight: 1000, scrollY: 1000 };
}

describe("Mark as finished and Mark as unread (F64) write what they always wrote", () => {
  it("Mark as finished: finished, on the version read, at the reader's place", async () => {
    const mark = markOf(view(3, 3));
    pageAtHalf();
    await mark(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      org: "june",
      project: "platform",
      doc: "2026-11-02-c6",
      anchor_id: null,
      fraction: 0.5,
      max_fraction: 0.5,
      finished: true,
      version: 3,
    });
  });

  it("Mark as finished on an older version writes that version", async () => {
    const mark = markOf(view(2, 3));
    pageAtHalf();
    await mark(true);
    expect(save.mock.calls[0][0]).toMatchObject({ finished: true, version: 2 });
  });

  it("Mark as unread: unread, the place reset, on the version read", async () => {
    const mark = markOf(view(3, 3));
    pageAtHalf();
    await mark(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      org: "june",
      project: "platform",
      doc: "2026-11-02-c6",
      version: 3,
      anchor_id: null,
      fraction: 0,
      unread: true,
    });
  });

  it("writes nothing for a reader with nowhere to save", async () => {
    const mark = markOf({ ...view(3, 3), write: null });
    pageAtHalf();
    await mark(true);
    await mark(false);
    expect(save).not.toHaveBeenCalled();
  });
});
