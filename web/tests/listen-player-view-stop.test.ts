import { afterEach, describe, expect, it, vi } from "vitest";

// Stop listening in the opened player writes the kept place through the existing `PUT /app/listen/position`
// payload (the engine's `where` plus `kept: true`, P41-sr.W2 F17), unchanged by the new player (decision 3).
// The server actions are replaced by a recorder; the engine is the real one, on a stand-in element.

const sent: unknown[] = [];
vi.mock("@/lib/listen/actions", () => ({
  listenSave: (input: unknown) => {
    sent.push(input);
    return Promise.resolve({ ok: true, status: 200 });
  },
  listenRead: () => new Promise(() => {}),
  listenStart: () => new Promise(() => {}),
  listenUpdate: () => new Promise(() => {}),
}));

const { createEngine } = await import("@/lib/listen/engine");
const { pressPlayer } = await import("@/hi2vi/listen");
const { getKept, getListen, setEngine, setKept, setListen } =
  await import("@/lib/listen/store");

/** An `<audio>` that never sounds: the events, an empty source, Chromium's "maybe" for HLS. */
function element(): HTMLAudioElement {
  const el = new EventTarget() as EventTarget & Record<string, unknown>;
  Object.assign(el, {
    currentTime: 0,
    paused: true,
    ended: false,
    canPlayType: () => "maybe",
    getAttribute: () => null,
    removeAttribute: () => {},
    pause: () => {},
    load: () => {},
  });
  return el as unknown as HTMLAudioElement;
}

const g = globalThis as Record<string, unknown>;
const hadWindow = "window" in g;
const hadDocument = "document" in g;

afterEach(() => {
  setEngine(null);
  setListen(null);
  setKept(null);
  sent.length = 0;
  if (!hadWindow) delete g.window;
  if (!hadDocument) delete g.document;
});

describe("Stop listening's write (the existing position payload)", () => {
  it("saves the chapter heard, the seconds into it, speed, follow along and kept", async () => {
    if (!hadWindow) g.window = new EventTarget();
    if (!hadDocument)
      g.document = Object.assign(new EventTarget(), {
        visibilityState: "visible",
      });
    const engine = createEngine(element());
    setEngine(engine);
    const listen = {
      unit: "june/platform/books/platform-handbook",
      key: {
        org: "june",
        project: "platform",
        book: "platform-handbook",
        from_chapter: "c5",
      },
      kind: "book",
      title: "Capture: from a widget to a message",
      titleLang: "en",
      lang: "en",
      href: "/@june/platform/books/platform-handbook",
      book: {
        title: "The platform handbook",
        href: "/@june/platform/books/platform-handbook",
        chapters: [
          {
            key: "c5",
            n: 5,
            title: "The search index",
            lang: "en",
            href: "/5",
          },
          {
            key: "c6",
            n: 6,
            title: "Capture: from a widget to a message",
            lang: "en",
            href: "/6",
          },
        ],
      },
      from: "c5",
      ch: "c6",
      chPos: 750,
      chLen: 930,
      chSoFar: false,
      making: null,
      entries: [
        { chapter: "c5", state: "made", len: 515, part: null, left: null },
        { chapter: "c6", state: "made", len: 930, part: null, left: null },
      ],
      spans: [
        {
          chapter: "c5",
          start: 0,
          len: 515,
          complete: true,
          title: "The search index",
          lang: "en",
        },
        {
          chapter: "c6",
          start: 515,
          len: 930,
          complete: true,
          title: "Capture: from a widget to a message",
          lang: "en",
        },
      ],
      state: "paused",
      back: null,
      old: false,
      updating: false,
      soFar: false,
      len: 1445,
      pos: 1265,
      part: null,
      parts: 0,
      partsMade: 0,
      left: null,
      seen: null,
      loaded: 0,
      stoppedAt: null,
      speed: 1.25,
      follow: false,
      play: null,
      segs: [],
      seg: -1,
    } as Parameters<typeof setListen>[0];
    setListen(listen);
    pressPlayer(listen!, { t: "stop" }, () => {});
    expect(sent).toEqual([
      {
        org: "june",
        project: "platform",
        book: "platform-handbook",
        from_chapter: "c5",
        chapter: "c6",
        seconds: 750,
        speed: 1.25,
        follow: false,
        kept: true,
      },
    ]);
    expect(getListen()).toBeNull();
    expect(getKept()).toMatchObject({ ch: "c6", n: 6, pos: 750 });
    engine.destroy();
  });
});
