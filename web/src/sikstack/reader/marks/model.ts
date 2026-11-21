import { LANGUAGES, type SaveWhat } from "@/content/library-frame";
import { READER_MARKS } from "@/content/reader-marks";
import type { Mark, MarkState } from "@/sikstack/library/mark-row-model";
import { NOTE_COUNT_FROM, NOTE_MAX } from "@/lib/reader/notes";
import type { ListItem } from "@/lib/reader/note-list";

/**
 * The Library's marks, pure (P63-fk.S11; job 03, Library round 02, `## Build` § Page: annotations): what the bar a
 * selection shows, the box of a mark, the notes beside the text, the bottom slot and the Notes sheet say and where
 * they sit, as data, so the layer (`components/reader/annotations.tsx`, `look="library"`) only wires them and a
 * node test reaches every rule. The words are `@/content/reader-marks`.
 */
const W = READER_MARKS;

// --- the paint ----------------------------------------------------------------------------------

/** The signed paint's classes (`AnnotationsPaint`): the old look keeps its own (`lib/reader/paint.ts`). */
export const LIBRARY_PAINT = {
  mark: "an-m",
  two: "is-2",
  note: "has-note",
  open: "is-open",
  pending: "an-pending",
} as const;

// --- the bar a selection shows (`AnnotationsBar`) ------------------------------------------------

export type BarKind = "passage" | "cut" | "block" | "refused" | "plain";

/** What a selection is, as the bar shows it. */
export function barKind(
  sel:
    | { mode: "passage"; clipped: boolean }
    | { mode: "block" }
    | { mode: "refuse" }
    | { mode: "none" },
): BarKind {
  if (sel.mode === "passage") return sel.clipped ? "cut" : "passage";
  if (sel.mode === "block") return "block";
  return sel.mode === "refuse" ? "refused" : "plain";
}

export function barAria(kind: BarKind): string {
  if (kind === "block") return W.bar.aria.block;
  return kind === "plain" ? W.bar.aria.plain : W.bar.aria.passage;
}

/** The word before a heading's title: the board's `Section`; a typed block keeps the product's word. */
export function blockWord(word: string | undefined): string {
  return !word || word === "Section" ? W.bar.section : word;
}

/** What Highlight, Add note or Bookmark does: a visitor is offered Sign in to save, and nothing is written. */
export function pressFor(
  member: boolean,
  what: "highlight" | "note" | "bookmark",
): { save: SaveWhat } | { write: true } {
  if (member) return { write: true };
  return { save: what === "bookmark" ? "bookmarks" : "highlights" };
}

// --- the box of a mark (`AnnotationsBox`) ----------------------------------------------------------

export type BoxKind =
  "highlight" | "new" | "section" | "bookmark" | "changed" | "other" | "choose";

export type Send = "rest" | "saving" | "failed";

/** A highlight's card: on (true), paused (false), never on (null). */
export function cardOf(review: boolean, everOn: boolean): boolean | null {
  if (review) return true;
  return everOn ? false : null;
}

export function boxTitle(
  kind: BoxKind,
  o: { note?: string; n?: number } = {},
): string {
  const t = W.box.title;
  switch (kind) {
    case "highlight":
      return o.note ? t.highlightNote : t.highlight;
    case "new":
      return t.new;
    case "section":
      return t.section;
    case "bookmark":
      return t.bookmark;
    case "changed":
      return t.changed;
    case "other":
      return t.other(o.n ?? 1);
    case "choose":
      return t.choose(o.n ?? 2);
  }
}

export function boxAria(kind: BoxKind, title: string, name = ""): string {
  if (kind === "new") return W.box.aria.new;
  if (kind === "choose") return W.box.aria.choose;
  if (kind === "highlight") return W.box.aria.highlight;
  return kind === "other" ? `${title}${name}` : title;
}

/** The line under Review this. */
export function reviewLine(card: boolean | null): string {
  if (card === true) return W.box.reviewOn;
  return card === false ? W.box.reviewPaused : W.box.reviewNever;
}

/** What goes with a highlight when it is deleted (the last row's sentence), or "". */
export function goesLine(note: string, card: boolean | null): string {
  const hasCard = card !== null;
  if (note && hasCard) return W.box.goesBoth;
  if (note) return W.box.goesNote;
  return hasCard ? W.box.goesCard : "";
}

export function deleteWord(kind: BoxKind): string {
  if (kind === "highlight") return W.box.deleteHighlight;
  return kind === "bookmark" ? W.box.removeBookmark : W.box.deleteNote;
}

/** The count's line under the field: none under 1,800 characters, the count, the full line at the limit. */
export function countLine(length: number): { text: string; full: boolean } {
  if (length >= NOTE_MAX) return { text: W.box.countFull, full: true };
  if (length >= NOTE_COUNT_FROM)
    return { text: W.box.count(length), full: false };
  return { text: "", full: false };
}

/** A pick in the chooser, cut at 90 characters. */
export function pickQuote(quote: string): string {
  return quote.length > 90 ? `${quote.slice(0, 90)}…` : quote;
}

/** `English v1`: what Text changed says a mark was made on. */
export function madeOn(langName: string, version: number): string {
  return `${langName} v${version}`;
}

// --- where the bar, Sign in to save and the box hang -----------------------------------------------

/**
 * A floating part sits 8 px under the last line of what it acts on, starting where that line starts, and never
 * leaves the column (`Annotations.dc.html` `float()`). Offsets are in the article's box.
 */
