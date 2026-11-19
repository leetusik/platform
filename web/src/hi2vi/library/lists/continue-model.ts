import { CONTINUE } from "@/content/library-page";
import type { ContinueItem } from "@/lib/library/continue";

/**
 * Continue reading's rows (`LibraryContinue.dc.html`, frame.md F323, F100), pure so a node test reaches
 * them. Each item's facts: where it is (`Chapter 6 of 14`, `Document`), what it is in (the book's
 * title; a document's project in an org, nothing in a project), and its place (`Left off at
 * Deduplication, 68%`, `Left off at 20%`, `You finished chapter 12`). In a project a row's kind and
 * book read as one fact: `Chapter 13 of 40, How the workspace was built`.
 *
 * The place's name is the text's own (a heading, in the text's language) or the reader's (the
 * Glossary, D156-gc d), and carries its language either way.
 */
export type ContinueScope = "org" | "project";

export interface ContinuePlace {
  /** `Left off at ` before a section's name; the whole line when there is no name. */
  before: string;
  /** The section's name, or empty. */
  section: string;
  /** The name's language. */
  sectionLang: string | null;
  /** `, 68%` after a section's name, or empty. */
  after: string;
}

export interface ContinueRow {
  key: string;
  kind: "chapter" | "doc";
  title: string;
  lang: string;
  href: string;
  /** `Chapter 6 of 14` or `Document`. */
  where: string;
  /** The book's title, or a document's project in an org; empty in a project for a document. */
  inName: string;
  /** In a project, a chapter's `where, inName`; else `where`. */
  col1: string;
  place: ContinuePlace;
  /** The progress line's fill, a percentage. */
  pct: number;
  /** `Continue reading` or `Read next`. */
  action: string;
}

/** The place an item was left, as Continue reading names it. */
export function continuePlace(item: ContinueItem): ContinuePlace {
  if (item.next)
    return {
      before: CONTINUE.finished(item.finishedN),
      section: "",
      sectionLang: null,
      after: "",
    };
  if (item.section)
    return {
      before: CONTINUE.leftOffAt,
      section: item.section,
      sectionLang: item.sectionLang ?? item.lang,
      after: item.pct ? CONTINUE.sectionPct(item.pct) : "",
    };
  return {
    before: CONTINUE.leftOffPct(item.pct),
    section: "",
    sectionLang: null,
    after: "",
  };
}

/** The flat words of a place: `Left off at Deduplication, 68%`. */
export function placeText(place: ContinuePlace): string {
  return `${place.before}${place.section}${place.after}`;
}

export function continueRows(
  items: readonly ContinueItem[],
  scope: ContinueScope = "org",
): ContinueRow[] {
  return items.map((item) => {
    const chapter = item.kind === "chapter";
    const where = chapter
      ? CONTINUE.chapterOf(item.n, item.total)
      : CONTINUE.document;
    const inName = chapter
      ? item.bookTitle
      : scope === "project"
        ? ""
        : item.project;
    return {
      key: item.key,
      kind: item.kind,
      title: item.title,
      lang: item.lang || "en",
      href: item.href,
      where,
      inName,
      col1: scope === "project" && inName ? `${where}, ${inName}` : where,
      place: continuePlace(item),
      pct: item.next ? 0 : item.pct,
      action: item.next ? CONTINUE.goNext : CONTINUE.go,
    };
  });
}
