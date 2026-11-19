"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { READER } from "@/content";
import { MARK_ROW } from "@/content/library-frame";
import { READER_MARKS } from "@/content/reader-marks";
import type { Mark } from "@/hi2vi/library";
import {
  barKind,
  besideNote,
  blockWord as libBlockWord,
  boxAria,
  boxTitle,
  cardOf,
  deleteWord,
  floatAt,
  goesLine,
  languageName,
  LIBRARY_PAINT,
  madeOn,
  notesCount,
  pickQuote,
  placeUp as libPlaceUp,
  pressFor,
  railFits,
  railTops as stackRail,
  reviewLine as libReviewLine,
  rowOf,
  type BesideNote,
  type BoxKind,
  type Send,
} from "@/hi2vi/reader/marks/model";
import {
  BesideButton,
  MarkBox,
  MarksBar,
  MarksFloat,
  NotesBody,
  PlaceBar as LibraryPlaceBar,
  SheetCount,
  SlotLine,
  SlotSave,
  type BoxList,
  type BoxPick,
  type MarkBoxProps,
  type SheetRow,
} from "@/hi2vi/reader/marks/parts";
import { undoClock } from "@/hi2vi/reader/marks/undo";
import {
  bookmarkWire,
  cleanLabel,
  highlightWire,
  labelWire,
  noteWire,
  removeBookmarkWire,
  removeWire,
  reviewWire,
  sectionNoteWire,
  snapshotOf as snapshotFor,
  type Wire,
} from "@/hi2vi/reader/marks/wire";
import { readerHref, type ReaderTarget } from "@/lib/reader-href";
import {
  editAnnotation,
  editBookmark,
  removeAnnotation,
  removeBookmark,
  saveAnnotation,
  saveBookmark,
  type AnnotationResult,
} from "@/lib/reader/actions";
import {
  capture,
  cps,
  segments,
  units,
  verified,
  type ANode,
  type Captured,
} from "@/lib/reader/anchor";
import { progressPercent, TAP_IGNORE } from "@/lib/reader/chrome";
import {
  buildGroups,
  marksWord,
  positionNear,
  shownQuote,
  snippetOf,
  type ListItem,
  type QuoteAtom,
  type SectionIndex,
} from "@/lib/reader/note-list";
import {
  cleanNote,
  clip,
  countLine,
  deleteLine,
  langOf,
  newId,
  NOTE_MAX,
  reviewLine,
  UNDO_MS,
  undoText,
} from "@/lib/reader/notes";
import {
  EMPTY_PAINT,
  paint,
  unpaint,
  type Painted,
  type PaintRange,
} from "@/lib/reader/paint";
import type {
  CardStatus,
  NoteSection,
  ReaderBookmark,
  ReaderNote,
  ReaderNotes,
  ReaderOtherNote,
  ReaderWrite,
} from "@/lib/reader/types";

import {
  BookmarkButton,
  MarginItem,
  MarkerRow,
  PlaceBar,
  type MarkerLook,
} from "./annotation-parts";
import { NotesPanel } from "./notes-panel";
import { useNotesBridge } from "./reader-notes";
import { useReaderProgress } from "./reader-progress";
import { SignInToSave } from "./sign-in-to-save";

/**
 * P30.S20 — highlights and notes in a native chapter (`05-annotations` round 01, with round
 * 02 §1's keyboard stop): the paint, the selection flow by mouse, touch and keyboard, the
 * selection bar, the popover (a highlight, its note, Review this, a section's note, the
 * chooser where highlights overlap), the undo line, and the 2,000-character note.
 *
 * The chapter is server-rendered (S12's pipeline); this island reads its selections and
 * paints over it. The captured anchor is the shared projection's (`lib/reader/anchor.ts`),
 * and every write goes through a server action to S8's routes with a client id, so a write
 * sent again is a no-op. Writes are optimistic and run one at a time, in order:
 *
 *  - a write that does not reach the server is tried again, then "Not saved · check your
 *    connection" with Try again holds it (nothing is dropped while the page is open);
 *  - a gone session raises Sign in to save in the bottom slot;
 *  - deleting waits out the undo line (10 seconds) before it is sent, so Undo puts back the
 *    highlight with its note and its review card's history (a delayed delete, P30.S20).
 *
 * P30.S21 adds, on the same layer (it owns every mark, so each surface shows one truth):
 *
 *  - bookmarks: a section's (the place bar, the selection bar on a heading or a typed
 *    block) and a plain document's position, each with an optional label; removing one
 *    waits out the same undo line;
 *  - the margin (from 64rem) and the rows under a heading or typed block (below it) for a
 *    section's note, Text changed, the other languages and a bookmark, and the "Bookmarked"
 *    tag in the heading's top margin;
 *  - the place bar in the bottom slot, riding with the chrome;
 *  - the Notes view of the Contents sheet, mounted by the frame's bridge, with the
 *    Unanchored group and the other languages' group (nothing is ever dropped);
 *  - the popovers for Text changed, the other language and a bookmark;
 *  - landing on a mark from a list (`?note=` from the book's list, a row in the sheet).
 */

const T = READER.notes;

type Item = ReaderNote & {
  /** Review this was on at some point (its card exists, active or paused). */
  everOn: boolean;
  /** Deleted, waiting out the undo line. */
  gone?: boolean;
};
type OtherItem = ReaderOtherNote & { gone?: boolean };
type Bk = ReaderBookmark & { gone?: boolean };

/**
 * P39-hk.F4 (OQ10) — each section's inline formulas as the page holds them: an atom
 * (`math.ra-m`, `data-an-len` = its TeX's code points) in a container the self-check keeps,
 * at its offset in the section's text, with its linear text (`alttext`). Read from the
 * server markup; a chapter with no formula gives an empty map.
 */
function formulaAtoms(
  root: HTMLElement,
  sections: ReadonlyMap<string, readonly string[]>,
): Map<string, QuoteAtom[]> {
  const out = new Map<string, QuoteAtom[]>();
  if (!root.querySelector("math[data-an-len]")) return out;
  for (const seg of verified(segments(root as unknown as ANode), sections)) {
    for (const u of units(seg.el)) {
      const el = u.node as unknown as Element;
      if (u.kind !== "atom" || el.localName !== "math") continue;
      const alt = el.getAttribute("alttext");
      if (!alt) continue;
      const list = out.get(seg.sec) ?? [];
      list.push({ at: seg.base + u.at, len: u.len, alt });
      out.set(seg.sec, list);
    }
  }
  return out;
}

/** A selection in a plain Markdown document: nothing can be highlighted there. */
type NoneSel = { mode: "none" };
type Sel = (Captured | NoneSel) & { id: number; pointer: boolean };

type Pop =
  | { t: "hl"; id: string; edit: boolean }
  | { t: "new" }
  | { t: "bnote"; id: string; edit: boolean }
  | { t: "bnew"; sec: string }
  | { t: "choose"; ids: string[] }
  /** Text changed on a section. */
  | { t: "changed"; sec: string }
  /** Highlights made in another language, on a section. */
  | { t: "other"; sec: string; lang: string }
  | { t: "bm"; id: string; edit: boolean };

/** What a Sign in to save is asked for (`what`). */
type SaveWhat = "notes" | "bookmarks";

interface Toast {
  id: number;
  text: string;
  undo?: () => void;
  retry?: () => void;
}

// A write as data (`Wire`, `@/hi2vi/reader/marks/wire`, P63-fk.S11: the payloads are built there for both looks),
// so the ones a lapsed session stopped can outlive a sign-in.
const runWire = (w: Wire): Promise<AnnotationResult> => {
  switch (w.op) {
    case "save":
      return saveAnnotation(w.input);
    case "edit":
      return editAnnotation(w.input);
    case "remove":
      return removeAnnotation(w.input);
    case "bm-save":
      return saveBookmark(w.input);
    case "bm-edit":
      return editBookmark(w.input);
    case "bm-remove":
      return removeBookmark(w.input);
  }
};

/**
 * Writes the server refused with a 401 wait here (sessionStorage, this tab) until the
 * reader is signed in again; the layer that mounts next as a member sends them, in order.
 * Creates carry their client id, so a write the server already took is not doubled.
 */
const UNSAVED_KEY = "kb-reader-unsaved";

function stashUnsaved(wires: Wire[]) {
  try {
    const held = JSON.parse(
      sessionStorage.getItem(UNSAVED_KEY) ?? "[]",
    ) as Wire[];
    sessionStorage.setItem(UNSAVED_KEY, JSON.stringify([...held, ...wires]));
  } catch {
    // Storage off or full: the writes stay held in memory and on screen.
  }
}

function takeUnsaved(): Wire[] {
  try {
    const held = JSON.parse(
      sessionStorage.getItem(UNSAVED_KEY) ?? "[]",
    ) as Wire[];
    sessionStorage.removeItem(UNSAVED_KEY);
    return Array.isArray(held) ? held : [];
  } catch {
    return [];
  }
}

interface Job {
  wire: Wire;
  done?: (r: AnnotationResult) => void;
  /** Put the page back when the server refuses the write for good (404, 422). */
  undo?: () => void;
  /**
   * P63-fk.S11 (the Library's look only): the part that sent it says the write failed in its own place (a note's
   * `Could not save the note. Try again.`, a delete's failed line), so a write that does not go through (refused,
   * still failing after its tries, or a lapsed session) is dropped and this runs, instead of the old look's held
   * queue and "Not saved" line. The part sends it again when asked; a create keeps its client id, so a write the
   * server already took is not doubled.
   */
  fail?: () => void;
  tries: number;
}

interface Placed {
  sig: string;
  left: number;
  top: number;
  width: number | null;
  maxW: number;
}

const FOCUSABLE =
  'button, a[href], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])';

export interface AnnotationLayerProps {
  notes: ReaderNotes;
  /** Where a member's annotations are written; null = nowhere (the layer is not mounted then). */
  write: ReaderWrite | null;
  /** The version on screen. */
  version: number;
  lang: string;
  chapterTitle: string;
  place: "chapter" | "document";
  /** The chapter or document on screen, for the links to other languages and versions. */
  target: ReaderTarget;
  /**
   * P63-fk.S11: how the marks look. `old` (the default) is the old reader's, unchanged, for the document routes and
   * the legacy reader. `library` is the signed Library look (job 03, round 02, § Page: annotations), drawn by
   * `@/hi2vi/reader/marks`: the same marks, the same writes at the same moments, the same anchoring; only what the
   * reader sees and where it sits differ, and a note's save waits for its answer (`Saving…`, `Could not save`).
   */
  look?: "old" | "library";
}

const toItem = (n: ReaderNote): Item => ({ ...n, everOn: n.card !== "" });

/** Where the layer finds the page around it, by look: the old reader's classes, or the Library's frame. */
const PAGE = {
  old: {
    top: ".rd-top",
    end: ".rd-end",
    head: ".rd-head",
    title: ".rd-head__title",
    sheet: ".rd-sheet",
    own: ".an-layer, .an-rows, .an-rail",
  },
  library: {
    top: ".bar-wrap > .bar",
    end: "[data-end]",
    head: ".read-head",
    title: ".read-title",
    sheet: "dialog[open]",
    own: "[data-an-ui]",
  },
} as const;