export function floatAt(a: {
  lineLeft: number;
  lineBottom: number;
  colLeft: number;
  colWidth: number;
  width: number;
}): { left: number; top: number } {
  const w = Math.min(a.width, a.colWidth);
  const left = Math.max(
    a.colLeft,
    Math.min(a.lineLeft, a.colLeft + a.colWidth - w),
  );
  return { left: Math.round(left), top: Math.round(a.lineBottom + 8) };
}

// --- the notes beside the text --------------------------------------------------------------------

/**
 * The margin: where the app is 64em or wider and the column leaves 10em beside it (24 px off the column, 16 px
 * from the edge), 220 px wide at most (`Annotations.dc.html` `layout()`). Elsewhere the notes sit under their block.
 */
export function railFits(a: {
  appWidth: number;
  em: number;
  mainWidth: number;
  colWidth: number;
}): { rail: boolean; width: number } {
  const room = Math.floor((a.mainWidth - a.colWidth) / 2) - 24 - 16;
  return {
    rail: a.appWidth >= 64 * a.em && room >= 10 * a.em,
    width: Math.max(0, Math.min(220, room)),
  };
}

/** In the margin, each group starts on its mark's line and stays 8 px clear of the group above it. */
export function railTops(
  groups: readonly { line: number; height: number }[],
): number[] {
  let floor = -Infinity;
  return groups.map((g) => {
    const top = Math.round(Math.max(g.line, floor));
    floor = top + g.height + 8;
    return top;
  });
}

export type BesideKind = "note" | "bnote" | "changed" | "other" | "bm";

/** One note beside the text: its kind's word and its text (a language's name rides in its own `lang`). */
export interface BesideNote {
  kind: string;
  text: string;
  lang: string;
  endonym?: { name: string; lang: string };
}

export function besideNote(
  kind: BesideKind,
  a: {
    text?: string;
    lang?: string;
    words?: string;
    n?: number;
    endonym?: { name: string; lang: string };
  },
): BesideNote {
  const b = W.beside;
  switch (kind) {
    case "note":
      return { kind: b.note, text: a.text ?? "", lang: a.lang ?? "en" };
    case "bnote":
      return { kind: b.section, text: a.text ?? "", lang: a.lang ?? "en" };
    case "bm":
      return { kind: b.bookmarked, text: a.text ?? "", lang: a.lang ?? "en" };
    case "changed":
      return {
        kind: b.changed,
        text: b.changedText(a.words ?? "", a.n ?? 1),
        lang: "en",
      };
    case "other":
      return {
        kind: b.other,
        text: b.otherText(a.words ?? ""),
        lang: "en",
        ...(a.endonym ? { endonym: a.endonym } : {}),
      };
  }
}

/** On a heading the notes run in the signed order: the bookmark, the section's note, Text changed, another language. */
export const BESIDE_RANK: Record<BesideKind, number> = {
  bm: 0,
  bnote: 1,
  changed: 2,
  other: 3,
  note: 4,
};

// --- the bottom slot -------------------------------------------------------------------------------

/**
 * The place bar is up only while nothing else is: it leaves with the bars, and yields to a sheet, the resume pill,
 * a selection, a box, the undo line and Sign in to save; it needs a section above the line (or a text with none),
 * and is gone at the chapter's end.
 */
export function placeUp(a: {
  barsHidden: boolean;
  sheet: boolean;
  pill: boolean;
  selection: boolean;
  box: boolean;
  line: boolean;
  save: boolean;
  end: boolean;
  plain: boolean;
  section: string | null;
}): boolean {
  if (a.barsHidden || a.sheet || a.pill || a.selection || a.box) return false;
  if (a.line || a.save || a.end) return false;
  return a.plain || !!a.section;
}

// --- the Notes sheet -------------------------------------------------------------------------------

export function notesCount(n: number): string {
  return n ? W.sheet.count(n) : "";
}

/**
 * A listed mark as the frame's `MarkRow` takes it (frame.md F65): its kind, its state on this screen, its card,
 * and its place, named in the place's own language (D156-gc a and b): a section's title in the section's language
 * (the chapter's, or the one a heading names, the Glossary's), never the mark's.
 */
export function rowOf(
  it: ListItem,
  screenLang: string,
): { mark: Mark; place: string; placeLang: string } {
  const bookmark = it.kind === "bm";
  const position = bookmark && (it.pos || it.approx);
  const state: MarkState =
    it.status === "orphan"
      ? "gone"
      : it.status === "block"
        ? "changed"
        : it.status === "other"
          ? "other"
          : "ok";
  const mark: Mark = {
    id: it.id,
    kind: bookmark
      ? position
        ? "position"
        : "bookmark"
      : it.kind === "bnote"
        ? "section"
        : "highlight",
    quote: it.quote,
    note: it.note,
    label: it.label,
    lang: it.lang,
    version: it.version,
    state,
    review:
      it.kind !== "hl"
        ? null
        : it.card === "active"
          ? true
          : it.card === "suspended"
            ? false
            : null,
  };
  let place: string;
  let placeLang = it.secLang ?? screenLang;
  if (state === "gone") {
    place = W.where.was(
      it.snapshot?.block || it.secTitle || W.where.removedSection,
    );
    placeLang = "en";
  } else if (position) {
    place = W.where.position(Math.round(it.frac * 100));
    placeLang = "en";
  } else place = it.secTitle;
  return { mark, place, placeLang };
}

/** A language's own name, as the frame's rows name it. */
export function languageName(
  lang: string,
  names: Record<string, string>,
): string {
  return names[lang] ?? LANGUAGES[lang]?.name ?? lang;
}