export function AnnotationLayer({
  notes,
  write,
  version,
  lang,
  chapterTitle,
  place,
  target,
  look: lookName = "old",
}: AnnotationLayerProps) {
  const progress = useReaderProgress();
  const bridge = useNotesBridge();
  const member = !!progress?.member;
  const signInHref = progress?.signInHref ?? "/login";
  const plain = notes.plain;
  const lib = lookName === "library";
  const PG = PAGE[lookName];

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const desc = useMemo(
    () => ({ one: `${uid}-d-hl`, note: `${uid}-d-note`, many: `${uid}-d-2` }),
    [uid],
  );
  const sections = useMemo(
    () => new Map(notes.sections.map((s) => [s.id, cps(s.text)])),
    [notes.sections],
  );
  const meta = useMemo(
    () => new Map(notes.sections.map((s) => [s.id, s])),
    [notes.sections],
  );

  const [items, setItems] = useState<Item[]>(() => notes.items.map(toItem));
  const [orph, setOrph] = useState<Item[]>(() => notes.unanchored.map(toItem));
  const [others, setOthers] = useState<OtherItem[]>(() => notes.other);
  const [bms, setBms] = useState<Bk[]>(() => notes.bookmarks);
  const [obms, setObms] = useState<Bk[]>(() => notes.otherBookmarks);
  const [sel, setSel] = useState<Sel | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [save, setSave] = useState(false);
  const [saveWhat, setSaveWhat] = useState<SaveWhat>("notes");
  const [slotSave, setSlotSave] = useState<false | SaveWhat>(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [draft, setDraft] = useState("");
  const [placed, setPlaced] = useState<Placed | null>(null);
  /** A highlight reached from a list: shown open (the accent underline) with no popover. */
  const [landed, setLanded] = useState<string | null>(null);
  /** The Notes list's inline label editor. */
  const [editLabel, setEditLabel] = useState<string | null>(null);
  /** The section being read (the place bar), and how far through the text the reader is. */
  const [blk, setBlk] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [endSeen, setEndSeen] = useState(false);
  const [codeIds, setCodeIds] = useState<ReadonlySet<string>>(new Set());
  /** P39-hk.F4: the page's inline formulas, by section (empty until read; empty without math). */
  const [atoms, setAtoms] = useState<ReadonlyMap<string, QuoteAtom[]>>(
    () => new Map(),
  );
  /** The margin items' tops, by key (from 64rem), and the nodes the rows mount in. */
  const [railTops, setRailTops] = useState<Record<string, number>>({});
  const [rowHosts, setRowHosts] = useState<Record<string, HTMLElement>>({});
  const [host, setHost] = useState<{
    art: HTMLElement;
    root: HTMLElement;
    shell: HTMLElement;
    /** Where a selection is read and a press closes what is open: the old article; the Library's text column. */
    scope: HTMLElement;
  } | null>(null);
  // P63-fk.S11, the Library's look: a note's save waits for its answer; a row of the Notes sheet waiting out its
  // ten seconds stays listed (it is its own undo line) but is out of the counts; the notes beside the text, by group.
  const [sendState, setSendState] = useState<{ pop: Pop | null; v: Send }>({
    pop: null,
    v: "rest",
  });
  /** The box's save, for the box it was pressed in: any other box is at rest. */
  const send: Send = sendState.pop === pop ? sendState.v : "rest";
  const [rowWaiting, setRowWaiting] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [besideHosts, setBesideHosts] = useState<Record<string, HTMLElement>>(
    {},
  );
  const [besideOf, setBesideOf] = useState<Record<string, string[]>>({});

  const layerRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const painted = useRef<Painted>(EMPTY_PAINT);
  const opener = useRef<{ el: HTMLElement | null; mark: string | null }>({
    el: null,
    mark: null,
  });
  const focusWant = useRef<"box" | "field" | "back" | null>(null);
  const revealed = useRef<string | null>(null);
  const selSeq = useRef(0);
  const toastSeq = useRef(0);
  const queue = useRef<Job[]>([]);
  const paused = useRef<Job[]>([]);
  const running = useRef(false);
  /** Deletes waiting out their undo line (`@/hi2vi/reader/marks/undo`, moved out of `scheduleDelete`). */
  const clock = useRef(undoClock());
  /** A row's delete, as its `MarkRow` hears it (the Library's Notes sheet): settled by the send. */
  const rowSends = useRef(new Map<string, Promise<void>>());
  /** The client id a new mark keeps while its box tries to save it, so a second try is not a second mark. */
  const boxId = useRef<string | null>(null);
  /** The box's own save: an answer for a box that has since changed moves nothing on screen. */
  const sendRun = useRef(0);
  const mouseDown = useRef(false);
  const railRaf = useRef(0);
  // The current state, for the document listeners (registered once).
  const now = useRef({
    sel,
    pop,
    save,
    items,
    orph,
    others,
    bms,
    obms,
    member,
  });
  useEffect(() => {
    now.current = { sel, pop, save, items, orph, others, bms, obms, member };
  });

  // ---- where the layer lives ------------------------------------------------------------
  useEffect(() => {
    // P63-fk.S9: the body and its article by the reader's hooks (`HOOK`); the document routes' article is
    // still `.rd-article` (`reader-frame.tsx`, until S12). The shell is the old root the layer sits in.
    const art = layerRef.current?.closest<HTMLElement>(
      ".rd-article, [data-reader-article]",
    );
    const root = art?.querySelector<HTMLElement>("[data-reader-body]");
    // P63-fk.S11: the Library's layer sits in no old root; its bottom slot is the frame's (the bridge's `slot`),
    // and its selections are read over the whole column (the head refuses, the end is no text to mark).
    const shell = lib
      ? art
      : layerRef.current?.closest<HTMLElement>(".rd-root");
    const scope = lib ? (art?.closest<HTMLElement>("article") ?? art) : art;
    // The layer reads the server-rendered page around it once it is hydrated.
    if (art && root && shell && scope) setHost({ art, root, shell, scope });
  }, [lib]);

  // P39-hk.F4: the formulas are server markup, read once the layer has its host (reported in a
  // frame, as the code quotes are: the lists, not the page, read it).
  useEffect(() => {
    if (!host) return;
    const frame = requestAnimationFrame(() => {
      const found = formulaAtoms(host.root, sections);
      if (found.size) setAtoms(found);
    });
    return () => cancelAnimationFrame(frame);
  }, [host, sections]);

  // ---- what the layer holds, as the lists and the margin show it ---------------------------------
  const names = notes.langNames;
  const langName = useCallback((l: string) => names[l] ?? l, [names]);
  const look = useMemo<SectionIndex>(
    () =>
      new Map(
        notes.sections.map((x, i) => [
          x.id,
          {
            n: i,
            label: x.word === "Section" ? x.title : `${x.word} · ${x.title}`,
            ...(x.lang ? { lang: x.lang } : {}),
          },
        ]),
      ),
    [notes.sections],
  );
  /**
   * P39-hk.F4 (OQ10): the quote a list shows for a highlight the page paints whose stored quote
   * holds a formula: each formula as its linear text, mapped from the highlight's own offsets
   * (`shownQuote`). Anything else (no formula, Text changed, another language, Unanchored)
   * shows its stored quote.
   */
  const shown = useMemo(() => {
    const out = new Map<string, string>();
    if (!atoms.size) return out;
    for (const x of items) {
      const text = x.sec !== null ? sections.get(x.sec) : undefined;
      const list = x.sec !== null ? atoms.get(x.sec) : undefined;
      if (
        x.kind !== "hl" ||
        x.status !== "anchored" ||
        x.method === "stored" ||
        !x.quote ||
        !text ||
        !list ||
        x.start === null ||
        x.end === null
      )
        continue;
      const q = shownQuote(text, x.start, x.end, x.quote.exact, list);
      if (q !== null) out.set(x.id, q);
    }
    return out;
  }, [items, sections, atoms]);
  const groups = useMemo(
    () =>
      buildGroups(
        {
          items,
          unanchored: orph,
          bookmarks: bms,
          other: others,
          otherBookmarks: obms,
        },
        { sections: look, chapterTitle, code: codeIds, shown },
        new Set(
          [...items, ...orph, ...others, ...bms, ...obms]
            // a row waiting out its ten seconds stays listed (the Library's Notes sheet: the row is the undo line)
            .filter((x) => x.gone && !rowWaiting.has(x.id))
            .map((x) => x.id),
        ),
      ),
    [
      items,
      orph,
      others,
      bms,
      obms,
      look,
      chapterTitle,
      codeIds,
      shown,
      rowWaiting,
    ],
  );
  /** F91: a delete still waiting its ten seconds is out of the counts at once. */
  const listCount = groups.count - rowWaiting.size;
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  });
  const setCount = bridge?.setCount;
  useEffect(() => {
    setCount?.(member ? listCount : 0);
  }, [setCount, listCount, member]);

  /** A section's bookmark is on (the place bar and the bar read "Bookmarked"). */
  const bookmarked = (sec: string | null): boolean =>
    !!sec && bms.some((b) => !b.gone && !b.pos && !b.approx && b.at === sec);
  const positionOn =
    positionNear(
      bms.filter((b) => !b.gone && b.pos && !b.approx),
      pct / 100,
    ).length > 0;

  // ---- the margin (from 64rem) and the rows under a block (below it) --------------------------
  interface Marker {
    key: string;
    kind: "note" | "bnote" | "changed" | "other" | "bm";
    at: "mark" | "block";
    id?: string;
    sec: string;
    lang?: string;
    order: number;
    look: MarkerLook;
    /** P63-fk.S11: the same note in the Library's look (`AnnotationsPaint`'s words). */
    beside: BesideNote;
  }
  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = [];
    const n = (sec: string) => look.get(sec)?.n ?? 0;
    const alive = items.filter((x) => !x.gone);
    for (const x of alive) {
      const sec = x.sec ?? x.block;
      if (!look.has(sec)) continue;
      if (x.kind === "hl" && x.status === "anchored" && x.note) {
        out.push({
          key: x.id,
          kind: "note",
          at: "mark",
          id: x.id,
          sec,
          order: n(sec) * 1e6 + (x.start ?? 0),
          look: {
            label: T.margin.note,
            text: x.note,
            lang: langOf(x.note, x.lang),
          },
          beside: besideNote("note", {
            text: x.note,
            lang: langOf(x.note, x.lang),
          }),
        });
      } else if (x.kind === "bnote" && x.status === "anchored") {
        const diagram = look.get(sec)?.label.startsWith("Diagram");
        out.push({
          key: x.id,
          kind: "bnote",
          at: "block",
          id: x.id,
          sec,
          order: n(sec) * 1e6 - 2,
          look: {
            label: diagram ? T.margin.noteDiagram : T.margin.noteSection,
            text: x.note,
            lang: langOf(x.note, x.lang),
          },
          beside: besideNote("bnote", {
            text: x.note,
            lang: langOf(x.note, x.lang),
          }),
        });
      }
    }
    const changed = new Map<string, Item[]>();
    for (const x of alive)
      if (x.status === "block") {
        const sec = x.sec ?? x.block;
        if (look.has(sec)) changed.set(sec, [...(changed.get(sec) ?? []), x]);
      }
    for (const [sec, list] of changed)
      out.push({
        key: `chg-${sec}`,
        kind: "changed",
        at: "block",
        sec,
        order: n(sec) * 1e6 - 1,
        look: {
          label: T.margin.changed,
          text: T.changed.item(marksWord(list), list.length),
          lang,
        },
        beside: besideNote("changed", {
          words: marksWord(list),
          n: list.length,
        }),
      });
    const byOther = new Map<string, OtherItem[]>();
    for (const x of others)
      if (!x.gone && x.at && look.has(x.at))
        byOther.set(`${x.at}|${x.lang}`, [
          ...(byOther.get(`${x.at}|${x.lang}`) ?? []),
          x,
        ]);
    for (const [k, list] of byOther) {
      const sec = list[0].at!;
      out.push({
        key: `oth-${k}`,
        kind: "other",
        at: "block",
        sec,
        lang: list[0].lang,
        order: n(sec) * 1e6 - 0.5,
        look: {
          label: "",
          text: T.other.item(marksWord(list)),
          lang,
          endonym: { name: langName(list[0].lang), lang: list[0].lang },
        },
        beside: besideNote("other", {
          words: marksWord(list),
          endonym: { name: langName(list[0].lang), lang: list[0].lang },
        }),
      });
    }
    for (const b of bms)
      if (!b.gone && !b.pos && !b.approx && b.at && look.has(b.at))
        out.push({
          key: b.id,
          kind: "bm",
          at: "block",
          id: b.id,
          sec: b.at,
          order: n(b.at) * 1e6 - 3,
          look: {
            label: T.margin.bookmarked,
            labelOn: true,
            text: b.label,
            lang: langOf(b.label, "en"),
          },
          beside: besideNote("bm", {
            text: b.label,
            lang: langOf(b.label, "en"),
          }),
        });
    return out.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  }, [items, others, bms, look, lang, langName]);

  const openMarker = useCallback(
    (m: Marker, el: HTMLElement) => {
      setSel(null);
      setSave(false);
      setLanded(null);
      opener.current = { el, mark: null };
      if (m.kind === "note" && m.id) {
        // A highlight inside a closed fold: open the fold first, then its popover.
        host?.root
          .querySelector<HTMLDetailsElement>(
            `details:not([open]):has(mark.an-m[data-an~="${CSS.escape(m.id)}"])`,
          )
          ?.setAttribute("open", "");
        setPop({ t: "hl", id: m.id, edit: false });
      } else if (m.kind === "bnote" && m.id)
        setPop({ t: "bnote", id: m.id, edit: false });
      else if (m.kind === "changed") setPop({ t: "changed", sec: m.sec });
      else if (m.kind === "other" && m.lang)
        setPop({ t: "other", sec: m.sec, lang: m.lang });
      else if (m.kind === "bm" && m.id)
        setPop({ t: "bm", id: m.id, edit: false });
      focusWant.current = "box";
    },
    [host],
  );
  const markerOpen = (m: Marker): boolean => {
    if (!pop) return false;
    if (m.kind === "note") return pop.t === "hl" && pop.id === m.id;
    if (m.kind === "bnote") return pop.t === "bnote" && pop.id === m.id;
    if (m.kind === "bm") return pop.t === "bm" && pop.id === m.id;
    if (m.kind === "changed") return pop.t === "changed" && pop.sec === m.sec;
    return pop.t === "other" && pop.sec === m.sec && pop.lang === m.lang;
  };

  // P63-fk.S11, the Library's look: the notes beside the text, each group a node after its block (made below, once
  // the paint is in), in the margin where the page has the room for it, under its block elsewhere.
  const besideNodes = useRef(new Map<string, HTMLElement>());
  const besideKeys = useRef<Record<string, string[]>>({});
  const layoutBeside = useCallback(() => {
    if (!host) return;
    const app = host.art.closest<HTMLElement>(".app");
    const main = host.art.closest<HTMLElement>(".reader-main");
    const col = host.scope;
    const nodes = [...besideNodes.current.entries()].filter(
      ([, n]) => n.isConnected,
    );
    if (!nodes.length) return;
    const em = app ? parseFloat(getComputedStyle(app).fontSize) || 16 : 16;
    const fit =
      app && main
        ? railFits({
            appWidth: app.clientWidth,
            em,
            mainWidth: main.clientWidth,
            colWidth: col.offsetWidth,
          })
        : { rail: false, width: 0 };
    // in document order, so each stays clear of the one above
    nodes.sort(([, a], [, b]) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    for (const [, n] of nodes) {
      n.classList.toggle("is-rail", fit.rail);
      if (fit.rail) n.style.setProperty("--marks-rail-w", `${fit.width}px`);
      else {
        n.style.removeProperty("--marks-rail-w");
        n.style.removeProperty("--marks-top");
      }
    }
    if (!fit.rail) return;
    const ar = host.art.getBoundingClientRect();
    const lines = nodes.map(([k, n]) => {
      const first = besideKeys.current[k]?.[0];
      const m = markers.find((x) => x.key === first);
      let a: Element | null =
        m?.at === "mark" && m.id
          ? host.root.querySelector(`mark.an-m[data-an~="${CSS.escape(m.id)}"]`)
          : null;
      // a mark in a closed fold has no box: its group starts on the fold's summary
      if (a && !a.getClientRects().length)
        a = a.closest("details")?.querySelector("summary") ?? null;
      const r = a?.getClientRects()[0];
      const line = r
        ? r.top
        : (n.previousElementSibling?.getBoundingClientRect().top ?? ar.top);
      return { line: line - ar.top, height: n.offsetHeight };
    });
    stackRail(lines).forEach((t, i) =>
      nodes[i][1].style.setProperty("--marks-top", `${t}px`),
    );
  }, [host, markers]);

  // The margin items' tops: each beside its anchor (a mark, or a block), 8 px clear of the one above.
  const layoutRail = useCallback((): boolean => {
    if (!host) return false;
    if (lib) {
      layoutBeside();
      return false;
    }
    const rail = host.art.querySelector<HTMLElement>(".an-rail");
    if (!rail || !rail.offsetParent) return false; // below 64rem the rail is not shown
    const ar = host.art.getBoundingClientRect();
    const els = rail.querySelectorAll<HTMLElement>(".an-ri");
    const tops: Record<string, number> = {};
    let prev = -1e9;
    let missing = false;
    markers.forEach((m, i) => {
      const el = els[i];
      if (!el) return;
      let a: Element | null =
        m.at === "mark" && m.id
          ? host.root.querySelector(`mark.an-m[data-an~="${CSS.escape(m.id)}"]`)
          : null;
      // A mark inside a closed fold has no box: its item anchors to the fold's summary.
      if (a && !a.getClientRects().length)
        a = a.closest("details")?.querySelector("summary") ?? null;
      if (!a)
        a = host.root.querySelector(`[data-block="${CSS.escape(m.sec)}"]`);
      let y: number | null = a ? a.getBoundingClientRect().top - ar.top : null;
      if (y === null) {
        missing = true;
        y = prev + 8;
      }
      const t = Math.round(Math.max(y - 4, prev + 8));
      tops[m.key] = t;
      prev = t + el.offsetHeight;
    });
    setRailTops((o) => {
      const ks = Object.keys(tops);
      const same =
        ks.length === Object.keys(o).length &&
        ks.every((k) => Math.abs((o[k] ?? -1e9) - tops[k]) <= 1);
      return same ? o : tops;
    });
    return missing;
  }, [host, markers, lib, layoutBeside]);
  const scheduleRail = useCallback(() => {
    cancelAnimationFrame(railRaf.current);
    railRaf.current = requestAnimationFrame(() => {
      // An anchor that is not in the page yet (a late block): once more shortly after.
      if (layoutRail())
        window.setTimeout(() => {
          railRaf.current = requestAnimationFrame(() => layoutRail());
        }, 150);
    });
  }, [layoutRail]);
  // After each render, and when the text reflows (a resize, a font, a fold, an image).
  useLayoutEffect(() => {
    scheduleRail();
  });
  useEffect(() => {
    if (!host) return;
    const again = () => scheduleRail();
    const ro = new ResizeObserver(again);
    ro.observe(host.root);
    ro.observe(host.art);
    window.addEventListener("resize", again);
    host.art.addEventListener("toggle", again, true);
    host.art.addEventListener("load", again, true);
    document.fonts?.ready.then(again).catch(() => {});
    return () => {
      cancelAnimationFrame(railRaf.current);
      ro.disconnect();
      window.removeEventListener("resize", again);
      host.art.removeEventListener("toggle", again, true);
      host.art.removeEventListener("load", again, true);
    };
  }, [host, scheduleRail]);

  // The "Bookmarked" tag (in the block's top margin) and the rows' mount nodes are DOM the
  // chapter does not render itself, kept in step with the marks and removed with the layer.
  const hostNodes = useRef(new Map<string, HTMLElement>());
  // The cleanup is a layout effect declared first: on a host change every cleanup runs before
  // the sync below creates its nodes, where a passive cleanup would remove what it just made.
  useLayoutEffect(
    () => () => {
      hostNodes.current.forEach((n) => n.remove());
      hostNodes.current.clear();
      host?.root.querySelectorAll("[data-an-tag]").forEach((t) => t.remove());
    },
    [host],
  );
  useLayoutEffect(() => {
    // P63-fk.S11: the Library's look has no tag in the heading and no rows of this kind (its notes beside the
    // text are made below).
    if (!host || lib) return;
    const tagSecs = new Set(
      markers.filter((m) => m.kind === "bm").map((m) => m.sec),
    );
    host.root.querySelectorAll<HTMLElement>("[data-an-tag]").forEach((t) => {
      const sec = t.getAttribute("data-an-tag") ?? "";
      if (tagSecs.has(sec)) tagSecs.delete(sec);
      else t.remove();
    });
    tagSecs.forEach((sec) => {
      const el = host.root.querySelector(`[data-block="${CSS.escape(sec)}"]`);
      if (!el) return;
      const tag = document.createElement("span");
      tag.className = "an-tag";
      tag.setAttribute("aria-hidden", "true");
      tag.setAttribute("data-an-skip", "");
      tag.textContent = T.margin.bookmarked;
      if (/^(OL|UL|DL|TABLE)$/.test(el.tagName)) {
        // A list or a table takes no <span> child: the tag hangs from a zero-height box before it.
        const wrap = document.createElement("div");
        wrap.className = "an-tag-w";
        wrap.setAttribute("data-an-tag", sec);
        wrap.setAttribute("aria-hidden", "true");
        wrap.appendChild(tag);
        el.before(wrap);
      } else {
        tag.setAttribute("data-an-tag", sec);
        el.appendChild(tag);
      }
    });
    const rowSecs = new Set(
      markers
        .filter(
          (m) =>
            m.kind === "bnote" || m.kind === "changed" || m.kind === "other",
        )
        .map((m) => m.sec),
    );
    const nodes = hostNodes.current;
    for (const [sec, node] of [...nodes])
      if (!rowSecs.has(sec) || !node.isConnected) {
        node.remove();
        nodes.delete(sec);
      }
    for (const sec of rowSecs) {
      if (nodes.has(sec)) continue;
      const block = host.root.querySelector(
        `[data-block="${CSS.escape(sec)}"]`,
      );
      if (!block) continue;
      const node = document.createElement("div");
      node.className = "an-rows";
      block.after(node);
      nodes.set(sec, node);
    }
    setRowHosts((o) => {
      const same =
        Object.keys(o).length === nodes.size &&
        [...nodes].every(([k, v]) => o[k] === v);
      return same ? o : Object.fromEntries(nodes);
    });
  }, [host, markers, lib]);

  // ---- the section being read, for the place bar -----------------------------------------------
  useEffect(() => {
    if (!host) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const doc = document.documentElement;
      const p = progressPercent(
        window.scrollY,
        doc.scrollHeight - window.innerHeight,
      );
      setPct((o) => (o === p ? o : p));
      const bar =
        document.querySelector(PG.top)?.getBoundingClientRect().bottom ?? 59;
      const line = bar + 24;
      let found: string | null = null;
      host.root.querySelectorAll<HTMLElement>("[data-block]").forEach((h) => {
        const id = h.getAttribute("data-block");
        if (id && look.has(id) && h.getBoundingClientRect().top <= line)
          found = id;
      });
      setBlk((o) => (o === found ? o : found));
      const end = host.scope.querySelector(PG.end);
      const seen = end
        ? end.getBoundingClientRect().top < window.innerHeight - 40 || p >= 95
        : p >= 95;
      setEndSeen((o) => (o === seen ? o : seen));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    document.fonts?.ready.then(on).catch(() => {});
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [host, look, PG]);

  // ---- the toast ---------------------------------------------------------------------------
  const showToast = useCallback((t: Omit<Toast, "id">, timed: boolean) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToast({ id, ...t });
    // A timer clears only the line it started.
    if (timed)
      window.setTimeout(
        () => setToast((cur) => (cur && cur.id === id ? null : cur)),
        UNDO_MS,
      );
  }, []);

  // ---- writes: one at a time, in order ---------------------------------------------------
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const job = queue.current[0];
        let r: AnnotationResult;
        try {
          r = await runWire(job.wire);
        } catch {
          r = { ok: false, status: 0 };
        }
        if (r.ok) {
          queue.current.shift();
          job.done?.(r);
          continue;
        }
        const st = r.status ?? 0;
        if (job.fail && (st === 401 || st === 0 || st === 429 || st >= 500)) {
          // P63-fk.S11: a part that says its own failure is told so once its tries are spent (a lapsed session at
          // once, with Sign in to save as before); the rest of the queue goes on.
          if (st !== 401) {
            job.tries += 1;
            if (job.tries < 3) {
              await new Promise((ok) => window.setTimeout(ok, 800 * job.tries));
              continue;
            }
          } else
            setSlotSave(job.wire.op.startsWith("bm") ? "bookmarks" : "notes");
          queue.current.shift();
          job.fail();
          continue;
        }
        if (st === 401) {
          paused.current.push(...queue.current);
          queue.current = [];
          // Kept across the sign-in: the link leaves this page.
          stashUnsaved(paused.current.map((j) => j.wire));
          setSlotSave(job.wire.op.startsWith("bm") ? "bookmarks" : "notes");
          break;
        }
        if (st === 0 || st === 429 || st >= 500) {
          job.tries += 1;
          if (job.tries < 3) {
            await new Promise((ok) => window.setTimeout(ok, 800 * job.tries));
            continue;
          }
          paused.current.push(...queue.current);
          queue.current = [];
          showToast(
            { text: T.notSaved, retry: () => retryRef.current() },
            false,
          );
          break;
        }
        // Refused for good: drop it and put the page back as the server holds it.
        queue.current.shift();
        job.undo?.();
        if (job.fail) job.fail();
        else showToast({ text: T.notSaved }, true);
      }
    } finally {
      running.current = false;
    }
  }, [showToast]);

  const retryRef = useRef<() => void>(() => {});
  const retry = useCallback(() => {
    if (!paused.current.length) return;
    // Sent from memory now; the stashed copy would only send them twice.
    takeUnsaved();
    const jobs = paused.current.map((j) => ({ ...j, tries: 0 }));
    paused.current = [];
    queue.current = [...jobs, ...queue.current];
    setToast(null);
    void pump();
  }, [pump]);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);

  // Writes a lapsed session stopped, held across the sign-in: send them now, in order,
  // then read the notes again so the page shows what the server keeps.
  const router = useRouter();
  const resync = useRef(false);
  useEffect(() => {
    if (!member) return;
    const held = takeUnsaved();
    if (!held.length) return;
    void (async () => {
      let sent = 0;
      for (let i = 0; i < held.length; i += 1) {
        let r: AnnotationResult;
        try {
          r = await runWire(held[i]);
        } catch {
          r = { ok: false, status: 0 };
        }
        const st = r.status ?? 0;
        if (r.ok) sent += 1;
        else if (st === 0 || st === 401 || st === 429 || st >= 500) {
          // Not now: keep the rest for the next page this tab opens.
          stashUnsaved(held.slice(i));
          break;
        }
      }
      if (sent) {
        resync.current = true;
        router.refresh();
      }
    })();
  }, [member, router]);
  useEffect(() => {
    if (!resync.current) return;
    resync.current = false;
    setItems(notes.items.map(toItem));
    setOrph(notes.unanchored.map(toItem));
    setOthers(notes.other);
    setBms(notes.bookmarks);
    setObms(notes.otherBookmarks);
  }, [notes]);

  const enqueue = useCallback(
    (job: Omit<Job, "tries">) => {
      queue.current.push({ ...job, tries: 0 });
      void pump();
    },
    [pump],
  );

  const patchItem = useCallback((id: string, change: Partial<Item>) => {
    const apply = (list: Item[]) =>
      list.map((x) => (x.id === id ? { ...x, ...change } : x));
    setItems(apply);
    setOrph(apply);
    setOthers((list) =>
      list.map((x) => (x.id === id ? { ...x, ...change } : x)),
    );
  }, []);
  const patchBookmark = useCallback(
    (id: string, change: Partial<Bk>) =>
      setBms((list) =>
        list.map((x) => (x.id === id ? { ...x, ...change } : x)),
      ),
    [],
  );
  /** Mark deleted marks (they wait out the undo line, hidden everywhere), or bring them back. */
  const setGone = useCallback((ids: readonly string[], gone: boolean) => {
    const on = new Set(ids);
    const apply = <T extends { id: string; gone?: boolean }>(list: T[]) =>
      list.map((x) => (on.has(x.id) ? { ...x, gone } : x));
    setItems(apply);
    setOrph(apply);
    setOthers(apply);
    setBms(apply);
    setObms(apply);
  }, []);
  const dropMarks = useCallback((ids: readonly string[]) => {
    const on = new Set(ids);
    const keep = <T extends { id: string }>(list: T[]) =>
      list.filter((x) => !on.has(x.id));
    setItems(keep);
    setOrph(keep);
    setOthers(keep);
    setBms(keep);
    setObms(keep);
  }, []);

  // A delete waits out its undo line; this sends it now (leaving; the next delete sends its own forerunner).
  const flushDelete = useCallback(() => {
    clock.current.flush();
  }, []);

  useEffect(() => {
    const away = () => {
      if (document.visibilityState === "hidden") flushDelete();
    };
    const online = () => {
      if (paused.current.length) retryRef.current();
    };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", flushDelete);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", flushDelete);
      window.removeEventListener("online", online);
      flushDelete();
    };
  }, [flushDelete]);

  // ---- what is painted ---------------------------------------------------------------------
  const ranges = useMemo<PaintRange[]>(
    () =>
      items
        .filter(
          (x) =>
            x.kind === "hl" &&
            !x.gone &&
            x.status === "anchored" &&
            x.method !== "stored" &&
            x.sec !== null &&
            sections.has(x.sec) &&
            x.start !== null &&
            x.end !== null &&
            x.end > x.start,
        )
        .sort(
          (a, b) => (a.start ?? 0) - (b.start ?? 0) || a.id.localeCompare(b.id),
        )
        .map((x) => ({
          id: x.id,
          sec: x.sec!,
          s: x.start!,
          e: x.end!,
          note: !!x.note,
        })),
    [items, sections],
  );
  const pending =
    sel && sel.mode === "passage" && (sel.pointer || pop?.t === "new")
      ? { sec: sel.sec, s: sel.s, e: sel.e }
      : null;
  const active = pop?.t === "hl" ? pop.id : pop ? null : landed;
  const paintKey = JSON.stringify([ranges, pending, active]);

  useLayoutEffect(() => {
    if (!host) return;
    unpaint(painted.current);
    painted.current = paint(host.root, sections, {
      ranges,
      pending,
      active,
      desc,
      ...(lib ? { classes: LIBRARY_PAINT } : {}),
    });
    // Which highlights sit in code (a list shows their quote in mono, unpainted).
    const code = new Set<string>();
    host.root
      .querySelectorAll<HTMLElement>("mark.an-m[data-an]")
      .forEach((m) => {
        if (m.closest('[data-tx="code"]'))
          (m.getAttribute("data-an") ?? "")
            .split(" ")
            .filter(Boolean)
            .forEach((id) => code.add(id));
      });
    // Reported after the paint (the lists, not the page, read it).
    requestAnimationFrame(() =>
      setCodeIds((prev) =>
        prev.size === code.size && [...code].every((id) => prev.has(id))
          ? prev
          : code,
      ),
    );
    // ranges/pending/active are folded into paintKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, paintKey, sections, desc, lib]);
  useEffect(
    () => () => {
      unpaint(painted.current);
      painted.current = EMPTY_PAINT;
    },
    [],
  );

  // ---- P63-fk.S11: the notes beside the text, in the Library's look (`AnnotationsPaint`) ------------------------
  // A heading's notes (its bookmark, its note, Text changed, another language) hang after the heading, a highlight's
  // note after the block its first piece is in, each group a node of the layer's own after that block (the old
  // rows' way), made once the paint is in. `layoutBeside` puts them in the margin, or leaves them under the block.
  useLayoutEffect(
    () => () => {
      besideNodes.current.forEach((n) => n.remove());
      besideNodes.current.clear();
    },
    [host],
  );
  useLayoutEffect(() => {
    if (!host || !lib) return;
    const { root } = host;
    const top = (el: Element | null): Element | null => {
      let e = el;
      while (e && e.parentElement !== root) e = e.parentElement;
      return e;
    };
    const own = (e: Element) => e.hasAttribute("data-an-ui");
    const want = new Map<string, { anchor: Element; keys: string[] }>();
    for (const m of markers) {
      const mark =
        m.at === "mark" && m.id
          ? root.querySelector(`mark.an-m[data-an~="${CSS.escape(m.id)}"]`)
          : null;
      const block = root.querySelector(`[data-block="${CSS.escape(m.sec)}"]`);
      const anchor = top(mark) ?? top(block) ?? block;
      if (!anchor) continue;
      const at = Array.prototype.filter
        .call(root.children, (c: Element) => !own(c))
        .indexOf(anchor);
      const k = at >= 0 ? `b${at}` : `s${m.sec}`;
      const g = want.get(k) ?? { anchor, keys: [] };
      g.keys.push(m.key);
      want.set(k, g);
    }
    const nodes = besideNodes.current;
    for (const [k, node] of [...nodes]) {
      const g = want.get(k);
      if (!g || !node.isConnected || node.previousElementSibling !== g.anchor) {
        node.remove();
        nodes.delete(k);
      }
    }
    for (const [k, g] of want) {
      if (nodes.has(k)) continue;
      const node = document.createElement("div");
      node.className = "marks-notes";
      node.setAttribute("data-an-ui", "");
      g.anchor.after(node);
      nodes.set(k, node);
    }
    const keys = Object.fromEntries([...want].map(([k, g]) => [k, g.keys]));
    besideKeys.current = keys;
    setBesideHosts((o) => {
      const same =
        Object.keys(o).length === nodes.size &&
        [...nodes].every(([k, v]) => o[k] === v);
      return same ? o : Object.fromEntries(nodes);
    });
    setBesideOf((o) => (JSON.stringify(o) === JSON.stringify(keys) ? o : keys));
  }, [host, lib, markers, paintKey]);

  // ---- closing and focus ---------------------------------------------------------------------
  const clearNative = () => {
    const s = window.getSelection();
    if (s && s.rangeCount) s.removeAllRanges();
  };

  const closeAll = useCallback((back: boolean) => {
    setPop(null);
    setSel(null);
    setSave(false);
    setLanded(null);
    if (back) focusWant.current = "back";
  }, []);

  const restoreFocus = useCallback(() => {
    const o = opener.current;
    let el: HTMLElement | null = null;
    if (o.mark && host)
      el = host.root.querySelector<HTMLElement>(
        `mark[data-an-key~="${CSS.escape(o.mark)}"]`,
      );
    if (!el && o.el && o.el.isConnected) el = o.el;
    el?.focus({ preventScroll: true });
  }, [host]);

  // ---- the actions -----------------------------------------------------------------------------
  const sectionLabel = useCallback(
    (sec: string | null): string => {
      const m = sec ? meta.get(sec) : undefined;
      if (!m) return "";
      return m.word === "Section" ? m.title : `${m.word} · ${m.title}`;
    },
    [meta],
  );
  /** P39-hk.F7 (OQ25): a place name's own language, the chapter's unless the section names another (the Glossary). */
  const sectionLang = useCallback(
    (sec: string | null): string =>
      (sec ? meta.get(sec)?.lang : undefined) ?? lang,
    [meta, lang],
  );

  const snapshotOf = useCallback(
    (sec: string, text: string) =>
      snapshotFor(text, sectionLabel(sec), chapterTitle),
    [sectionLabel, chapterTitle],
  );

  const createHighlight = useCallback(
    (s: Extract<Sel, { mode: "passage" }>, note: string): string | null => {
      if (!write) return null;
      const id = newId();
      const item: Item = {
        id,
        kind: "hl",
        block: s.sec,
        sec: s.sec,
        start: s.s,
        end: s.e,
        status: "anchored",
        method: "exact",
        quote: {
          exact: s.quote.exact,
          prefix: s.quote.prefix,
          suffix: s.quote.suffix,
        },
        note,
        review: false,
        card: "",
        snapshot: null,
        everOn: false,
        lang,
        version,
        created: new Date().toISOString(),
      };
      setItems((list) => [...list, item]);
      enqueue({
        wire: highlightWire({
          write,
          id,
          version,
          sec: s.sec,
          quote: s.quote,
          note,
          snapshot: snapshotOf(s.sec, s.quote.exact),
        }),
        undo: () => setItems((list) => list.filter((x) => x.id !== id)),
      });
      return id;
    },
    [write, lang, version, enqueue, snapshotOf],
  );

  const highlight = useCallback(() => {
    const s = now.current.sel;
    if (!s || s.mode !== "passage") return;
    // A visitor is offered Sign in to save, and nothing is written (`pressFor`).
    if ("save" in pressFor(now.current.member, "highlight")) {
      setSaveWhat("notes");
      setSave(true);
      return;
    }
    clearNative();
    const id = createHighlight(s, "");
    setSel(null);
    if (id) {
      // Its popover opens (view), so a note or Review this is one tap away.
      opener.current = { el: null, mark: id };
      setPop({ t: "hl", id, edit: false });
      focusWant.current = "box";
    }
  }, [createHighlight]);

  const noteSel = useCallback(() => {
    const s = now.current.sel;
    if (!s || s.mode !== "passage") return;
    if ("save" in pressFor(now.current.member, "note")) {
      setSaveWhat("notes");
      setSave(true);
      return;
    }
    clearNative();
    setSel({ ...s, pointer: true });
    setDraft("");
    boxId.current = null;
    setPop({ t: "new" });
    focusWant.current = "field";
  }, []);

  const blockNote = useCallback((sec: string, from?: "place") => {
    if (!now.current.member) {
      if (from === "place") setSlotSave("notes");
      else {
        setSaveWhat("notes");
        setSave(true);
      }
      return;
    }
    const have = now.current.items.find(
      (x) =>
        x.kind === "bnote" &&
        !x.gone &&
        x.status === "anchored" &&
        (x.sec ?? x.block) === sec,
    );
    setSel(null);
    if (have) {
      setPop({ t: "bnote", id: have.id, edit: false });
      focusWant.current = "box";
    } else {
      setDraft("");
      boxId.current = null;
      setPop({ t: "bnew", sec });
      focusWant.current = "field";
    }
  }, []);

  const openMarks = useCallback((ids: string[]) => {
    setSel(null);
    setSave(false);
    if (ids.length > 1) setPop({ t: "choose", ids });
    else setPop({ t: "hl", id: ids[0], edit: false });
    focusWant.current = "box";
  }, []);

  const closePop = useCallback(() => {
    const p = now.current.pop;
    setPop(null);
    // A new note's Cancel and Close return to the bar; everything else closes.
    if (p?.t !== "new") setSel(null);
    focusWant.current = "back";
  }, []);

  /**
   * A delete waits out its undo line, hidden everywhere meanwhile; Undo puts it all back (the clock: one undo line at
   * a time, so a later delete sends the one before it). In the Library's look a send that fails brings the mark back
   * with its failed line (frame.md F65), in the undo line's place.
   */
  const scheduleDelete = useCallback(
    (
      ids: string[],
      text: string,
      wireOf: (id: string) => Wire,
      failed?: string,
    ) => {
      setGone(ids, true);
      const key = ids.join(",");
      clock.current.start(
        key,
        () => {
          for (const id of ids)
            enqueue({
              wire: wireOf(id),
              done: () => dropMarks([id]),
              undo: () => setGone([id], false),
              ...(lib && failed
                ? {
                    fail: () => {
                      setGone([id], false);
                      showToast({ text: failed }, true);
                    },
                  }
                : {}),
            });
        },
        true,
      );
      showToast(
        {
          text,
          undo: () => {
            clock.current.undo(key);
            setGone(ids, false);
            setToast(null);
          },
        },
        true,
      );
    },
    [dropMarks, enqueue, setGone, showToast, lib],
  );

  const remove = useCallback(
    (id: string) => {
      const cur = now.current;
      const it: (ReaderNote & { everOn?: boolean }) | undefined =
        cur.items.find((x) => x.id === id) ??
        cur.orph.find((x) => x.id === id) ??
        cur.others.find((x) => x.id === id);
      if (!it) return;
      scheduleDelete(
        [id],
        it.kind === "bnote"
          ? T.undo.noteOnly
          : undoText({ note: it.note, card: it.card !== "" || !!it.everOn }),
        removeWire,
        it.kind === "bnote" ? MARK_ROW.failed.note : MARK_ROW.failed.highlight,
      );
      setPop(null);
      setSel(null);
      setLanded(null);
      focusWant.current = "back";
    },
    [scheduleDelete],
  );

  // ---- bookmarks ------------------------------------------------------------------------------
  const removeBookmarks = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      scheduleDelete(
        ids,
        T.bm.removed,
        removeBookmarkWire,
        MARK_ROW.failed.bookmark,
      );
      setPop(null);
      setSel(null);
      focusWant.current = "back";
    },
    [scheduleDelete],
  );

  const makeBookmark = useCallback(
    (
      anchor: { block_id: string } | { fraction: number },
      snippet: string,
    ): string | null => {
      if (!write) return null;
      const id = newId();
      const sec = "block_id" in anchor ? anchor.block_id : null;
      const bk: Bk = {
        id,
        block: sec,
        at: sec,
        exact: true,
        fraction: "fraction" in anchor ? anchor.fraction : null,
        label: "",
        snippet,
        pos: sec === null,
        approx: false,
        lang,
        version,
        created: new Date().toISOString(),
      };
      setBms((list) => [...list, bk]);
      enqueue({
        wire: bookmarkWire({ write, id, version, anchor, snippet }),
        undo: () => setBms((list) => list.filter((x) => x.id !== id)),
      });
      return id;
    },
    [write, lang, version, enqueue],
  );

  /** A section's bookmark, toggled: the control reads "Bookmarked" and is pressed. */
  const toggleSection = useCallback(
    (sec: string, from: "bar" | "place") => {
      if (!now.current.member) {
        if (from === "place") setSlotSave("bookmarks");
        else {
          setSaveWhat("bookmarks");
          setSave(true);
        }
        return;
      }
      const have = now.current.bms.filter(
        (b) => !b.gone && !b.pos && !b.approx && b.at === sec,
      );
      if (have.length) {
        removeBookmarks(have.map((b) => b.id));
        return;
      }
      makeBookmark({ block_id: sec }, clip(sectionLabel(sec), 140));
    },
    [makeBookmark, removeBookmarks, sectionLabel],
  );

  /** What the reader is looking at: the fraction read, and the first text under the top bar. */
  const placeNow = useCallback((): { frac: number; snippet: string } => {
    const doc = document.documentElement;
    const p = progressPercent(
      window.scrollY,
      doc.scrollHeight - window.innerHeight,
    );
    let snippet = "";
    const line =
      (document.querySelector(PG.top)?.getBoundingClientRect().bottom ?? 59) +
      8;
    const all = host?.root.querySelectorAll<HTMLElement>(
      "p, li, h2, h3, h4, pre, blockquote",
    );
    if (all)
      for (const el of Array.from(all)) {
        if (
          el.getBoundingClientRect().top >= line - 4 &&
          el.textContent?.trim()
        ) {
          snippet = el.textContent;
          break;
        }
      }
    return { frac: p / 100, snippet: snippetOf(snippet) };
  }, [host, PG]);

  /** A plain document's position bookmark; one within 2% of the reader's place is removed instead. */
  const togglePosition = useCallback(
    (from: "bar" | "place") => {
      if (!now.current.member) {
        if (from === "place") setSlotSave("bookmarks");
        else {
          setSaveWhat("bookmarks");
          setSave(true);
        }
        return;
      }
      const { frac, snippet } = placeNow();
      const near = positionNear(
        now.current.bms.filter((b) => !b.gone && b.pos && !b.approx),
        frac,
      );
      if (near.length) {
        removeBookmarks(near);
        return;
      }
      makeBookmark({ fraction: frac }, snippet);
    },
    [makeBookmark, placeNow, removeBookmarks],
  );

  const setLabel = useCallback(
    (id: string, label: string) => {
      const before = now.current.bms.find((b) => b.id === id)?.label ?? "";
      const clean = cleanLabel(label);
      if (clean === before) return;
      patchBookmark(id, { label: clean });
      enqueue({
        wire: labelWire(id, clean),
        undo: () => patchBookmark(id, { label: before }),
      });
    },
    [enqueue, patchBookmark],
  );

  const setNote = useCallback(
    (id: string, note: string, before: string) => {
      patchItem(id, { note });
      enqueue({
        wire: noteWire(id, note),
        undo: () => patchItem(id, { note: before }),
      });
    },
    [enqueue, patchItem],
  );

  const saveNote = useCallback(() => {
    const p = now.current.pop;
    const text = cleanNote(draft);
    if (!p) return;
    if (p.t === "new") {
      const s = now.current.sel;
      if (!s || s.mode !== "passage") {
        setPop(null);
        return;
      }
      const id = createHighlight(s, text);
      setSel(null);
      if (id) {
        opener.current = { el: null, mark: id };
        setPop({ t: "hl", id, edit: false });
        focusWant.current = "box";
      } else setPop(null);
      return;
    }
    if (p.t === "bnew") {
      if (!text || !write) {
        setPop(null);
        focusWant.current = "back";
        return;
      }
      const id = newId();
      const item: Item = {
        id,
        kind: "bnote",
        block: p.sec,
        sec: p.sec,
        start: null,
        end: null,
        status: "anchored",
        method: "section",
        quote: null,
        note: text,
        review: false,
        card: "",
        snapshot: null,
        everOn: false,
        lang,
        version,
        created: new Date().toISOString(),
      };
      setItems((list) => [...list, item]);
      enqueue({
        wire: sectionNoteWire({
          write,
          id,
          version,
          sec: p.sec,
          note: text,
          snapshot: snapshotOf(p.sec, sectionLabel(p.sec)),
        }),
        undo: () => setItems((list) => list.filter((x) => x.id !== id)),
      });
      setPop({ t: "bnote", id, edit: false });
      focusWant.current = "box";
      return;
    }
    if (p.t === "bnote") {
      const it = now.current.items.find((x) => x.id === p.id);
      // Saving an empty section note deletes it.
      if (!text) {
        remove(p.id);
        return;
      }
      if (it && it.note !== text) setNote(p.id, text, it.note);
      setPop({ ...p, edit: false });
      focusWant.current = "box";
      return;
    }
    if (p.t === "hl") {
      const it = now.current.items.find((x) => x.id === p.id);
      // Saving an empty note on a highlight removes the note and keeps the highlight.
      if (it && it.note !== text) setNote(p.id, text, it.note);
      setPop({ ...p, edit: false });
      focusWant.current = "box";
    }
  }, [
    draft,
    createHighlight,
    write,
    lang,
    version,
    enqueue,
    snapshotOf,
    sectionLabel,
    remove,
    setNote,
  ]);

  /**
   * P63-fk.S11, the Library's look (`AnnotationsBox`'s `send`): Save note waits for its answer. The write is the
   * one the old look sends, built the same way and sent at the same press; the box reads `Saving…` meanwhile, then
   * shows the mark, or `Could not save the note. Try again.` with the words kept, and Save note sends it again (a
   * new mark keeps its client id, so the server never takes it twice). An empty save keeps the old rules: a new
   * highlight is saved alone, a highlight's note is removed, a section's note is deleted.
   */
  const saveNoteLib = useCallback(() => {
    const p = now.current.pop;
    if (!p) return;
    const text = cleanNote(draft);
    const run = ++sendRun.current;
    const mine = () => run === sendRun.current && now.current.pop === p;
    const wait = () => setSendState({ pop: p, v: "saving" });
    const fail = () => {
      if (mine()) setSendState({ pop: p, v: "failed" });
    };
    if (p.t === "new") {
      const s = now.current.sel;
      if (!s || s.mode !== "passage" || !write) {
        setPop(null);
        return;
      }
      const id = (boxId.current ??= newId());
      const item: Item = {
        id,
        kind: "hl",
        block: s.sec,
        sec: s.sec,
        start: s.s,
        end: s.e,
        status: "anchored",
        method: "exact",
        quote: {
          exact: s.quote.exact,
          prefix: s.quote.prefix,
          suffix: s.quote.suffix,
        },
        note: text,
        review: false,
        card: "",
        snapshot: null,
        everOn: false,
        lang,
        version,
        created: new Date().toISOString(),
      };
      wait();
      enqueue({
        wire: highlightWire({
          write,
          id,
          version,
          sec: s.sec,
          quote: s.quote,
          note: text,
          snapshot: snapshotOf(s.sec, s.quote.exact),
        }),
        done: () => {
          setItems((list) =>
            list.some((x) => x.id === id) ? list : [...list, item],
          );
          if (!mine()) return;
          boxId.current = null;
          clearNative();
          setSel(null);
          opener.current = { el: null, mark: id };
          setPop({ t: "hl", id, edit: false });
          focusWant.current = "box";
        },
        fail,
      });
      return;
    }
    if (p.t === "bnew") {
      if (!text || !write) {
        setPop(null);
        focusWant.current = "back";
        return;
      }
      const id = (boxId.current ??= newId());
      const item: Item = {
        id,
        kind: "bnote",
        block: p.sec,
        sec: p.sec,
        start: null,
        end: null,
        status: "anchored",
        method: "section",
        quote: null,
        note: text,
        review: false,
        card: "",
        snapshot: null,
        everOn: false,
        lang,
        version,
        created: new Date().toISOString(),
      };
      wait();
      enqueue({
        wire: sectionNoteWire({
          write,
          id,
          version,
          sec: p.sec,
          note: text,
          snapshot: snapshotOf(p.sec, sectionLabel(p.sec)),
        }),
        done: () => {
          setItems((list) =>
            list.some((x) => x.id === id) ? list : [...list, item],
          );
          if (!mine()) return;
          boxId.current = null;
          setPop({ t: "bnote", id, edit: false });
          focusWant.current = "box";
        },
        fail,
      });
      return;
    }
    if (p.t !== "hl" && p.t !== "bnote") return;
    const it = now.current.items.find((x) => x.id === p.id);
    // Saving an empty section note deletes it (with its undo line).
    if (p.t === "bnote" && !text) {
      remove(p.id);
      return;
    }
    if (!it || it.note === text) {
      setPop({ ...p, edit: false });
      focusWant.current = "box";
      return;
    }
    wait();
    enqueue({
      wire: noteWire(p.id, text),
      done: () => {
        patchItem(p.id, { note: text });
        if (!mine()) return;
        setPop({ ...p, edit: false });
        focusWant.current = "box";
      },
      fail,
    });
  }, [
    draft,
    write,
    lang,
    version,
    enqueue,
    snapshotOf,
    sectionLabel,
    remove,
    patchItem,
  ]);
  const submitNote = lib ? saveNoteLib : saveNote;
  // The Library's box: its bookmark's label (edit, back to the box, save), its delete, a pick among overlaps.
  const labelEdit = useCallback(() => {
    const p = now.current.pop;
    if (p?.t !== "bm") return;
    setPop({ t: "bm", id: p.id, edit: true });
    focusWant.current = "field";
  }, []);
  const labelBox = useCallback(() => {
    const p = now.current.pop;
    if (p?.t !== "bm") return;
    setPop({ t: "bm", id: p.id, edit: false });
    focusWant.current = "box";
  }, []);
  const labelSave = useCallback(
    (label: string) => {
      const p = now.current.pop;
      if (p?.t !== "bm") return;
      setLabel(p.id, label);
      setPop({ t: "bm", id: p.id, edit: false });
      focusWant.current = "box";
    },
    [setLabel],
  );
  const deleteBox = useCallback(() => {
    const p = now.current.pop;
    if (p?.t === "bm") removeBookmarks([p.id]);
    else if (p?.t === "hl" || p?.t === "bnote") remove(p.id);
  }, [removeBookmarks, remove]);
  const pickMark = useCallback((id: string) => {
    // A pick swaps the box's content: focus goes into the box again.
    setPop({ t: "hl", id, edit: false });
    focusWant.current = "box";
  }, []);

  const deleteNote = useCallback(() => {
    const p = now.current.pop;
    if (!p) return;
    if (p.t === "bnote") {
      remove(p.id);
      return;
    }
    if (p.t !== "hl") return;
    const it = now.current.items.find((x) => x.id === p.id);
    if (!it) return;
    const before = it.note;
    setNote(p.id, "", before);
    setPop({ ...p, edit: false });
    focusWant.current = "box";
    if (before)
      showToast(
        {
          text: T.undo.noteOnly,
          undo: () => {
            setNote(p.id, before, "");
            setToast(null);
          },
        },
        true,
      );
  }, [remove, setNote, showToast]);

  const toggleReview = useCallback(() => {
    const p = now.current.pop;
    if (!p || p.t !== "hl") return;
    const it = now.current.items.find((x) => x.id === p.id);
    if (!it) return;
    const on = !it.review;
    const card: CardStatus = on ? "active" : "suspended";
    patchItem(p.id, { review: on, card, everOn: it.everOn || on });
    enqueue({
      wire: reviewWire(p.id, on),
      done: (r) =>
        patchItem(p.id, {
          review: !!r.review,
          ...(r.card === "active" || r.card === "suspended"
            ? { card: r.card, everOn: true }
            : {}),
        }),
      undo: () =>
        patchItem(p.id, {
          review: it.review,
          card: it.card,
          everOn: it.everOn,
        }),
    });
  }, [enqueue, patchItem]);

  const startEdit = useCallback(() => {
    const p = now.current.pop;
    if (!p || (p.t !== "hl" && p.t !== "bnote")) return;
    const it = now.current.items.find((x) => x.id === p.id);
    setDraft(it?.note ?? "");
    setPop({ ...p, edit: true });
    focusWant.current = "field";
  }, []);

  const cancelEdit = useCallback(() => {
    const p = now.current.pop;
    if (!p) return;
    if (p.t === "new") {
      // Cancel closes the editor and returns to the bar.
      setPop(null);
      return;
    }
    if (p.t === "bnew") {
      setPop(null);
      focusWant.current = "back";
      return;
    }
    if (p.t === "hl" || p.t === "bnote") {
      setPop({ ...p, edit: false });
      focusWant.current = "box";
    }
  }, []);

  // ---- landing on a mark, from a list ---------------------------------------------------------
  /** Scroll so the element sits 32 px under the top bar (not a gesture: the chrome stays as it is). */
  const scrollUnderBar = useCallback(
    (el: Element) => {
      window.dispatchEvent(new Event("reader:quiet"));
      const bar =
        document.querySelector(PG.top)?.getBoundingClientRect().bottom ?? 59;
      const y = el.getBoundingClientRect().top + window.scrollY - (bar + 32);
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    },
    [PG],
  );

  const land = useCallback(
    (it: ListItem) => {
      if (!host) return;
      const sec = it.sec;
      const block = sec
        ? host.root.querySelector<HTMLElement>(
            `[data-block="${CSS.escape(sec)}"]`,
          )
        : null;
      if (it.kind === "hl" && it.status === "anchored") {
        const mark = host.root.querySelector<HTMLElement>(
          `mark.an-m[data-an~="${CSS.escape(it.id)}"]`,
        );
        if (mark) {
          // A highlight inside a closed fold: open the fold, then land on the mark.
          const fold = mark.closest("details");
          if (fold && !fold.open) fold.open = true;
          scrollUnderBar(mark);
          setPop(null);
          setSel(null);
          setLanded(it.id);
          return;
        }
      }
      if (it.status === "block" && sec) {
        if (block) scrollUnderBar(block);
        setSel(null);
        setLanded(null);
        opener.current = { el: null, mark: null };
        setPop({ t: "changed", sec });
        focusWant.current = "box";
        return;
      }
      if (block) {
        scrollUnderBar(block);
        return;
      }
      // A position (or a bookmark with no section to land on): at its fraction.
      if (it.frac > 0) {
        window.dispatchEvent(new Event("reader:quiet"));
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({
          top: Math.max(0, it.frac * max),
          behavior: "instant",
        });
      }
    },
    [host, scrollUnderBar],
  );

  const goTo = useCallback(
    (it: ListItem) => {
      bridge?.close();
      setEditLabel(null);
      if (it.status === "other") {
        // Another language's mark: that chapter variant, at the mark's own section.
        const o = now.current.others.find((x) => x.id === it.id);
        const b = now.current.obms.find((x) => x.id === it.id);
        const section = o ? (o.sec ?? o.block) : (b?.block ?? b?.at ?? null);
        router.push(
          readerHref(target, { lang: it.lang, section, note: it.id }),
        );
        return;
      }
      land(it);
    },
    [bridge, land, router, target],
  );

  /** Delete from a list: waits out the undo line like the popover's delete, and never moves focus. */
  const deleteFromList = useCallback(
    (it: ListItem) => {
      if (it.kind === "bm") {
        scheduleDelete([it.id], T.bm.removed, removeBookmarkWire);
        return;
      }
      const cur = now.current;
      const n: (ReaderNote & { everOn?: boolean }) | undefined =
        cur.items.find((x) => x.id === it.id) ??
        cur.orph.find((x) => x.id === it.id) ??
        cur.others.find((x) => x.id === it.id);
      scheduleDelete(
        [it.id],
        it.kind === "bnote"
          ? T.undo.noteOnly
          : undoText({
              note: it.note,
              card: (n ? n.card !== "" || !!n.everOn : false) || it.card !== "",
            }),
        removeWire,
      );
    },
    [scheduleDelete],
  );

  // ---- P63-fk.S11: a row of the Library's Notes sheet (the frame's `MarkRow`, frame.md F65, F91) -------------
  // The row is its own undo line: deleting hides the mark everywhere at once (out of the counts) but keeps its row
  // listed, saying what went; the delete is sent once its ten seconds run out, or on leaving the page; Undo within
  // them sends nothing. A send that fails brings the mark back, and the row says so (`MarkRow`'s failed line).
  const rowItem = useCallback((id: string): ListItem | undefined => {
    const g = groupsRef.current;
    return [...g.items, ...g.orphans, ...g.other.flatMap((x) => x.items)].find(
      (x) => x.id === id,
    );
  }, []);
  const rowStop = useCallback((id: string) => {
    rowSends.current.delete(id);
    setRowWaiting((o) => {
      if (!o.has(id)) return o;
      const n = new Set(o);
      n.delete(id);
      return n;
    });
  }, []);
  const rowDelete = useCallback(
    (id: string) => {
      const it = rowItem(id);
      if (!it) return;
      let ok = () => {};
      let no = () => {};
      const settled = new Promise<void>((resolve, reject) => {
        ok = resolve;
        no = () => reject(new Error("not deleted"));
      });
      settled.catch(() => {});
      rowSends.current.set(id, settled);
      setGone([id], true);
      setRowWaiting((o) => new Set(o).add(id));
      clock.current.start(`row:${id}`, () =>
        enqueue({
          wire: it.kind === "bm" ? removeBookmarkWire(id) : removeWire(id),
          done: () => {
            rowStop(id);
            dropMarks([id]);
            ok();
          },
          undo: () => setGone([id], false),
          fail: () => {
            rowStop(id);
            setGone([id], false);
            no();
          },
        }),
      );
    },
    [rowItem, rowStop, setGone, enqueue, dropMarks],
  );
  const rowUndo = useCallback(
    (id: string) => {
      clock.current.undo(`row:${id}`);
      rowStop(id);
      setGone([id], false);
    },
    [rowStop, setGone],
  );
  const rowGone = useCallback((id: string): Promise<unknown> => {
    const settled = rowSends.current.get(id) ?? Promise.resolve();
    clock.current.fire(`row:${id}`);
    return settled;
  }, []);

  // `?note=<id>` (a row in the book's list, or in another language): land on the mark once
  // the page is painted, again when the fonts settle if the reader has not moved.
  const arrived = useRef(false);
  useEffect(() => {
    if (!host || arrived.current) return;
    arrived.current = true;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("note");
    if (!id) return;
    const it = [...groupsRef.current.items, ...groupsRef.current.orphans].find(
      (x) => x.id === id,
    );
    if (it) {
      land(it);
      const at = window.scrollY;
      document.fonts?.ready
        .then(() => {
          if (Math.abs(window.scrollY - at) <= 2) land(it);
        })
        .catch(() => {});
    }
    // The mark is reached; the address no longer needs to ask for it.
    window.setTimeout(() => {
      const u = new URL(window.location.href);
      u.searchParams.delete("note");
      window.history.replaceState(
        window.history.state,
        "",
        `${u.pathname}${u.search}${u.hash}`,
      );
    }, 1200);
  }, [host, land]);

  // ---- reading a selection -------------------------------------------------------------------
  const read = useCallback(
    (pointer: boolean) => {
      if (!host) return;
      const s = window.getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) return;
      const first = s.getRangeAt(0);
      const last = s.getRangeAt(s.rangeCount - 1);
      const sc = first.startContainer;
      const el = sc.nodeType === 1 ? (sc as Element) : sc.parentElement;
      if (!el || !host.scope.contains(el)) return;
      if (el.closest(`${PG.own}, ${PG.end}`)) return;
      let c: Captured | NoneSel | null;
      if (plain) {
        // A plain Markdown document: nothing can be highlighted, anywhere in it.
        c = { mode: "none" };
      } else if (!host.root.contains(sc)) {
        if (!el.closest(PG.head)) return;
        c = { mode: "refuse" };
      } else {
        c = capture(
          host.root as unknown as ANode,
          {
            startContainer: first.startContainer as unknown as ANode,
            startOffset: first.startOffset,
            endContainer: last.endContainer as unknown as ANode,
            endOffset: last.endOffset,
          },
          sections,
        );
      }
      if (!c) return;
      const o = now.current.sel;
      const same =
        o &&
        o.mode === c.mode &&
        (o.mode === "passage" || o.mode === "block"
          ? (c.mode === "passage" || c.mode === "block") &&
            o.sec === c.sec &&
            (o.mode !== "passage" ||
              (c.mode === "passage" && o.s === c.s && o.e === c.e))
          : true);
      if (same && o.pointer === pointer) return;
      selSeq.current += 1;
      setSel({
        ...c,
        id: selSeq.current,
        pointer: pointer && c.mode === "passage",
      });
      setPop(null);
      setSave(false);
      // A mouse selection of a passage is replaced by the pending paint; touch and keyboard
      // keep the native selection (its handles) until an action is pressed.
      if (pointer && c.mode === "passage") s.removeAllRanges();
    },
    [host, sections, plain, PG],
  );

  // ---- the page's events ---------------------------------------------------------------------
  useEffect(() => {
    if (!host) return;
    // The old article, or the Library's text column (P63-fk.S11): a press anywhere in it closes what is open.
    const art = host.scope;
    let selT = 0;
    const inFloat = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest(PG.own);
    let pointerUpAt = 0;
    const onSelChange = () => {
      // A mouse selection is read once, on mouseup; the selectionchange events that the
      // browser queues around the release must not turn it into a touch-style read.
      if (mouseDown.current || Date.now() - pointerUpAt < 400) return;
      const a = document.activeElement;
      if (a && a.closest(PG.own)) return;
      window.clearTimeout(selT);
      selT = window.setTimeout(() => read(false), 350);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 0) mouseDown.current = true;
      const t = e.target as Element | null;
      if (!t || !t.closest || inFloat(t)) return;
      // A highlight reached from a list stays shown open until the reader touches the page.
      setLanded(null);
      const mark = t.closest("mark.an-m");
      if (mark && art.contains(mark)) {
        const ids = (mark.getAttribute("data-an") ?? "")
          .split(" ")
          .filter(Boolean);
        opener.current = { el: null, mark: ids[0] ?? null };
      } else {
        opener.current = { el: t.closest<HTMLElement>(FOCUSABLE), mark: null };
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        mouseDown.current = false;
        pointerUpAt = Date.now();
        window.clearTimeout(selT);
        selT = window.setTimeout(() => read(true), 10);
      }
    };
    const onTouchEnd = () => {
      window.clearTimeout(selT);
      selT = window.setTimeout(() => read(false), 10);
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || inFloat(t)) return;
      if (t.matches?.("mark.an-m[data-an-key]")) {
        const key = (t.getAttribute("data-an-key") ?? "").split(" ")[0];
        opener.current = { el: t, mark: key || null };
      } else opener.current = { el: t, mark: null };
    };
    // A tap on a highlight opens it; a tap anywhere else closes an open bar or popover
    // first, and only the next tap toggles the chrome.
    const onArticleClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest || inFloat(t)) return;
      const mark = t.closest("mark.an-m");
      if (mark && !t.closest("a") && !window.getSelection()?.toString()) {
        const ids = (mark.getAttribute("data-an") ?? "")
          .split(" ")
          .filter(Boolean);
        if (ids.length) {
          e.stopPropagation();
          openMarks(ids);
          return;
        }
      }
      const { sel: s, pop: p, save: sv } = now.current;
      if (s || p || sv) {
        closeAll(false);
        if (!t.closest(TAP_IGNORE)) e.stopPropagation();
      }
    };
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest || inFloat(t) || art.contains(t)) return;
      const { sel: s, pop: p, save: sv } = now.current;
      if (s || p || sv) closeAll(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector(PG.sheet)) return;
      const k = e.key;
      const { sel: s, pop: p, save: sv } = now.current;
      // Round 02: Enter or Space on a highlight's stop opens what a tap there opens.
      if (
        (k === "Enter" || k === " ") &&
        t?.matches?.("mark.an-m[data-an-key]")
      ) {
        const ids = (t.getAttribute("data-an") ?? "")
          .split(" ")
          .filter(Boolean);
        if (ids.length) {
          e.preventDefault();
          const key = (t.getAttribute("data-an-key") ?? "").split(" ")[0];
          opener.current = { el: t, mark: key || null };
          openMarks(ids);
        }
        return;
      }
      if ((k === "h" || k === "H") && s?.mode === "passage" && !p) {
        e.preventDefault();
        highlight();
      } else if ((k === "n" || k === "N") && s?.mode === "passage" && !p) {
        e.preventDefault();
        noteSel();
      } else if (k === "Escape" && (p || s || sv)) {
        e.preventDefault();
        if (p) closePop();
        else closeAll(true);
        clearNative();
      }
    };
    // Closing a fold while a popover on a highlight inside it is open closes the popover;
    // focus goes to the summary.
    const onToggle = (e: Event) => {
      const d = e.target as HTMLDetailsElement | null;
      if (!d || d.tagName !== "DETAILS" || d.open) return;
      const p = now.current.pop;
      const ids = p?.t === "hl" ? [p.id] : p?.t === "choose" ? p.ids : [];
      if (!ids.length) return;
      const inside = ids.some((id) =>
        d.querySelector(`mark.an-m[data-an~="${CSS.escape(id)}"]`),
      );
      if (!inside) return;
      setPop(null);
      d.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    };
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick, true);
    art.addEventListener("click", onArticleClick, true);
    art.addEventListener("touchend", onTouchEnd, { passive: true });
    art.addEventListener("toggle", onToggle, true);
    return () => {
      window.clearTimeout(selT);
      document.removeEventListener("selectionchange", onSelChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick, true);
      art.removeEventListener("click", onArticleClick, true);
      art.removeEventListener("touchend", onTouchEnd);
      art.removeEventListener("toggle", onToggle, true);
    };
  }, [host, read, openMarks, closeAll, closePop, highlight, noteSel, PG]);

  // ---- the floating box: where it hangs ---------------------------------------------------
  const kind: "bar" | "pop" | "save" | null = pop
    ? "pop"
    : save && sel
      ? "save"
      : sel
        ? "bar"
        : null;
  const sig = kind
    ? JSON.stringify([
        kind,
        pop,
        sel && sel.mode === "passage" ? [sel.sec, sel.s, sel.e] : sel?.mode,
        sel && sel.mode === "block" ? sel.sec : null,
      ])
    : null;

  const layout = useCallback(() => {
    const fl = floatRef.current;
    if (!kind || !sig) revealed.current = null; // closed: the next opening may reveal again
    if (!host || !fl || !kind || !sig) return;
    const { art, root } = host;
    const rects: DOMRect[] = [];
    const take = (els: Iterable<Element>) => {
      for (const el of els)
        for (const r of Array.from(el.getClientRects()))
          if (r.width || r.height) rects.push(r);
    };
    const marks = (ids: string[]) =>
      Array.from(root.querySelectorAll("mark.an-m")).filter((m) => {
        const on = (m.getAttribute("data-an") ?? "").split(" ");
        return ids.every((id) => on.includes(id));
      });
    const block = (sec: string) => {
      const el = root.querySelector(`[data-block="${CSS.escape(sec)}"]`);
      if (el) take([el]);
    };
    const native = () => {
      const s = window.getSelection();
      if (s && s.rangeCount)
        for (const r of Array.from(s.getRangeAt(0).getClientRects()))
          if (r.width || r.height) rects.push(r);
    };
    const pend = () => take(root.querySelectorAll('mark[data-an="pending"]'));
    if (pop) {
      if (pop.t === "hl") {
        take(marks([pop.id]));
        if (!rects.length) {
          const it = items.find((x) => x.id === pop.id);
          if (it?.sec) block(it.sec);
        }
      } else if (pop.t === "choose") take(marks(pop.ids));
      else if (pop.t === "new") pend();
      else if (pop.t === "bnew") block(pop.sec);
      else if (pop.t === "changed" || pop.t === "other") block(pop.sec);
      else if (pop.t === "bm") {
        const b = bms.find((x) => x.id === pop.id);
        if (b?.at) block(b.at);
      } else {
        const it = items.find((x) => x.id === pop.id);
        if (it) block(it.sec ?? it.block);
      }
    } else if (sel) {
      if (sel.mode === "passage") {
        pend();
        if (!rects.length) native();
      } else if (sel.mode === "block") block(sel.sec);
      else {
        native();
        if (!rects.length) {
          const t = host.scope.querySelector(PG.title);
          if (t) take([t]);
        }
      }
    }
    if (!rects.length) return;
    const ar = art.getBoundingClientRect();
    const colEl = art.querySelector("[data-reader-prose]") ?? root;
    const cr = colEl.getBoundingClientRect();
    const firstR = rects[0];
    const lastR = rects[rects.length - 1];
    const top = firstR.top - ar.top;
    const bottom = lastR.bottom - ar.top;
    const cx = (lastR.left + lastR.right) / 2 - ar.left;
    const colL = cr.left - ar.left;
    const colR = cr.right - ar.left;
    const colW = colR - colL;
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const want = kind === "pop" ? 24 * rem : kind === "save" ? 30 * rem : 0;
    const W = want ? Math.min(want, colW) : Math.min(fl.offsetWidth, colW);
    const left = Math.max(colL, Math.min(cx - W / 2, colR - W));
    const h = fl.offsetHeight;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const gap = kind === "bar" && coarse ? 28 : 8;
    // The visible band: 8 px under the top bar to 8 px above the chapter bar (64 px).
    const topBar =
      document.querySelector(PG.top)?.getBoundingClientRect().bottom ?? 59;
    const loose = !lib && !!host.shell.classList.contains("rd-loose");
    const bandTop = Math.max(0, topBar) - ar.top + 8;
    const bandBottom = window.innerHeight - (loose ? 8 : 64) - ar.top - 8;
    let t = bottom + gap;
    if (kind === "bar" && t + h > bandBottom && top - gap - h >= bandTop)
      t = top - gap - h;
    let next: Placed = {
      sig,
      left: Math.round(left),
      top: Math.round(t),
      width: want ? Math.round(W) : null,
      maxW: Math.floor(colW),
    };
    if (lib) {
      // P63-fk.S11 (`Annotations.dc.html` `float()`): 8 px under the last line, starting where that line starts,
      // never out of the column; the box's 26em and Sign in to save's 30em are the sheet's (`marks-float`).
      const at = floatAt({
        lineLeft: lastR.left - ar.left,
        lineBottom: bottom,
        colLeft: colL,
        colWidth: colW,
        width: fl.offsetWidth,
      });
      t = at.top;
      next = {
        sig,
        left: at.left,
        top: at.top,
        width: null,
        maxW: Math.floor(colW),
      };
    }
    setPlaced((o) =>
      o &&
      o.sig === next.sig &&
      Math.abs(o.left - next.left) <= 1 &&
      Math.abs(o.top - next.top) <= 1 &&
      o.width === next.width &&
      o.maxW === next.maxW
        ? o
        : next,
    );
    // A popover that opens low scrolls the page just enough, never its anchor out of view.
    // Measured only once the box sits at its placed width, so its height is the real one.
    if (
      revealed.current !== sig &&
      kind !== "bar" &&
      fl.dataset.placed === "1"
    ) {
      revealed.current = sig;
      let dy = 0;
      if (t + h > bandBottom)
        dy = Math.min(t + h - bandBottom, Math.max(0, top - bandTop));
      else if (t < bandTop) dy = Math.max(t - bandTop, top - bandTop - 40);
      if (Math.abs(dy) >= 2) {
        window.dispatchEvent(new Event("reader:quiet"));
        window.scrollBy(0, dy);
      }
    }
  }, [host, kind, sig, pop, sel, items, bms, lib, PG]);

  useLayoutEffect(() => {
    layout();
  });

  useEffect(() => {
    if (!host || !kind) return;
    const again = () => layout();
    const ro = new ResizeObserver(again);
    ro.observe(host.art);
    window.addEventListener("resize", again);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", again);
    };
  }, [host, kind, layout]);

  // Focus: the box in view mode, the field in edit mode, once the box is placed; back to
  // the opener when it closes.
  const isPlaced = !!placed && placed.sig === sig;
  useLayoutEffect(() => {
    const want = focusWant.current;
    if (!want) return;
    if (want === "back") {
      if (pop) return;
      focusWant.current = null;
      restoreFocus();
      return;
    }
    if (!isPlaced) return;
    const f = fieldRef.current ?? labelRef.current;
    if (want === "field" && f) {
      f.focus({ preventScroll: true });
      f.setSelectionRange(f.value.length, f.value.length);
      focusWant.current = null;
    } else if (want === "box" && boxRef.current) {
      boxRef.current.focus({ preventScroll: true });
      focusWant.current = null;
    }
  });

  // ---- what the floating box says ------------------------------------------------------------
  const field = useId();
  const hintId = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const byId = (id: string) => items.find((x) => x.id === id && !x.gone);
  const blockWord = (sec: string | null): "section" | "diagram" =>
    sec && meta.get(sec)?.word === "Diagram" ? "diagram" : "section";
  const hold = (e: ReactMouseEvent) => {
    // The bar never takes the selection away: pressing it keeps the text selected.
    if ((e.target as Element).closest("button")) e.preventDefault();
  };

  let body: ReactNode = null;
  if (lib) body = null;
  else if (kind === "bar" && sel) body = bar(sel);
  else if (kind === "save")
    body = (
      <SignInToSave
        raised
        what={READER.save.whats[saveWhat]}
        place={place}
        signInHref={signInHref}
        onDismiss={() => {
          closeAll(true);
          clearNative();
        }}
      />
    );
  else if (kind === "pop" && pop) body = popover(pop);

  function bar(s: Sel): ReactNode {
    if (s.mode === "passage") {
      const m = meta.get(s.sec);
      return (
        <div
          className="an-box an-box--bar"
          role="toolbar"
          aria-label={T.bar.selected}
          onMouseDown={hold}
        >
          {s.clipped ? (
            <p className="an-box__msg">
              {T.bar.clippedLead}
              <b lang={sectionLang(s.sec)}>{m ? sectionLabel(s.sec) : ""}</b>
              {T.bar.clippedTail}
            </p>
          ) : null}
          <button
            type="button"
            className="rd-btn rd-btn--quiet an-bar__btn"
            onClick={highlight}
          >
            {T.bar.highlight}
          </button>
          <span className="an-place__sep" aria-hidden="true" />
          <button
            type="button"
            className="rd-btn rd-btn--quiet an-bar__btn"
            onClick={noteSel}
          >
            {T.bar.addNote}
          </button>
        </div>
      );
    }
    if (s.mode === "block") {
      const m: NoteSection | undefined = meta.get(s.sec);
      return (
        <div
          className="an-box an-box--bar"
          role="toolbar"
          aria-label={T.bar.blockLabel(m?.word ?? "Section")}
          onMouseDown={hold}
        >
          <p className="an-box__msg">
            {m?.word ?? "Section"} ·{" "}
            <b lang={m?.lang ?? lang}>{m?.title ?? ""}</b>
          </p>
          <button
            type="button"
            className="rd-btn rd-btn--quiet an-bar__btn"
            onClick={() => blockNote(s.sec)}
          >
            {T.bar.addNote}
          </button>
          <span className="an-place__sep" aria-hidden="true" />
          <BookmarkButton
            on={bookmarked(s.sec)}
            onClick={() => toggleSection(s.sec, "bar")}
          />
        </div>
      );
    }
    if (s.mode === "none") {
      return (
        <div
          className="an-box an-box--bar"
          role="toolbar"
          aria-label={T.bar.selected}
          onMouseDown={hold}
        >
          <p className="an-box__msg">{T.bm.plain}</p>
          <BookmarkButton
            on={positionOn}
            position
            onClick={() => togglePosition("bar")}
          />
        </div>
      );
    }
    return (
      <div
        className="an-box an-box--bar"
        role="toolbar"
        aria-label={T.bar.selected}
        onMouseDown={hold}
      >
        <p className="an-box__msg an-box__msg--only">{T.bar.refuse}</p>
      </div>
    );
  }

  function swap(labels: [string, string, string]): ReactNode {
    // Add note, Edit note and Save note share one cell, so the button never resizes.
    return (
      <span className="an-btn-w">
        <span>{labels[0]}</span>
        <span aria-hidden="true">{labels[1]}</span>
        <span aria-hidden="true">{labels[2]}</span>
      </span>
    );
  }

  /** Four labels share the cell when a button changes in place (Add / Edit / Save label). */
  function swap4(labels: [string, string, string]): ReactNode {
    return swap(labels);
  }

  /** The quotes and notes of Text changed and the other language: unpainted, each with Delete. */
  function markList(
    list: readonly (ReaderNote & { gone?: boolean })[],
  ): ReactNode {
    return (
      <ul className="an-box__list">
        {list.map((x) => (
          <li key={x.id} className="an-box__item">
            {x.quote ? (
              <p className="an-box__quote" lang={x.lang}>
                {x.quote.exact}
              </p>
            ) : null}
            {x.note ? (
              <p
                className="an-box__note an-box__note--item"
                lang={langOf(x.note, x.lang)}
              >
                {x.note}
              </p>
            ) : null}
            <div className="an-box__actions">
              <button
                type="button"
                className="rd-btn rd-btn--quiet an-del"
                aria-label={
                  (x.kind === "bnote"
                    ? T.aria.deleteNote
                    : T.aria.deleteHighlight) +
                  clip(x.quote?.exact ?? x.note, 60)
                }
                onClick={() => remove(x.id)}
              >
                {T.changed.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function editor(label: string, existing: boolean): ReactNode {
    const count = countLine(draft.length);
    return (
      <>
        <div className="an-ed">
          <label className="an-ed__label" htmlFor={field}>
            {label}
          </label>
          <textarea
            id={field}
            ref={fieldRef}
            className="an-ed__field"
            lang={langOf(draft, lang)}
            value={draft}
            maxLength={NOTE_MAX}
            placeholder={T.pop.placeholder}
            aria-describedby={hintId}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX))}
            onKeyDown={(e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveNote();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                cancelEdit();
              }
            }}
          />
          <p className="an-ed__hint" id={hintId}>
            <span className="an-ed__keys">{T.pop.hint}</span>
            {count ? (
              <span className="an-ed__count" aria-live="polite">
                {count}
              </span>
            ) : null}
          </p>
        </div>
        <div className="an-box__actions">
          <button
            type="button"
            className="rd-btn rd-btn--primary"
            onClick={saveNote}
          >
            {swap([T.pop.saveNote, T.pop.editNote, T.pop.addNote])}
          </button>
          <button
            type="button"
            className="rd-btn rd-btn--quiet"
            onClick={cancelEdit}
          >
            {T.pop.cancel}
          </button>
          {existing ? (
            <button
              type="button"
              className="rd-btn rd-btn--quiet an-del an-push"
              onClick={deleteNote}
            >
              {T.pop.deleteNote}
            </button>
          ) : null}
        </div>
      </>
    );
  }

  function popover(p: Pop): ReactNode {
    let k = "";
    let kLang: { name: string; lang: string } | null = null;
    let dialog = "";
    let where = "";
    let whereLang = lang;
    let content: ReactNode = null;
    if (p.t === "choose") {
      const picks = p.ids.map(byId).filter((x): x is Item => !!x);
      k = T.pop.kindCount(picks.length);
      dialog = T.pop.dialogChoose;
      content = (
        <>
          <p className="an-box__fine">{T.pop.overlap}</p>
          <ul className="an-box__list">
            {picks.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className="an-pick"
                  onClick={() => {
                    // A pick swaps the box's content: focus goes into the box again.
                    setPop({ t: "hl", id: x.id, edit: false });
                    focusWant.current = "box";
                  }}
                >
                  <span className="an-pick__q" lang={x.lang}>
                    <mark>
                      {clip(shown.get(x.id) ?? x.quote?.exact ?? "", 90)}
                    </mark>
                  </span>
                  <span className="an-pick__m">
                    {x.note ? T.pop.kindHighlightNote : T.pop.kindHighlight}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      );
    } else if (p.t === "new") {
      k = T.pop.kindNew;
      dialog = T.pop.dialogNew;
      where = sel && sel.mode === "passage" ? sectionLabel(sel.sec) : "";
      if (sel && sel.mode === "passage") whereLang = sectionLang(sel.sec);
      content = editor(T.pop.fieldNew, false);
    } else if (p.t === "bnew") {
      const w = blockWord(p.sec);
      k = T.pop.kindBlock(w);
      dialog = k;
      where = sectionLabel(p.sec);
      whereLang = sectionLang(p.sec);
      content = editor(k, false);
    } else if (p.t === "changed") {
      const list = items.filter(
        (x) => !x.gone && x.status === "block" && (x.sec ?? x.block) === p.sec,
      );
      if (!list.length) return null;
      k = T.changed.kind;
      dialog = T.changed.kind;
      where = sectionLabel(p.sec);
      whereLang = sectionLang(p.sec);
      // One block per version the marks were made on (usually one).
      const versions = [...new Set(list.map((x) => x.version))].sort(
        (a, b) => a - b,
      );
      content = (
        <>
          {versions.map((v) => {
            const group = list.filter((x) => x.version === v);
            return (
              <div key={v} className="an-box__grp">
                <p className="an-box__fine">
                  {(group.length === 1
                    ? T.changed.leadOne
                    : T.changed.leadMany)(
                    names[group[0].lang] ?? group[0].lang,
                    v,
                  )}
                </p>
                {markList(group)}
                <div className="an-box__actions">
                  <Link
                    className="an-link"
                    href={readerHref(target, {
                      lang: group[0].lang,
                      version: v,
                      section: p.sec,
                    })}
                    prefetch={false}
                  >
                    {T.changed.read(v)}
                  </Link>
                </div>
              </div>
            );
          })}
        </>
      );
    } else if (p.t === "other") {
      const list = others.filter(
        (x) => !x.gone && x.at === p.sec && x.lang === p.lang,
      );
      if (!list.length) return null;
      const name = names[p.lang] ?? p.lang;
      k = `${marksWord(list)} in `;
      kLang = { name, lang: p.lang };
      dialog = `${marksWord(list)} in ${name}`;
      where = sectionLabel(p.sec);
      whereLang = sectionLang(p.sec);
      content = (
        <>
          <p className="an-box__fine">
            {(list.length === 1 ? T.other.leadOne : T.other.leadMany)(
              names[lang] ?? lang,
            )}
          </p>
          {markList(list)}
          <div className="an-box__actions">
            <Link
              className="an-link"
              href={readerHref(target, {
                lang: p.lang,
                section: list[0].sec ?? list[0].block,
              })}
              prefetch={false}
            >
              {T.other.readPre}
              <span lang={p.lang}>{name}</span> →
            </Link>
          </div>
        </>
      );
    } else if (p.t === "bm") {
      const b = bms.find((x) => x.id === p.id && !x.gone);
      if (!b) return null;
      k = T.bm.kind;
      dialog = T.bm.kind;
      where = b.at ? sectionLabel(b.at) : "";
      whereLang = sectionLang(b.at);
      content = p.edit ? (
        <>
          <div className="an-ed">
            <label className="an-ed__label" htmlFor={field}>
              {T.bm.label}
            </label>
            <input
              id={field}
              ref={labelRef}
              type="text"
              className="an-ed__field an-ed__field--line"
              maxLength={120}
              placeholder={T.bm.placeholder}
              defaultValue={b.label}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setLabel(b.id, labelRef.current?.value ?? "");
                  setPop({ t: "bm", id: b.id, edit: false });
                  focusWant.current = "box";
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  setPop({ t: "bm", id: b.id, edit: false });
                  focusWant.current = "box";
                }
              }}
            />
          </div>
          <div className="an-box__actions">
            <button
              type="button"
              className="rd-btn rd-btn--primary"
              onClick={() => {
                setLabel(b.id, labelRef.current?.value ?? "");
                setPop({ t: "bm", id: b.id, edit: false });
                focusWant.current = "box";
              }}
            >
              {swap4([T.bm.saveLabel, T.bm.editLabel, T.bm.addLabel])}
            </button>
            <button
              type="button"
              className="rd-btn rd-btn--quiet"
              onClick={() => {
                setPop({ t: "bm", id: b.id, edit: false });
                focusWant.current = "box";
              }}
            >
              {T.pop.cancel}
            </button>
          </div>
        </>
      ) : (
        <>
          {b.label ? (
            <p
              className="an-box__note an-box__label"
              lang={langOf(b.label, "en")}
            >
              {b.label}
            </p>
          ) : (
            <p className="an-box__fine">{T.bm.noLabel}</p>
          )}
          <div className="an-box__actions">
            <button
              type="button"
              className="rd-btn rd-btn--secondary"
              onClick={() => {
                setPop({ t: "bm", id: b.id, edit: true });
                focusWant.current = "field";
              }}
            >
              {swap4(
                b.label
                  ? [T.bm.editLabel, T.bm.saveLabel, T.bm.addLabel]
                  : [T.bm.addLabel, T.bm.editLabel, T.bm.saveLabel],
              )}
            </button>
            <button
              type="button"
              className="rd-btn rd-btn--quiet an-del an-push"
              onClick={() => removeBookmarks([b.id])}
            >
              {T.bm.remove}
            </button>
          </div>
        </>
      );
    } else {
      const it = byId(p.id);
      if (!it) return null;
      const isHl = p.t === "hl";
      const w = blockWord(it.sec ?? it.block);
      where = sectionLabel(it.sec ?? it.block);
      whereLang = sectionLang(it.sec ?? it.block);
      if (isHl) {
        k = it.note ? T.pop.kindHighlightNote : T.pop.kindHighlight;
        dialog = T.pop.kindHighlight;
      } else {
        k = T.pop.kindBlock(w);
        dialog = k;
      }
      if (p.edit) {
        content = editor(
          isHl ? (it.note ? T.pop.field : T.pop.fieldNew) : T.pop.kindBlock(w),
          !!it.note,
        );
      } else {
        const card = it.review || it.everOn;
        const line = isHl ? deleteLine({ note: it.note, card }) : null;
        content = (
          <>
            {it.note ? (
              <>
                <p className="an-box__note" lang={langOf(it.note, lang)}>
                  {it.note}
                </p>
                <div className="an-box__actions">
                  <button
                    type="button"
                    className="rd-btn rd-btn--secondary"
                    onClick={startEdit}
                  >
                    {swap([T.pop.editNote, T.pop.saveNote, T.pop.addNote])}
                  </button>
                </div>
              </>
            ) : (
              <div className="an-box__actions">
                <button
                  type="button"
                  className="rd-btn rd-btn--secondary"
                  onClick={startEdit}
                >
                  {swap([T.pop.addNote, T.pop.editNote, T.pop.saveNote])}
                </button>
              </div>
            )}
            {isHl ? (
              <>
                <hr className="an-box__rule" />
                <button
                  type="button"
                  className="an-rev"
                  role="switch"
                  aria-checked={it.review}
                  onClick={toggleReview}
                >
                  <span className="an-rev__track" aria-hidden="true">
                    <span className="an-rev__thumb" />
                  </span>
                  <span className="an-rev__label">
                    {T.pop.review} · <b>{it.review ? T.pop.on : T.pop.off}</b>
                  </span>
                  <span className="an-rev__sub">
                    {reviewLine(it.review, it.everOn)}
                  </span>
                </button>
              </>
            ) : null}
            <hr className="an-box__rule" />
            <div className="an-box__actions an-box__actions--split">
              <button
                type="button"
                className="rd-btn rd-btn--quiet an-del"
                onClick={() => remove(it.id)}
              >
                {isHl ? T.pop.deleteHighlight : T.pop.deleteNote}
              </button>
              {line ? <span className="an-box__fine">{line}</span> : null}
            </div>
          </>
        );
      }
    }
    return (
      <div
        ref={boxRef}
        className="an-box an-pop"
        role="dialog"
        aria-label={dialog}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (
            e.key === "Escape" &&
            !(e.target as Element).closest("textarea, input")
          ) {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            closePop();
          }
        }}
      >
        <div className="an-box__head">
          <p className="an-box__k">
            {k}
            {kLang ? <span lang={kLang.lang}>{kLang.name}</span> : null}
          </p>
          <button
            type="button"
            className="rd-btn rd-btn--quiet an-box__x"
            onClick={closePop}
          >
            {T.pop.close}
          </button>
        </div>
        {where ? (
          <p className="an-box__where" lang={whereLang}>
            {where}
          </p>
        ) : null}
        {content}
      </div>
    );
  }

  // ---- the place bar ---------------------------------------------------------------------------
  const placeUp =
    !!host &&
    !bridge?.sheetOpen &&
    !bridge?.pillUp &&
    !sel &&
    !pop &&
    !toast &&
    !save &&
    !slotSave &&
    !endSeen &&
    (plain ? true : !!blk);
  const placeSec = !plain && blk && look.has(blk) ? blk : null;

  // ---- P63-fk.S11: the Library's look ------------------------------------------------------------------------
  const W = READER_MARKS;
  const boxKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const p = now.current.pop;
    if (!p) return;
    // Escape leaves the field first (a new mark's box returns to the bar), then closes the box.
    if (p.t === "bm" && p.edit) {
      setPop({ ...p, edit: false });
      focusWant.current = "box";
    } else if (
      p.t === "new" ||
      p.t === "bnew" ||
      ((p.t === "hl" || p.t === "bnote") && p.edit)
    )
      cancelEdit();
    else closePop();
  };

  /** What the box of a mark says, by what it is about (data only; `libBox` wires it). */
  function libBoxSpec(
    p: Pop,
  ): Omit<
    MarkBoxProps,
    | "fieldId"
    | "hintId"
    | "boxRef"
    | "fieldRef"
    | "labelRef"
    | "draft"
    | "send"
    | `on${string}`
  > | null {
    const at = (sec: string | null) => ({
      where: sectionLabel(sec),
      whereLang: sectionLang(sec),
    });
    if (p.t === "choose") {
      const picks: BoxPick[] = p.ids
        .map(byId)
        .filter((x): x is Item => !!x)
        .map((x) => ({
          id: x.id,
          quote: pickQuote(shown.get(x.id) ?? x.quote?.exact ?? ""),
          lang: x.lang,
          paint: x.note
            ? `${LIBRARY_PAINT.mark} ${LIBRARY_PAINT.note}`
            : LIBRARY_PAINT.mark,
          word: boxTitle("highlight", { note: x.note }),
        }));
      const title = boxTitle("choose", { n: picks.length });
      // The section is the first pick's, as the board names it (AnnotationsBoxStates, Two overlap).
      const first = byId(p.ids[0]);
      return {
        kind: "choose",
        title,
        aria: boxAria("choose", title),
        ...at(first ? (first.sec ?? first.block) : null),
        editing: false,
        picks,
      };
    }
    if (p.t === "new" || p.t === "bnew") {
      const kind: BoxKind = p.t === "new" ? "new" : "section";
      const sec =
        p.t === "bnew" ? p.sec : sel?.mode === "passage" ? sel.sec : null;
      const title = boxTitle(kind);
      return {
        ...at(sec),
        kind,
        title,
        aria: boxAria(kind, title),
        editing: true,
        noteLang: langOf(draft, lang),
      };
    }
    if (p.t === "changed") {
      const list = items.filter(
        (x) => !x.gone && x.status === "block" && (x.sec ?? x.block) === p.sec,
      );
      if (!list.length) return null;
      // One group per version the marks were made on (usually one).
      const versions = [...new Set(list.map((x) => x.version))].sort(
        (a, b) => a - b,
      );
      const lists: BoxList[] = versions.map((v) => {
        const group = list.filter((x) => x.version === v);
        return {
          key: String(v),
          lead: W.box.changedLead(
            group.length > 1,
            madeOn(languageName(group[0].lang, names), v),
          ),
          items: group.map((x) => ({
            id: x.id,
            quote: x.quote?.exact ?? "",
            lang: x.lang,
            note: x.note,
            noteLang: langOf(x.note, x.lang),
          })),
          read: {
            href: readerHref(target, {
              lang: group[0].lang,
              version: v,
              section: p.sec,
            }),
            name: `v${v}`,
            lang: "en",
          },
        };
      });
      const title = boxTitle("changed");
      return {
        ...at(p.sec),
        kind: "changed",
        title,
        aria: boxAria("changed", title),
        editing: false,
        lists,
      };
    }
    if (p.t === "other") {
      const list = others.filter(
        (x) => !x.gone && x.at === p.sec && x.lang === p.lang,
      );
      if (!list.length) return null;
      const name = languageName(p.lang, names);
      const title = boxTitle("other", { n: list.length });
      return {
        ...at(p.sec),
        kind: "other",
        title,
        titleName: { name, lang: p.lang },
        aria: boxAria("other", title, name),
        editing: false,
        lists: [
          {
            key: p.lang,
            lead: W.box.otherLead(list.length > 1, languageName(lang, names)),
            items: list.map((x) => ({
              id: x.id,
              quote: x.quote?.exact ?? "",
              lang: x.lang,
              note: x.note,
              noteLang: langOf(x.note, x.lang),
            })),
            read: {
              href: readerHref(target, {
                lang: p.lang,
                section: list[0].sec ?? list[0].block,
              }),
              name,
              lang: p.lang,
            },
          },
        ],
      };
    }
    if (p.t === "bm") {
      const b = bms.find((x) => x.id === p.id && !x.gone);
      if (!b) return null;
      const title = boxTitle("bookmark");
      return {
        ...at(b.at),
        kind: "bookmark",
        title,
        aria: boxAria("bookmark", title),
        label: b.label,
        labelLang: langOf(b.label, "en"),
        editing: p.edit,
        delWord: deleteWord("bookmark"),
      };
    }
    const it = byId(p.id);
    if (!it) return null;
    const kind: BoxKind = p.t === "hl" ? "highlight" : "section";
    const card = cardOf(it.review, it.everOn);
    const title = boxTitle(kind, { note: it.note });
    return {
      ...at(it.sec ?? it.block),
      kind,
      title,
      aria: boxAria(kind, title),
      note: it.note,
      noteLang: langOf(p.edit ? draft : it.note, lang),
      editing: p.edit,
      card,
      reviewLine: libReviewLine(card),
      goes: kind === "highlight" ? goesLine(it.note, card) : "",
      delWord: deleteWord(kind),
    };
  }

  function libBox(p: Pop): ReactNode {
    const spec = libBoxSpec(p);
    if (!spec) return null;
    const bm = p.t === "bm";
    return (
      <MarkBox
        {...spec}
        fieldId={field}
        hintId={hintId}
        boxRef={boxRef}
        fieldRef={fieldRef}
        labelRef={labelRef}
        draft={draft}
        send={send}
        onClose={closePop}
        onKeyDown={boxKey}
        onDraft={setDraft}
        onSave={submitNote}
        onCancel={bm ? labelBox : cancelEdit}
        onEdit={bm ? labelEdit : startEdit}
        onDeleteNote={deleteNote}
        onReview={toggleReview}
        onSaveLabel={labelSave}
        onDelete={deleteBox}
        onDeleteItem={remove}
        onPick={pickMark}
      />
    );
  }

  /** What the bar a selection shows says, by what was selected. */
  function libBar(x: Sel): ReactNode {
    const k = barKind(x);
    if (x.mode === "passage")
      return (
        <MarksBar
          kind={k}
          section={sectionLabel(x.sec)}
          sectionLang={sectionLang(x.sec)}
          onHighlight={highlight}
          onNote={noteSel}
          onMouseDown={hold}
        />
      );
    if (x.mode === "block") {
      const m = meta.get(x.sec);
      return (
        <MarksBar
          kind="block"
          section={m?.title ?? ""}
          sectionLang={m?.lang ?? lang}
          word={libBlockWord(m?.word)}
          bookmarked={bookmarked(x.sec)}
          onNote={() => blockNote(x.sec)}
          onBookmark={() => toggleSection(x.sec, "bar")}
          onMouseDown={hold}
        />
      );
    }
    if (x.mode === "none")
      return (
        <MarksBar
          kind="plain"
          bookmarked={positionOn}
          onBookmark={() => togglePosition("bar")}
          onMouseDown={hold}
        />
      );
    return <MarksBar kind="refused" onMouseDown={hold} />;
  }

  const libSave = (what: "notes" | "bookmarks") =>
    what === "bookmarks" ? "bookmarks" : "highlights";

  if (lib) {
    let float: ReactNode = null;
    if (kind === "bar" && sel) float = libBar(sel);
    else if (kind === "save")
      float = (
        <SlotSave
          what={libSave(saveWhat)}
          signInHref={signInHref}
          onNotNow={() => {
            closeAll(true);
            clearNative();
          }}
        />
      );
    else if (kind === "pop" && pop) float = libBox(pop);
    const placeSecLib = !plain && blk && look.has(blk) ? blk : null;
    const placeShown =
      !!host &&
      libPlaceUp({
        barsHidden: !!bridge?.barsHidden,
        sheet: !!bridge?.sheetOpen,
        pill: !!bridge?.pillUp,
        selection: !!sel,
        box: !!pop,
        line: !!toast,
        save: save || !!slotSave,
        end: endSeen,
        plain,
        section: placeSecLib,
      });
    let slot: ReactNode = null;
    if (toast)
      slot = (
        <SlotLine
          text={toast.text}
          action={
            toast.undo
              ? { label: W.undo, onClick: toast.undo }
              : toast.retry
                ? { label: T.tryAgain, onClick: toast.retry }
                : undefined
          }
        />
      );
    else if (slotSave)
      slot = (
        <SlotSave
          what={libSave(slotSave)}
          signInHref={signInHref}
          onNotNow={() => setSlotSave(false)}
        />
      );
    else if (placeShown && host)
      slot = plain ? (
        <LibraryPlaceBar
          kind="position"
          label=""
          lang={lang}
          bookmarked={positionOn}
          onNote={() => {}}
          onBookmark={() => togglePosition("place")}
        />
      ) : placeSecLib ? (
        <LibraryPlaceBar
          kind="section"
          label={sectionLabel(placeSecLib)}
          lang={sectionLang(placeSecLib)}
          bookmarked={bookmarked(placeSecLib)}
          onNote={() => {
            // The page first shows what the note is about: the section's heading.
            const el = host.root.querySelector(
              `[data-block="${CSS.escape(placeSecLib)}"]`,
            );
            if (el) scrollUnderBar(el);
            opener.current = { el: null, mark: null };
            blockNote(placeSecLib, "place");
          }}
          onBookmark={() => toggleSection(placeSecLib, "place")}
        />
      ) : null;
    const rowsOf = (list: readonly ListItem[]): SheetRow[] =>
      list.map((it) => rowOf(it, lang));
    const sheetHead =
      bridge?.open && bridge.host
        ? (bridge.host
            .closest("dialog")
            ?.querySelector<HTMLElement>(".sheet-head") ?? null)
        : null;
    return (
      <div ref={layerRef} data-an-ui="">
        <span id={desc.one} className="sr-only">
          {W.desc.one}
        </span>
        <span id={desc.note} className="sr-only">
          {W.desc.note}
        </span>
        <span id={desc.many} className="sr-only">
          {W.desc.many}
        </span>
        {kind && float ? (
          <MarksFloat
            kind={kind === "pop" ? "box" : kind}
            floatRef={floatRef}
            placed={isPlaced}
            style={
              isPlaced && placed
                ? { left: placed.left, top: placed.top, maxWidth: placed.maxW }
                : { left: 0, top: 0, visibility: "hidden" }
            }
          >
            {float}
          </MarksFloat>
        ) : null}
        {Object.entries(besideHosts).map(([k, node]) =>
          createPortal(
            (besideOf[k] ?? []).map((key) => {
              const m = markers.find((x) => x.key === key);
              return m ? (
                <BesideButton
                  key={key}
                  note={m.beside}
                  current={markerOpen(m)}
                  onOpen={(el) => openMarker(m, el)}
                />
              ) : null;
            }),
            node,
            k,
          ),
        )}
        {bridge?.slot && slot ? createPortal(slot, bridge.slot) : null}
        {bridge?.open && bridge.host
          ? createPortal(
              <NotesBody
                visitor={!member}
                text={place}
                here={rowsOf(groups.items)}
                other={groups.other.map((g) => ({
                  lang: g.lang,
                  name: languageName(g.lang, names),
                  rows: rowsOf(g.items),
                }))}
                lost={rowsOf(groups.orphans)}
                waiting={rowWaiting}
                allHref={target.kind === "chapter" ? bridge.bookHref : null}
                signInHref={signInHref}
                onOpen={(m: Mark) => {
                  const it = rowItem(m.id);
                  if (it) goTo(it);
                }}
                onLabel={(id, text) => setLabel(id, text)}
                onDelete={rowDelete}
                onUndo={rowUndo}
                onGone={rowGone}
                onNotNow={() => bridge.close()}
                onAll={() => bridge.close()}
              />,
              bridge.host,
            )
          : null}
        {sheetHead && member && listCount
          ? createPortal(
              <SheetCount count={notesCount(listCount)} />,
              sheetHead,
            )
          : null}
      </div>
    );
  }

  const rowsOf = (sec: string) =>
    markers.filter(
      (m) =>
        m.sec === sec &&
        (m.kind === "bnote" || m.kind === "changed" || m.kind === "other"),
    );

  return (
    <div ref={layerRef} className="an-layer">
      <span id={desc.one} className="an-sr-desc">
        {T.desc.one}
      </span>
      <span id={desc.note} className="an-sr-desc">
        {T.desc.note}
      </span>
      <span id={desc.many} className="an-sr-desc">
        {T.desc.many}
      </span>
      {markers.length ? (
        <div
          className="an-rail"
          role="complementary"
          aria-label={T.margin.rail}
        >
          {markers.map((m) => (
            <div
              key={m.key}
              className="an-ri"
              style={
                railTops[m.key] === undefined
                  ? { top: 0, visibility: "hidden" }
                  : { top: railTops[m.key] }
              }
            >
              <MarginItem
                m={m.look}
                current={markerOpen(m)}
                onOpen={(el) => openMarker(m, el)}
              />
            </div>
          ))}
        </div>
      ) : null}
      {Object.entries(rowHosts).map(([sec, node]) =>
        createPortal(
          rowsOf(sec).map((m) => (
            <MarkerRow
              key={m.key}
              m={m.look}
              onOpen={(el) => openMarker(m, el)}
            />
          )),
          node,
          sec,
        ),
      )}
      {kind && body ? (
        <div
          ref={floatRef}
          className={`an-float an-float--${kind === "bar" ? "sel" : kind}`}
          data-placed={isPlaced ? "1" : "0"}
          style={
            isPlaced && placed
              ? {
                  left: placed.left,
                  top: placed.top,
                  width: placed.width ?? undefined,
                  maxWidth: placed.maxW,
                }
              : { left: 0, top: 0 }
          }
        >
          {body}
        </div>
      ) : null}
      {host && toast
        ? createPortal(
            <div className="an-slot an-slot--toast">
              <div className="an-toast" role="status">
                <span className="an-toast__text">{toast.text}</span>
                {toast.undo ? (
                  <button
                    type="button"
                    className="rd-btn rd-btn--quiet"
                    onClick={toast.undo}
                  >
                    {T.undo.undo}
                  </button>
                ) : toast.retry ? (
                  <button
                    type="button"
                    className="rd-btn rd-btn--quiet"
                    onClick={toast.retry}
                  >
                    {T.tryAgain}
                  </button>
                ) : null}
              </div>
            </div>,
            host.shell,
          )
        : null}
      {host && slotSave
        ? createPortal(
            <div className="an-save">
              <SignInToSave
                raised
                what={READER.save.whats[slotSave]}
                place={place}
                signInHref={signInHref}
                onDismiss={() => setSlotSave(false)}
              />
            </div>,
            host.shell,
          )
        : null}
      {host && placeUp
        ? createPortal(
            <div className="an-slot an-slot--chrome">
              {plain ? (
                <PlaceBar
                  kind="pos"
                  title=""
                  titleLang={lang}
                  on={positionOn}
                  onNote={() => {}}
                  onBookmark={() => togglePosition("place")}
                />
              ) : placeSec ? (
                <PlaceBar
                  kind="block"
                  title={sectionLabel(placeSec)}
                  titleLang={sectionLang(placeSec)}
                  on={bookmarked(placeSec)}
                  onNote={() => {
                    // The page first shows what the note is about: the section's heading.
                    const el = host.root.querySelector(
                      `[data-block="${CSS.escape(placeSec)}"]`,
                    );
                    if (el) scrollUnderBar(el);
                    opener.current = { el: null, mark: null };
                    blockNote(placeSec, "place");
                  }}
                  onBookmark={() => toggleSection(placeSec, "place")}
                />
              ) : null}
            </div>,
            host.shell,
          )
        : null}
      {bridge?.open && bridge.host
        ? createPortal(
            <NotesPanel
              groups={groups}
              member={member}
              loose={place === "document"}
              plain={plain}
              editLabel={editLabel}
              langName={langName}
              bookHref={target.kind === "chapter" ? bridge.bookHref : null}
              signInHref={signInHref}
              onGo={goTo}
              onDelete={deleteFromList}
              onLabel={(it) =>
                setEditLabel((cur) => (cur === it.id ? null : it.id))
              }
              onSaveLabel={(it, label) => {
                setLabel(it.id, label);
                setEditLabel(null);
              }}
              onCancelLabel={() => setEditLabel(null)}
              onClose={() => bridge.close()}
            />,
            bridge.host,
          )
        : null}
    </div>
  );
}
