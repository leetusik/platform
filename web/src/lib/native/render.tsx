/**
 * The block tree → React mapping (P29 *Render model*). A server component:
 * nothing here ships to the client, and nothing here is ever HTML.
 *
 * - **No raw HTML, ever.** There is no `dangerouslySetInnerHTML`, no
 *   `innerHTML` and no HTML passthrough: every element below is a React element
 *   built from the normalized tree, and every string is a React text child
 *   (escaped by React). Raw HTML never reaches the tree (native: refused at
 *   ingest and again here; `md`: dropped by the parser).
 * - **SVG** is rebuilt element by element from the validated tree through the
 *   allowlist a second time (`svg.ts`), with its ids scoped to the block.
 * - **Math** (P39-hk.S8) is Temml's MathML rebuilt element by element through a MathML
 *   allowlist (`mathml.ts`): never Temml's string. Temml refusing TeX that publish
 *   accepted refuses the whole block with the placeholder; raw TeX is never shown.
 * - **Links** go through `links.ts`: a target the reader cannot open renders as
 *   a "missing link" that carries no href.
 * - **Terms** (P39-hk.S9): a `term:` link to a glossary entry is the term marker
 *   (`terms.ts` numbers it); the glossary block draws the chapter's Glossary section and
 *   one hidden window per linked term (static markup the client `TermLayer` toggles).
 * - **Kept runs** (F22; P39-hk.S9, F2): in a native chapter every hyphenated word of the prose,
 *   and an inline formula with the Hangul particle written after it, is one `span.ra-keep`
 *   that never breaks while it fits its line (`MathLayer` measures the ones that do not).
 * - **Two looks** (P63-fk.S9, `./look.ts`): `old`, the default, is the markup every caller had (`kb-ch-*`,
 *   `fg-*`, `ra-*`, `dg*`), byte for byte; `library` is the signed body of a text (job 03, Library round 02:
 *   frame.md F60, `## Build` § Page: blocks) in the frame's and the Blocks page's classes, with the parts later
 *   slices rebuild in old-look islands (`OldIsland`). `hooks` adds the `data-*` hooks the reader's layers find the
 *   body and its parts by (`HOOK`), in either look; without it no hook is drawn.
 *   The only `style` attributes are the figures' custom properties (`--fg-w`, `--fg-h`,
 *   `--fg-vbw`, `--fg-minw`, P30.S16): numbers from the asset map and the validated svg,
 *   never author strings. The CSP leaves `style-src` open (see `csp.ts`).
 */
import "server-only";

import { createElement, Fragment, type ReactNode } from "react";

import { DiagramFigure } from "@/components/reader/diagram-figure";
import {
  ImageBox,
  MissingBox,
  ScrollFigure,
} from "@/components/reader/figure-parts";
import { PrintAddr } from "@/components/reader/print-sheet";
import {
  PrintAnswers,
  PrintQuiz,
  type PrintItem,
  type PrintKey,
} from "@/components/reader/print-quiz";
import {
  ClozeBlank,
  QuizBlock,
  type QuizItemProps,
} from "@/components/reader/quiz";
import {
  FormulaBox,
  InlineFormula,
  LegendSymbol,
} from "@/components/reader/formula-box";
import { ArtBox, TableBox } from "@/components/reader/scroll-box";
import { CHAPTER } from "@/content";
import { READER_AIDS } from "@/content/reader-aids";
import { READER_BLOCKS } from "@/content/reader-blocks";
import {
  drawable,
  GlossaryList,
  LibraryBlank,
  LibraryQuiz,
  TermWindows,
  type LibraryQuizItem,
  type TermEntryView,
} from "@/sikstack/reader/aids";
import {
  Media,
  MissingMedia,
  OldIsland,
  ratioOf,
  ScrollBox,
} from "@/sikstack/reader/body";
import { hangulRuns, isKorean } from "@/lib/reader/hangul";
import { printAddress, widestLine } from "@/lib/reader/print";
import { specOf } from "@/lib/reader/quiz";
import type { QuizSaved } from "@/lib/reader/quiz-saved";
import { signInToSaveHref, type ReaderTarget } from "@/lib/reader-href";

import { letters, planCitations, type CitationPlan } from "./cites";
import { graphSpec } from "./diagram-draw";
import { diagramParts, kindOf } from "./diagram-kinds";
import { highlight } from "./highlight";
import {
  calloutStrong,
  figureColumns,
  hook,
  HOOK,
  rowOf,
  type BodyLook,
} from "./look";
import {
  resolveAsset,
  resolveImage,
  resolveLink,
  type AssetInfo,
  type LinkContext,
} from "./links";
import {
  isSteps,
  linearText,
  MathError,
  mathElement,
  mathTree,
} from "./mathml";
import { plainText, type ChapterFormat } from "./parse";
import { codePoints, containers, inlineText } from "./project";
import { parseRef, RefError } from "./refs";
import {
  planTerms,
  type TermEntry,
  type TermPlan,
  type TermUse,
} from "./terms";
import {
  allowedSvgElement,
  svgAttrsToProps,
  TEXT_ELEMENTS,
  type SvgChild,
  type SvgElement,
} from "./svg";
import type { Block, Inline, TypedBlock } from "./tree";
import { validateChapter, type CheckedChapter } from "./validate";

/**
 * What the quiz island needs from the reader (P30.S19): who is reading, where an attempt
 * is saved, the saved answers as they show on return, and the place Sign in to save
 * returns to. Absent (the older `/documents` pages), a quiz still answers, grades and
 * retries; it saves nothing and offers no sign-in.
 */
export interface QuizViewContext {
  member: boolean;
  write: { org: string; project: string; doc: string } | null;
  /** The version on screen. */
  version: number;
  place: "chapter" | "document";
  /** The chapter's language, as the reader carries it. */
  lang: string;
  signIn: {
    target: ReaderTarget;
    /** The `?lang=` of the return address (null = the default variant). */
    lang: string | null;
    /** The `?v=` of the return address (null = the newest). */
    version: number | null;
  } | null;
  saved: QuizSaved;
}

export interface NativeChapterProps extends Omit<LinkContext, "format"> {
  /** The stored file: a native chapter's whole `source` (header included), or an md body. */
  source: string;
  format: ChapterFormat;
  /** The variant's language, carried on the article (P29: Korean typography keys on it). */
  lang?: string;
  /** The body's look (`./look.ts`); the old one by default. */
  look?: BodyLook;
  /** Draw the layers' hooks (`HOOK`); a reader does, no other caller. */
  hooks?: boolean;
}

/** Parse, re-validate and render a chapter. */
export function NativeChapter({
  source,
  format,
  lang,
  look,
  hooks,
  ...links
}: NativeChapterProps) {
  return (
    <ChapterView
      checked={validateChapter(source, format)}
      lang={lang}
      look={look}
      hooks={hooks}
      links={{ ...links, format }}
    />
  );
}

export function ChapterView({
  checked,
  lang,
  links,
  omitTitle,
  quiz,
  look = "old",
  hooks = false,
}: {
  checked: CheckedChapter;
  lang?: string;
  links: LinkContext;
  /** The reader's context for quiz blocks (see `QuizViewContext`). */
  quiz?: QuizViewContext;
  /**
   * The document's title, when the reader's chapter opening already shows it: an `md`
   * body starts at its own H1, which is then left out (only that first H1, and only
   * when its text is this title).
   */
  omitTitle?: string | null;
  /** `old` (the default: the markup every caller had) or `library` (the signed body: `./look.ts`). */
  look?: BodyLook;
  /** Draw the `data-*` hooks the reader's layers read (`HOOK`); off by default, so no other caller's markup moves. */
  hooks?: boolean;
}) {
  const lib = look === "library";
  if (checked.refused) {
    if (lib)
      return (
        <div
          className="read"
          data-format={checked.format}
          lang={lang}
          {...hook(hooks, HOOK.body)}
        >
          <p role="note" {...hook(hooks, HOOK.unspoken)}>
            {CHAPTER.unshowableChapter}
          </p>
        </div>
      );
    return (
      <div
        className="kb-ch kb-ch--refused"
        data-format={checked.format}
        lang={lang}
        {...hook(hooks, HOOK.body)}
      >
        <p
          className="kb-ch-unshowable"
          role="note"
          {...hook(hooks, HOOK.unspoken)}
        >
          {CHAPTER.unshowableChapter}
        </p>
      </div>
    );
  }
  // §6a: in text whose language is not Korean, each Hangul run is wrapped in `lang="ko"`.
  const r = new Renderer(
    links,
    lang !== undefined && !isKorean(lang),
    checked.blocks.flatMap((e) => (e.block && !e.refused ? [e.block] : [])),
    quiz,
    lang !== undefined && isKorean(lang),
    lang,
    lib,
    hooks,
  );
  // P30.S20: each passage container's place in its section's text (`project.ts`), so
  // the reader can capture and paint annotation offsets in the shared projection.
  const stamps =
    checked.format === "native" ? anchorStamps(checked.blocks) : null;
  const first = checked.blocks.find((b) => b.block !== null);
  const skip =
    omitTitle &&
    first &&
    !first.refused &&
    first.block?.type === "heading" &&
    first.block.level === 1 &&
    plainText(first.block.content).trim() === omitTitle.trim()
      ? first
      : null;
  const blocks = checked.blocks.map((entry, i) =>
    entry === skip ? null : entry.refused ? (
      <Fragment key={i}>
        {r.unshowable(
          entry.block && entry.block.id ? entry.block.id : undefined,
        )}
      </Fragment>
    ) : entry.block ? (
      <Fragment key={i}>{r.stamped(stamps?.[i] ?? null, entry.block)}</Fragment>
    ) : null,
  );
  if (lib)
    return (
      <div
        className="read"
        data-format={checked.format}
        lang={lang}
        {...hook(hooks, HOOK.body)}
      >
        {blocks}
        {/* The answer key (print only) keeps its old look, so paper prints as today (P63-fk.S10). */}
        {r.printKeys.length ? (
          <OldIsland>
            <PrintAnswers keys={r.printKeys} />
          </OldIsland>
        ) : null}
        {/* Each linked term's window, hidden until the term layer opens it (screen only; P63-fk.S10). */}
        {r.termWindows()}
      </div>
    );
  return (
    <div
      className="kb-ch"
      data-format={checked.format}
      lang={lang}
      {...hook(hooks, HOOK.body)}
    >
      {blocks}
      {/* P30.S26: the quizzes' answer key, printed after the whole body (print only). */}
      <PrintAnswers keys={r.printKeys} />
      {/* P39-hk.S9: each linked term's window, hidden until the term layer opens it (screen only). */}
      {r.termWindows()}
    </div>
  );
}

// --- typed-block field readers (fields are `unknown` until checked) ------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const recs = (v: unknown): Rec[] => arr(v).filter(isRec);
const inl = (v: unknown): Inline[] | null =>
  Array.isArray(v) ? (v as Inline[]) : null;
const KNOWN_CALLOUTS = new Set(Object.keys(CHAPTER.calloutLabel));
const KNOWN_TONES = new Set([
  "default",
  "muted",
  "accent",
  "ok",
  "warn",
  "bad",
  "store",
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-6",
]);
/** P29's render fallback: an unknown tone draws as `default` (ingest refuses it first). */
const tone = (v: unknown): string =>
  typeof v === "string" && KNOWN_TONES.has(v) ? v : "default";

/** A paragraph's leading and trailing blanks (a space or a break beside an image) are not text. */
function trimRun(run: Inline[]): Inline[] {
  const blank = (n: Inline) =>
    n.type === "break" || (n.type === "text" && n.text.trim() === "");
  let a = 0;
  let b = run.length;
  while (a < b && blank(run[a])) a += 1;
  while (b > a && blank(run[b - 1])) b -= 1;
  const out = run.slice(a, b);
  const first = out[0];
  if (first?.type === "text")
    out[0] = { ...first, text: first.text.trimStart() };
  const last = out[out.length - 1];
  if (last?.type === "text")
    out[out.length - 1] = { ...last, text: last.text.trimEnd() };
  return out;
}

/** One passage container's place in its section's text: what `data-sec`/`data-base` carry. */
interface Stamp {
  sec: string;
  text: string;
  base: number;
}

/**
 * P30.S20 — the anchor basis, per top-level block: its passage containers in the order
 * `project.ts` lists them, each with its section and its start offset (code points) in the
 * section's text. The renderer takes them in the same order as it emits the containers and
 * checks each text, so a container is stamped only where the page shows exactly the
 * projection's text (a mismatch stops the stamps for the rest of that block: such text
 * takes no highlight rather than a wrong one). Refused blocks still advance the offsets.
 */
function anchorStamps(
  entries: readonly { block: Block | null; refused: boolean }[],
): (Stamp[] | null)[] {
  let sec: string | null = null;
  let cursor = 0;
  let first = true;
  return entries.map((entry) => {
    const block = entry.block;
    if (!block) return null;
    if (block.id) {
      sec = block.id;
      cursor = 0;
      first = true;
    }
    if (sec === null) return null;
    const out: Stamp[] = [];
    for (const text of containers(block)) {
      const base = first ? cursor : cursor + 1;
      out.push({ sec, text, base });
      cursor = base + codePoints(text).length;
      first = false;
    }
    return out;
  });
}

/** A paragraph run's leading blanks that `trimRun` drops, in code points of the projection. */
function leadTrim(run: Inline[]): number {
  let n = 0;
  for (const node of run) {
    if (node.type === "break") n += 1;
    else if (node.type === "text" && node.text.trim() === "")
      n += codePoints(node.text).length;
    else {
      if (node.type === "text")
        n +=
          codePoints(node.text).length -
          codePoints(node.text.trimStart()).length;
      break;
    }
  }
  return n;
}

class Renderer {
  /** The chapter's citations and each source's way back (`cites.ts`); empty for `md`. */
  private readonly plan: CitationPlan;
  /** How many plain images of each asset the chapter has had (`img-<name>`, `-2`, `-3` …). */
  private readonly imageIds = new Map<string, number>();
  /** Set while a cloze sentence renders: its blanks become the island's inputs, counted in order. */
  private cloze: { n: number; print?: boolean } | null = null;
  /** P30.S26: each quiz's answer key, in the order the quizzes are rendered (print only). */
  readonly printKeys: PrintKey[] = [];
  /** The current top-level block's anchor stamps (P30.S20), taken in order; null = none. */
  private stamps: Stamp[] | null = null;
  private stampAt = 0;
  /** P39-hk.S9: the chapter's glossary entries and each term link's occurrence (`terms.ts`); empty for `md`. */
  private readonly terms: TermPlan;
  /**
   * F22 (P39-hk.F2, OQ15): a native chapter keeps every hyphenated word of its prose whole, and a Hangul
   * particle with the inline formula before it (OQ14): every inline run (`inline`), wherever it sits, plus a
   * term's name and aliases. S9 kept only a term's words and its definitions. Never code, a link's target,
   * an attribute, a diagram's label or a plain-string title; never an `md` body.
   */
  private readonly keep: boolean;
  /** Set while the term windows render: their second copy of a definition takes no ids. */
  private copy = false;

  constructor(
    private readonly links: LinkContext,
    /** Wrap each Hangul run in `lang="ko"` (the text's language is not Korean). */
    private readonly wrap: boolean = false,
    blocks: readonly Block[] = [],
    private readonly quizCtx?: QuizViewContext,
    /** A Korean chapter: the formula's words are Korean (`CHAPTER.formula`). */
    private readonly ko: boolean = false,
    /** The chapter's language: the glossary's collator and its terms' `lang`. */
    private readonly lang?: string,
    /** The Library's look (`./look.ts`); false while an old-look island renders. */
    private lib: boolean = false,
    /** Draw the layers' hooks (`HOOK`). */
    private readonly hooks: boolean = false,
  ) {
    const own = links.format === "md" ? [] : blocks;
    this.plan = planCitations(own);
    this.terms = planTerms(own);
    this.keep = links.format !== "md";
  }

  /** Render one top-level block with its anchor stamps (P30.S20). */
  stamped(stamps: Stamp[] | null, block: Block): ReactNode {
    this.stamps = stamps;
    this.stampAt = 0;
    const keys = this.printKeys.length;
    try {
      return this.block(block);
    } catch (exc) {
      // P39-hk.S8: Temml refused TeX that publish accepted (a parser drift). The block is
      // refused as the validator would have refused it; its TeX is never shown.
      if (!(exc instanceof MathError)) throw exc;
      this.cloze = null;
      this.printKeys.length = keys;
      return this.unshowable(block.id ?? undefined);
    } finally {
      this.stamps = null;
    }
  }

  /** A block that couldn't be shown: a note in its place (Library: a paragraph). Listen skips it. */
  unshowable(id: string | undefined): ReactNode {
    if (this.lib)
      return (
        <p role="note" data-block={id} {...hook(this.hooks, HOOK.unspoken)}>
          {CHAPTER.unshowableBlock}
        </p>
      );
    return (
      <div
        className="kb-ch-unshowable"
        role="note"
        data-block={id}
        {...hook(this.hooks, HOOK.unspoken)}
      >
        {CHAPTER.unshowableBlock}
      </div>
    );
  }

  /**
   * P63-fk.S9: what `draw` renders, in the old look, in an old-look island of the Library's body (`OldIsland`); in
   * the old look, as it is. Nothing, when it draws nothing.
   */
  islandOf(draw: () => ReactNode): ReactNode {
    if (!this.lib) return draw();
    this.lib = false;
    let node: ReactNode;
    try {
      node = draw();
    } finally {
      this.lib = true;
    }
    return node === null || node === undefined ? null : (
      <OldIsland>{node}</OldIsland>
    );
  }

  /**
   * The next passage container's stamp, when its text is the one the projection lists
   * next; otherwise none from here to the end of the block (never a wrong offset).
   */
  private take(text: string): Stamp | null {
    const q = this.stamps;
    if (!q) return null;
    const next = q[this.stampAt];
    if (!next || next.text !== text) {
      this.stamps = null;
      return null;
    }
    this.stampAt += 1;
    return next;
  }

  /** The `data-*` a stamped passage container carries (`kind` p | code). */
  private static mark(
    stamp: Stamp | null,
    offset = 0,
    kind: "p" | "code" = "p",
  ): Record<string, string> {
    return stamp
      ? {
          "data-tx": kind,
          "data-sec": stamp.sec,
          "data-base": String(stamp.base + offset),
        }
      : {};
  }

  /** Text with its Hangul runs wrapped (§6a). Never used for code or attributes. */
  text(value: string): ReactNode {
    return hangulRuns(value, this.wrap);
  }

  /**
   * P39-hk.S9 (F22): text whose hyphenated words (`t-statistic`, `walk-forward`,
   * `CONDITIONAL-GO’s`) never break at the hyphen: each is one `white-space: nowrap` run,
   * and the line breaks before it. Only the text's own characters, so no offset moves.
   * P39-hk.F1: a run wider than its whole line is measured on the page (`MathLayer`'s
   * `fitKeeps`) and only then breaks inside, as F36 signs; the markup stays this one span.
   * P39-hk.F2: a dash standing alone (` - `) has no break inside it to stop: no span.
   */
  keepText(value: string): ReactNode {
    if (!value.includes("-")) return this.text(value);
    return value
      .split(/(\S*-\S*)/)
      .filter(Boolean)
      .map((part, i) =>
        part.includes("-") && /[^-]/.test(part) ? (
          <span key={i} {...this.keepAttrs()}>
            {this.text(part)}
          </span>
        ) : (
          <Fragment key={i}>{this.text(part)}</Fragment>
        ),
      );
  }

  /** A kept run's class (old `ra-keep`, Library `blocks-keep`) and its hook. */
  private keepAttrs(): Record<string, string> {
    return {
      className: this.lib ? "blocks-keep" : "ra-keep",
      ...hook(this.hooks, HOOK.keep),
    };
  }

  /** A text node's words: hyphenated words kept whole in a native chapter (F22), as written in `md`. */
  private prose(value: string): ReactNode {
    return this.keep ? this.keepText(value) : this.text(value);
  }

  /**
   * P39-hk.F2 (F22's Korean clause, OQ14): the Hangul written right after an inline formula, with no
   * space between (a particle: `를`, `로,`, `입니다.`), up to the first space; null for anything else.
   */
  private particle(next: Inline | undefined): string | null {
    if (!this.keep || next?.type !== "text") return null;
    return /^\p{Script=Hangul}\S*/u.exec(next.text)?.[0] ?? null;
  }

  /**
   * P39-hk.F2: an inline formula and its particle as one kept run, so the line breaks before the
   * formula rather than between them. A pair wider than its whole line is measured `is-wide` like any
   * keep (`fitKeeps`) and may break between them again, its formula scrolling in its own box (F1).
   * Only the text's own characters, so no offset moves.
   */
  private boundMath(tex: string, tail: string, key: number): ReactNode {
    return (
      <span key={key} {...this.keepAttrs()}>
        {this.inlineMath(tex)}
        {this.text(tail)}
      </span>
    );
  }

  /** A second drawing of content already on the page (paper's quiz, a term's window): no ids. */
  private copied<T>(draw: () => T): T {
    const was = this.copy;
    this.copy = true;
    try {
      return draw();
    } finally {
      this.copy = was;
    }
  }

  // --- inline ------------------------------------------------------------------

  inline(nodes: readonly Inline[] | null | undefined): ReactNode {
    if (!nodes) return null;
    if (this.cloze) return this.clozeRun(nodes);
    // P39-hk.F2: a particle bound to the formula before it is taken off the text that follows.
    let skip = 0;
    return nodes.map((node, i) => {
      const from = skip;
      skip = 0;
      if (from > 0 && node.type === "text") {
        const rest = node.text.slice(from);
        return rest ? <Fragment key={i}>{this.prose(rest)}</Fragment> : null;
      }
      if (node.type === "math") {
        const tail = this.particle(nodes[i + 1]);
        if (tail) {
          skip = tail.length;
          return this.boundMath(node.tex, tail, i);
        }
      }
      return this.inlineNode(node, i);
    });
  }

  /**
   * A cloze sentence's inline run (`04-quiz` §6): each blank becomes the island's input,
   * numbered in reading order. What touches a blank's end with no space between (a comma,
   * a full stop, a Korean particle such as 을 or 에) rides in the blank's no-wrap group, so a
   * line never starts with "," or "에". Only plain characters are taken: up to the first
   * space or Markdown mark, and only from a text node that directly follows.
   */
  private clozeRun(nodes: readonly Inline[]): ReactNode {
    let skip = 0;
    return nodes.map((node, i) => {
      if (node.type === "blank" && this.cloze) {
        this.cloze.n += 1;
        const next = nodes[i + 1];
        const m =
          next?.type === "text" ? /^[^\s`*_\[\]~{}<>]+/.exec(next.text) : null;
        skip = m ? m[0].length : 0;
        if (this.cloze.print) {
          // The paper's blank: a numbered rule, its tail kept with it.
          return (
            <span key={i} className="pp-bw">
              <span className="pp-blank">
                <span className="pp-blank__n">({this.cloze.n})</span>
              </span>
              {m ? this.text(m[0]) : null}
            </span>
          );
        }
        // P63-fk.S10: the Library's gap, fed by its item in `LibraryQuiz`.
        if (this.lib)
          return (
            <LibraryBlank
              key={i}
              n={this.cloze.n}
              tail={m ? this.text(m[0]) : undefined}
            />
          );
        return (
          <ClozeBlank
            key={i}
            n={this.cloze.n}
            tail={m ? this.text(m[0]) : undefined}
          />
        );
      }
      if (node.type === "text" && skip > 0) {
        const rest = node.text.slice(skip);
        skip = 0;
        return rest ? <Fragment key={i}>{this.prose(rest)}</Fragment> : null;
      }
      skip = 0;
      if (node.type === "math") {
        const tail = this.particle(nodes[i + 1]);
        if (tail) {
          skip = tail.length;
          return this.boundMath(node.tex, tail, i);
        }
      }
      return this.inlineNode(node, i);
    });
  }

  inlineNode(node: Inline, key: number): ReactNode {
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{this.prose(node.text)}</Fragment>;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "math":
        return this.inlineMath(node.tex, key);
      case "em":
        return <em key={key}>{this.inline(node.children)}</em>;
      case "strong":
        return <strong key={key}>{this.inline(node.children)}</strong>;
      case "del":
        return <del key={key}>{this.inline(node.children)}</del>;
      case "break":
        return <br key={key} />;
      case "blank":
        return (
          <span
            key={key}
            className={this.lib ? undefined : "kb-ch-blank"}
            aria-label={CHAPTER.quiz.blank}
            data-an-skip=""
          >
            {"_____"}
          </span>
        );
      case "image":
        return (
          <Fragment key={key}>
            {this.links.format === "md"
              ? this.mdImage(node)
              : this.imageBox(
                  resolveAsset(this.assetName(node.src), this.links),
                  node.alt,
                  node.title,
                )}
          </Fragment>
        );
      case "link": {
        const use = this.terms.byLink.get(node);
        if (use) return this.term(node, use, key);
        const cite = this.plan.byLink.get(node);
        if (cite) return this.citation(node, cite, key);
        return this.link(
          node.href,
          node.title,
          this.inline(node.children),
          key,
          inlineText(node.children),
        );
      }
      default:
        return null;
    }
  }

  /**
   * P39-hk.S8 — inline math (`10-reading-aids` *Inline formula*; F7, F24): `math.ra-m` in
   * the sentence, its `alttext` the formula written in a line (OQ7, R1's recommendation).
   * It is an atom of the projection (`data-an-len`, its TeX's code points): a selection
   * never splits it and a highlight leaves it unpainted, as a bare citation's number.
   * P39-hk.F1: it sits in its own measured box (`InlineFormula`). Where it fits, the box is
   * two plain inline spans and nothing changes; a formula wider than its whole line scrolls
   * inside the box, as F7 signs for a display row, and never pushes the page sideways.
   */
  inlineMath(tex: string, key?: number): ReactNode {
    const tree = mathTree(tex, false);
    // The Library: MathML in the sentence, in the math face at the text's size, never broken (Blocks).
    if (this.lib)
      return mathElement(
        tree,
        {
          alttext: linearText(tree),
          "data-an-len": String(codePoints(tex).length),
        },
        key,
      );
    return (
      <InlineFormula key={key} label={CHAPTER.formula.scrolls(this.ko)}>
        {mathElement(tree, {
          className: "ra-m",
          alttext: linearText(tree),
          "data-an-len": String(codePoints(tex).length),
        })}
      </InlineFormula>
    );
  }

  /** A native image's asset name: `asset:<name>` only (null for anything else). */
  assetName(src: string): string | null {
    try {
      const ref = parseRef(src, true);
      return ref.kind === "asset" ? ref.name : null;
    } catch (exc) {
      if (exc instanceof RefError) return null;
      throw exc;
    }
  }

  /**
   * The image box (§1): the reserved box with the asset's size from the version's map, or the
   * "Image not available" box when the version holds no such asset.
   */
  imageBox(
    info: AssetInfo | null,
    alt: string,
    title?: string | null,
  ): ReactNode {
    const altNode = this.text(alt);
    if (this.lib)
      return info ? (
        <Media
          src={info.url}
          still={info.animated ? info.stillUrl : null}
          alt={alt}
          title={title ?? undefined}
          w={info.width}
          h={info.height}
          missingAlt={altNode}
        />
      ) : (
        <MissingMedia w={null} h={null}>
          {altNode}
        </MissingMedia>
      );
    if (!info)
      return (
        <MissingBox w={null} h={null} label={CHAPTER.figure.missing}>
          {altNode}
        </MissingBox>
      );
    return (
      <ImageBox
        src={info.url}
        still={info.animated ? info.stillUrl : null}
        alt={alt}
        title={title ?? undefined}
        w={info.width}
        h={info.height}
        label={CHAPTER.figure.missing}
        missingAlt={altNode}
      />
    );
  }

  /** An `md` image: a same-origin URL, with no size to reserve (it keeps the old inline `<img>`). */
  mdImage(node: Extract<Inline, { type: "image" }>): ReactNode {
    const src = resolveImage(node.src, this.links);
    if (src === null && this.lib)
      return (
        <MissingMedia w={null} h={null}>
          {this.text(node.alt)}
        </MissingMedia>
      );
    if (src === null)
      return (
        <MissingBox w={null} h={null} label={CHAPTER.figure.missing}>
          {this.text(node.alt)}
        </MissingBox>
      );
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a same-origin md image, with no asset map to size it from
      <img
        src={src}
        alt={node.alt}
        title={node.title ?? undefined}
        loading="lazy"
      />
    );
  }

  /**
   * P39-hk.S9 — the term marker (`10-reading-aids` *The term marker*; F2, F22, F33): the
   * author's words, in ink with a dotted line, marked up only where the author wrote a term
   * link. A real link to the glossary entry, so without script it lands there; the term layer
   * opens the term's window (`tw-<id>`) instead. Its id `tm-<id>-<n>` is the occurrence the
   * glossary's way back returns to. The anchor projection counts its words, as any link's.
   */
  term(
    node: Extract<Inline, { type: "link" }>,
    use: TermUse,
    key: number,
  ): ReactNode {
    return (
      <a
        key={key}
        className={this.lib ? "blocks-term" : "ra-term"}
        {...hook(this.hooks, HOOK.term)}
        id={this.copy ? undefined : use.anchor}
        href={`#gl-${use.id}`}
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls={`tw-${use.id}`}
      >
        {this.inline(node.children)}
      </a>
    );
  }

  /** A citation (§8): the author's words, a no-break space and the source's `[n]`, in one link. */
  citation(
    node: Extract<Inline, { type: "link" }>,
    cite: { sourceId: string; n: number; citeId: string },
    key: number,
  ): ReactNode {
    const only = node.children;
    // The words were only a number (`1` or `[1]`): the link shows `[n]` alone.
    const bare =
      only.length === 1 &&
      only[0].type === "text" &&
      /^\s*\[?\s*\d+\s*\]?\s*$/.test(only[0].text);
    return (
      <a
        key={key}
        className={this.lib ? "link" : "fg-cite"}
        id={this.copy ? undefined : cite.citeId}
        href={`#${cite.sourceId}`}
        title={node.title ?? undefined}
        data-link="anchor"
      >
        {bare ? null : this.inline(only)}
        {/* P30.S20: "[n]" is not the document's text; a bare citation stands for the author's own words. */}
        <span
          className={this.lib ? undefined : "fg-cite__n"}
          {...(bare
            ? { "data-an-len": String(codePoints(inlineText(only)).length) }
            : { "data-an-skip": "" })}
        >
          {bare ? "" : "\u00a0"}[{cite.n}]
        </span>
      </a>
    );
  }

  link(
    href: string,
    title: string | null,
    children: ReactNode,
    key?: number,
    plain?: string,
  ): ReactNode {
    const target = resolveLink(href, this.links);
    if (target.kind === "missing") {
      // Never a dead link and never a leak: no href, no title, no target text.
      return (
        <span
          key={key}
          className={this.lib ? undefined : "kb-link-missing"}
          data-missing-link=""
        >
          {children}
          <span className="sr-only" data-an-skip="">
            {" "}
            {CHAPTER.missingLink}
          </span>
        </span>
      );
    }
    if (target.kind === "external") {
      return (
        <Fragment key={key}>
          <a
            className={this.lib ? "link" : undefined}
            href={target.href}
            title={title ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            data-link="external"
          >
            {children}
            {/* The Library: the label is part of the link's words and wraps with them (D258-t8). */}
            <span
              className={this.lib ? undefined : "kb-ch-link__ext"}
              data-an-skip=""
            >
              {CHAPTER.newTab}
            </span>
          </a>
          {this.printHref(target.href, plain)}
        </Fragment>
      );
    }
    return (
      <Fragment key={key}>
        <a
          className={this.lib ? "link" : undefined}
          href={target.href}
          title={title ?? undefined}
          data-link={target.kind}
        >
          {children}
        </a>
        {target.kind === "internal" ? this.printHref(target.href, plain) : null}
      </Fragment>
    );
  }

  /**
   * P30.S26: what a link prints after its text, on paper only: its address in full, with a
   * break opportunity between segments. A same-app path gets the site's host; an outside URL
   * is kept as it is; an in-document `#` link and a bare link (its text is its address)
   * print nothing more. Not the author's text, so the anchor layer skips it.
   */
  private printHref(href: string, plain: string | undefined): ReactNode {
    if (!href || href.startsWith("#")) return null;
    const address = printAddress(href);
    const text = (plain ?? "").trim();
    const bare = (a: string) =>
      a.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (text && (bare(text) === bare(href) || bare(text) === bare(address)))
      return null;
    return (
      <span className="pp-href pp-only" data-an-skip="">
        {" ("}
        <PrintAddr address={address} />
        {")"}
      </span>
    );
  }

  // --- blocks ------------------------------------------------------------------

  blocks(blocks: readonly Block[]): ReactNode {
    return blocks.map((b, i) => <Fragment key={i}>{this.block(b)}</Fragment>);
  }

  block(block: Block): ReactNode {
    switch (block.type) {
      case "paragraph":
        return this.paragraph(block);
      case "heading": {
        const level = Math.min(Math.max(block.level, 1), 6);
        return createElement(
          `h${level}`,
          {
            id: block.id ?? undefined,
            className: this.lib ? undefined : "kb-ch-h",
            // A Markdown heading's id is for its section list only: no place hook (P63-fk.S27).
            "data-block":
              this.links.format === "md" ? undefined : (block.id ?? undefined),
          },
          this.inline(block.content),
        );
      }
      case "list": {
        const items = block.items.map((item, i) => (
          <li key={i}>{this.blocks(item.blocks)}</li>
        ));
        return block.ordered ? (
          <ol
            start={
              block.start !== null && block.start !== 1
                ? block.start
                : undefined
            }
            data-tight={block.tight ? "" : undefined}
          >
            {items}
          </ol>
        ) : (
          <ul data-tight={block.tight ? "" : undefined}>{items}</ul>
        );
      }
      case "blockquote":
        return (
          <blockquote className={this.lib ? "read-quote" : undefined}>
            {this.blocks(block.blocks)}
          </blockquote>
        );
      case "callout":
        return this.callout(block);
      case "table":
        return this.table(block);
      case "code":
        return this.code(block);
      case "hr":
        return <hr />;
      default:
        return this.typed(block);
    }
  }

  /**
   * §3: an image never sits among words. A native paragraph that holds one is split: the text
   * before it is a paragraph, the image is its own block (`.fg-plain`), the text after it is a
   * new paragraph; a paragraph that is only the image becomes the image. (`md` keeps its inline
   * images: it has no asset map to size a box from.)
   */
  paragraph(block: Extract<Block, { type: "paragraph" }>): ReactNode {
    const stamp = this.take(inlineText(block.content));
    if (
      this.links.format === "md" ||
      !block.content.some((n) => n.type === "image")
    )
      return <p {...Renderer.mark(stamp)}>{this.inline(block.content)}</p>;
    // Each part keeps its place in the paragraph's projected text: the images and the
    // blanks trimmed beside them are not text the page shows.
    const parts: ReactNode[] = [];
    let run: Inline[] = [];
    let at = 0;
    let runAt = 0;
    const flush = () => {
      const text = trimRun(run);
      const offset = runAt + leadTrim(run);
      run = [];
      if (text.length)
        parts.push(
          <p key={parts.length} {...Renderer.mark(stamp, offset)}>
            {this.inline(text)}
          </p>,
        );
    };
    for (const node of block.content) {
      if (node.type === "image") {
        flush();
        parts.push(
          <Fragment key={parts.length}>{this.plainImage(node)}</Fragment>,
        );
        runAt = at;
      } else {
        if (run.length === 0) runAt = at;
        run.push(node);
        at += codePoints(inlineText([node])).length;
      }
    }
    flush();
    return <>{parts}</>;
  }

  plainImage(node: Extract<Inline, { type: "image" }>): ReactNode {
    const name = this.assetName(node.src);
    let id: string | undefined;
    if (name !== null) {
      const seen = (this.imageIds.get(name) ?? 0) + 1;
      this.imageIds.set(name, seen);
      id = seen === 1 ? `img-${name}` : `img-${name}-${seen}`;
    }
    const info = resolveAsset(name, this.links);
    if (this.lib)
      return (
        <figure
          className="read blocks-fig"
          id={id}
          data-block={id}
          style={ratioOf(info?.width ?? null, info?.height ?? null)}
        >
          <ScrollBox
            className="scroll-box blocks-box"
            label={READER_BLOCKS.region.image}
          >
            {this.imageBox(info, node.alt, node.title)}
          </ScrollBox>
        </figure>
      );
    return (
      <div className="fg-plain" id={id} data-block={id}>
        {this.imageBox(info, node.alt, node.title)}
      </div>
    );
  }

  callout(block: Extract<Block, { type: "callout" }>): ReactNode {
    // P29: an unknown type renders as NOTE (ingest refuses it first).
    const kind =
      block.kind && KNOWN_CALLOUTS.has(block.kind) ? block.kind : "NOTE";
    const label = CHAPTER.calloutLabel[kind];
    const titleStamp =
      block.title && block.title.length
        ? this.take(inlineText(block.title))
        : null;
    const title =
      block.title && block.title.length ? this.inline(block.title) : null;
    if (this.lib) return this.libCallout(block, kind, title, titleStamp);
    // §7 the head: the type word in mono, then the title, on one wrapping baseline row.
    // An untitled callout still shows its type word.
    const head = (Tag: "div" | "span") => (
      <Tag className="kb-ch-callout__head">
        <span className="kb-ch-callout__type">{CHAPTER.calloutWord[kind]}</span>
        {title ? (
          <span
            className="kb-ch-callout__title"
            {...hook(this.hooks, HOOK.passage)}
            {...Renderer.mark(titleStamp)}
          >
            {title}
          </span>
        ) : null}
      </Tag>
    );
    if (block.collapsed) {
      return (
        <details
          className="kb-ch-callout"
          data-kind={kind.toLowerCase()}
          data-collapsed=""
        >
          <summary className="kb-ch-callout__sum">
            {head("span")}
            <span className="kb-ch-callout__toggle" aria-hidden="true">
              <span className="kb-ch-callout__toggle-closed">
                {CHAPTER.calloutShow}
              </span>
              <span className="kb-ch-callout__toggle-open">
                {CHAPTER.calloutHide}
              </span>
            </span>
          </summary>
          <div className="kb-ch-callout__body">{this.blocks(block.blocks)}</div>
        </details>
      );
    }
    return (
      <aside
        className="kb-ch-callout"
        data-kind={kind.toLowerCase()}
        aria-label={label}
      >
        {head("div")}
        <div className="kb-ch-callout__body">{this.blocks(block.blocks)}</div>
      </aside>
    );
  }

  /**
   * The Library's callout (frame.md F60): `.callout` (`.is-strong` for Important, Warning and Caution), its kind
   * as a word, its title, then its blocks. A folded one (the author's `-`; Skip in the record) is a `<details>`
   * with the kind and the title on its summary.
   */
  private libCallout(
    block: Extract<Block, { type: "callout" }>,
    kind: string,
    title: ReactNode,
    titleStamp: Stamp | null,
  ): ReactNode {
    const word = CHAPTER.calloutWord[kind];
    const cls = calloutStrong(kind) ? "callout is-strong" : "callout";
    const titled = (Tag: "p" | "span") =>
      title ? (
        <Tag
          className="callout-title"
          {...hook(this.hooks, HOOK.passage)}
          {...Renderer.mark(titleStamp)}
        >
          {title}
        </Tag>
      ) : null;
    if (block.collapsed)
      return (
        <details
          className={cls}
          data-kind={kind.toLowerCase()}
          data-collapsed=""
        >
          <summary>
            <span className="callout-head">
              <span className="callout-kind">{word}</span>
              {titled("span")}
            </span>
          </summary>
          {this.blocks(block.blocks)}
        </details>
      );
    return (
      <aside className={cls} data-kind={kind.toLowerCase()} aria-label={word}>
        <p className="callout-kind">{word}</p>
        {titled("p")}
        {this.blocks(block.blocks)}
      </aside>
    );
  }

  table(block: Extract<Block, { type: "table" }>): ReactNode {
    if (this.lib) return this.libTable(block);
    const cols = block.head.length;
    const rows = block.rows.length;
    // §9: 8 columns or more is wide; more than 20 rows is long.
    const wide = cols >= 8;
    const long = rows > 20;
    return (
      <TableBox
        hooks={this.hooks}
        wide={wide}
        long={long}
        ariaLabel={
          long
            ? CHAPTER.tableBox.ariaLong(cols, rows)
            : CHAPTER.tableBox.ariaSideways(cols)
        }
        hint={
          long
            ? CHAPTER.tableBox.hintLong(rows, cols)
            : CHAPTER.tableBox.hintSideways(cols)
        }
      >
        <table>
          <thead>
            <tr>
              {block.head.map((cell, i) => (
                <th
                  key={i}
                  scope="col"
                  data-align={block.align[i] ?? undefined}
                  {...Renderer.mark(this.take(inlineText(cell)))}
                >
                  {this.inline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          {rows ? (
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      data-align={block.align[i] ?? undefined}
                      {...Renderer.mark(this.take(inlineText(cell)))}
                    >
                      {this.inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      </TableBox>
    );
  }

  /**
   * The Library's table (frame.md F60): `.table` in its own sideways box (`.table-scroll.scroll-box`), the sentence
   * under it while it scrolls; a column whose every cell is a figure set right (`.num`), any other left.
   */
  private libTable(block: Extract<Block, { type: "table" }>): ReactNode {
    const num = figureColumns(
      block.head.length,
      block.rows.map((row) => row.map((cell) => inlineText(cell))),
    );
    const cls = (i: number) => (num[i] ? "num" : undefined);
    return (
      <div className="blocks-scroll" {...hook(this.hooks, HOOK.box)}>
        <ScrollBox
          className="table-scroll scroll-box"
          label={READER_BLOCKS.region.table}
        >
          <table className="table">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cls(i)}
                    {...Renderer.mark(this.take(inlineText(cell)))}
                  >
                    {this.inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            {block.rows.length ? (
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (
                      <td
                        key={i}
                        className={cls(i)}
                        {...Renderer.mark(this.take(inlineText(cell)))}
                      >
                        {this.inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </ScrollBox>
      </div>
    );
  }

  code(block: Extract<Block, { type: "code" }>): ReactNode {
    if (this.lib) return this.libCode(block);
    const stamp = this.take(block.text);
    const lines = highlight(block.text, block.lang);
    // P30.S20: each line carries its offset in the section's text ("code lines carry their
    // offset"), only where its tokens spell exactly the source line.
    const source = block.text.split("\n");
    const lineAt: number[] = [];
    let pos = 0;
    for (const line of source) {
      lineAt.push(pos);
      pos += codePoints(line).length + 1;
    }
    // One block per source line: a wrapped line hangs 2ch under its first (§8), and an
    // ASCII drawing keeps each line whole.
    const plain: { text: string; className?: string }[][] = block.text
      .split("\n")
      .map((t) => [{ text: t }]);
    const body = (lines ?? plain).map((line, i) => (
      <span
        key={i}
        className="kb-ch-code__ln"
        {...hook(this.hooks, HOOK.passage)}
        {...(source[i] !== undefined &&
        line.map((tok) => tok.text).join("") === source[i]
          ? Renderer.mark(stamp, lineAt[i], "code")
          : {})}
      >
        {line.map((tok, j) =>
          tok.className ? (
            <span key={j} className={tok.className}>
              {tok.text}
            </span>
          ) : (
            <Fragment key={j}>{tok.text}</Fragment>
          ),
        )}
      </span>
    ));
    const id = block.id ?? undefined;
    const lang = block.lang ?? undefined;
    // §8 the title bar, when a title is given: the title and the language.
    const bar = block.title ? (
      <figcaption className="kb-ch-code__bar">
        <span className="kb-ch-code__title">{block.title}</span>
        {block.lang ? (
          <span className="kb-ch-code__lang">{block.lang}</span>
        ) : null}
      </figcaption>
    ) : null;
    // §8 ASCII drawings: a `text` fence is drawn as art wherever it appears.
    if (block.lang?.toLowerCase() === "text") {
      return (
        <ArtBox
          hooks={this.hooks}
          id={id}
          lang={lang}
          cols={widestLine(block.text)}
          bar={bar}
          ariaLabel={CHAPTER.drawing.aria}
          hint={CHAPTER.drawing.hint}
        >
          {body}
        </ArtBox>
      );
    }
    return (
      <figure
        className="kb-ch-code"
        id={id}
        data-block={id}
        data-lang={lang}
        {...hook(this.hooks, HOOK.box)}
        {...hook(this.hooks, HOOK.unspoken)}
      >
        {bar}
        <div className="kb-ch-code__wrap">
          <pre className="kb-ch-code__pre">
            <code>{body}</code>
          </pre>
        </div>
      </figure>
    );
  }

  /**
   * The Library's code (frame.md F60): `pre.read-code` in its own sideways box, the sentence under it while it
   * scrolls. One line of the source a line of the box, each carrying its offset in the section's text where it
   * spells the source exactly (as the old box's lines do: the anchoring is the same), with a line break between
   * them. The title, when the author gave one, is a line above the box (the signed code draws none: a question for
   * the operator); a `text` fence (an ASCII drawing) is the same box, named a drawing.
   */
  private libCode(block: Extract<Block, { type: "code" }>): ReactNode {
    const stamp = this.take(block.text);
    const lines = highlight(block.text, block.lang);
    const source = block.text.split("\n");
    const lineAt: number[] = [];
    let pos = 0;
    for (const line of source) {
      lineAt.push(pos);
      pos += codePoints(line).length + 1;
    }
    // Each token keeps the old box's element (a span, now uncoloured: the signed code has no colours), so a line's
    // elements and text nodes are the old ones and a highlight paints the same nodes.
    const tokens = lines ?? source.map((t) => [{ text: t }]);
    const body = tokens.map((line, i) => (
      <Fragment key={i}>
        {i > 0 ? "\n" : null}
        <span
          {...hook(this.hooks, HOOK.passage)}
          {...(source[i] !== undefined &&
          line.map((tok) => tok.text).join("") === source[i]
            ? Renderer.mark(stamp, lineAt[i], "code")
            : {})}
        >
          {line.map((tok: { text: string; className?: string }, j) =>
            tok.className ? (
              <span key={j}>{tok.text}</span>
            ) : (
              <Fragment key={j}>{tok.text}</Fragment>
            ),
          )}
        </span>
      </Fragment>
    ));
    const id = block.id ?? undefined;
    const art = block.lang?.toLowerCase() === "text";
    return (
      <div
        className="blocks-scroll"
        id={id}
        data-block={id}
        data-lang={block.lang ?? undefined}
        {...hook(this.hooks, HOOK.box)}
        {...hook(this.hooks, HOOK.unspoken)}
      >
        {block.title ? <p>{block.title}</p> : null}
        <ScrollBox
          as="pre"
          className="read-code scroll-box"
          label={art ? READER_BLOCKS.region.drawing : READER_BLOCKS.region.code}
        >
          <code>{body}</code>
        </ScrollBox>
      </div>
    );
  }

  // --- typed blocks ----------------------------------------------------------------

  typed(block: TypedBlock): ReactNode {
    const id = block.id ?? undefined;
    switch (block.type) {
      case "figure":
        return this.figure(block, id);
      case "figures":
        return this.figures(block, id);
      case "diagram":
        return this.drawn(block, id, "figure", inl(block.caption));
      case "svg":
        return this.svgBlock(block, id);
      case "quiz":
        return this.quiz(block, id);
      case "sources":
        return this.sources(block, id);
      case "formula":
        return this.formula(block, id);
      case "glossary":
        return this.glossary(id);
      default:
        return null;
    }
  }

  /** P39-hk.S9: the chapter's terms in its language's order (F6: Korean 가나다, Latin after). */
  private sortedTerms(only?: (t: TermEntry) => boolean): TermEntry[] {
    const list = [...this.terms.terms.values()].filter((t) => !only || only(t));
    const order = new Intl.Collator(this.lang, { sensitivity: "base" });
    return list.sort((a, b) => order.compare(a.term, b.term));
  }

  /** The words the reader writes around a term, in English in every chapter (F1). */
  private get chromeLang(): string | undefined {
    return this.lang && !/^en\b/i.test(this.lang) ? "en" : undefined;
  }

  /** "Also called" and a term's aliases, comma-joined (F1): the label English, the aliases the chapter's. */
  private aliases(t: TermEntry, className: string): ReactNode {
    if (!t.aliases.length) return null;
    return (
      <p className={className} lang="en">
        {CHAPTER.terms.alsoCalled}{" "}
        <span lang={this.lang}>{this.keepText(t.aliases.join(", "))}</span>
      </p>
    );
  }

  /**
   * P39-hk.S9 — the glossary section (`10-reading-aids` *The glossary section*; F6, F17, F25,
   * F33): where the author placed the block (by convention after the quiz, before Sources),
   * the reader's h2 "Glossary" with the block's id, then every entry A to Z in the chapter's
   * language. Each entry `gl-<id>`: the term, "Also called …", the short definition, then the
   * longer one in full. A linked term's entry holds its hidden "‹ Back to the text", which the
   * term layer shows, aimed at the very occurrence, when a window's "In the glossary →" lands
   * there. On paper it is the appendix (`kb-print.css`), with no way back.
   */
  glossary(id: string | undefined): ReactNode {
    const list = this.sortedTerms();
    if (!list.length) return null;
    return (
      <>
        <h2
          id={id ?? "glossary"}
          className={this.lib ? undefined : "kb-ch-h"}
          data-block={id}
          lang={this.chromeLang}
        >
          {CHAPTER.terms.glossary}
        </h2>
        {this.lib ? (
          <GlossaryList
            entries={list.map((t) => this.termView(t))}
            linked={
              new Set(
                list.flatMap((t) => (this.terms.uses.has(t.id) ? [t.id] : [])),
              )
            }
            chrome={this.chromeLang}
          />
        ) : (
          this.glossaryList(list)
        )}
      </>
    );
  }

  /**
   * P63-fk.S10: a term as the Library's window and glossary entry draw it (`TermEntryView`): its name kept whole,
   * its aliases in the chapter's language, its definitions. Drawn once a place: the window's copy takes no ids.
   */
  private termView(t: TermEntry): TermEntryView {
    return {
      id: t.id,
      term: this.keepText(t.term),
      aka: t.aliases.length ? (
        <span lang={this.lang}>{this.keepText(t.aliases.join(", "))}</span>
      ) : null,
      short: this.inline(t.short),
      long: t.long ? this.inline(t.long) : null,
    };
  }

  /** The glossary's entries, in the old look. */
  private glossaryList(list: TermEntry[]): ReactNode {
    return (
      <>
        <ul className="ra-gl">
          {list.map((t) => {
            const uses = this.terms.uses.get(t.id);
            return (
              <li key={t.id} className="ra-gl__item" id={`gl-${t.id}`}>
                <p className="ra-gl__term">{this.keepText(t.term)}</p>
                {this.aliases(t, "ra-gl__alias")}
                <p className="ra-gl__def">{this.inline(t.short)}</p>
                {t.long ? (
                  <p className="ra-gl__def">{this.inline(t.long)}</p>
                ) : null}
                {uses ? (
                  <p className="ra-gl__back" lang="en" hidden>
                    <a className="fg-back" href={`#${uses[0].anchor}`}>
                      <span className="fg-back__chev" aria-hidden="true">
                        ‹
                      </span>
                      <span>{CHAPTER.sources.back}</span>
                    </a>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  /**
   * P39-hk.S9 — the windows (`10-reading-aids` *The window*, *The phone sheet*; F3–F5, F18,
   * F32): one hidden `tw-<id>` per linked term, in one `.ra-float` holder at the chapter's end.
   * Static markup: the term layer only toggles `hidden`, `aria-expanded`, the classes and the
   * holder's place, and the same element is the window from the reader's 40rem and the
   * bottom sheet under it (a container query on `rd`). Head: the term and Close; "Also called
   * …"; the short definition, the longer one hidden below a hairline; foot: Read more / Show
   * less in one box, In the glossary →. The definitions' inline math is S8's.
   */
  termWindows(): ReactNode {
    const list = this.sortedTerms((t) => this.terms.uses.has(t.id));
    if (!list.length) return null;
    this.copy = true;
    try {
      if (this.lib)
        return (
          <TermWindows
            entries={list.map((t) => this.termView(t))}
            chrome={this.chromeLang}
          />
        );
      return (
        <div className="ra-float" data-placed="0">
          {list.map((t) => {
            const w = `tw-${t.id}`;
            return (
              <div
                key={t.id}
                className="ra-win"
                id={w}
                role="dialog"
                aria-modal="false"
                aria-labelledby={`${w}-t`}
                tabIndex={-1}
                hidden
              >
                <div className="ra-win__head">
                  <div className="ra-win__names">
                    <p className="ra-win__term" id={`${w}-t`}>
                      {this.keepText(t.term)}
                    </p>
                    {this.aliases(t, "ra-win__alias")}
                  </div>
                  <button
                    type="button"
                    className="rd-btn rd-btn--quiet ra-close"
                    lang={this.chromeLang}
                  >
                    {CHAPTER.terms.close}
                  </button>
                </div>
                <div className="ra-win__body">
                  <p className="ra-def">{this.inline(t.short)}</p>
                  {t.long ? (
                    <p className="ra-def ra-def--long" id={`${w}-l`} hidden>
                      {this.inline(t.long)}
                    </p>
                  ) : null}
                </div>
                <div
                  className={
                    t.long ? "ra-win__foot" : "ra-win__foot ra-win__foot--end"
                  }
                  lang={this.chromeLang}
                >
                  {t.long ? (
                    <button
                      type="button"
                      className="rd-btn ra-more"
                      aria-expanded="false"
                      aria-controls={`${w}-l`}
                    >
                      <span className="ra-swap">
                        <span aria-hidden="false">{CHAPTER.terms.more}</span>
                        <span aria-hidden="true">{CHAPTER.terms.less}</span>
                      </span>
                    </button>
                  ) : null}
                  <a className="ra-go" href={`#gl-${t.id}`}>
                    {CHAPTER.terms.toGlossary}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      );
    } finally {
      this.copy = false;
    }
  }

  /**
   * P39-hk.S8 — the display formula block (`10-reading-aids` *Display formula block*; F7,
   * F27, F36; the `MathBlock` board): `figure.ra-mb`, a band between two hairlines on the
   * column's left edge. The formula in its own measured box (`FormulaBox`), at 1.5 × the
   * text; `aligned` steps are one relation a row, aligned on the relation (Temml's
   * `mtable`). The caption: the reading, "where", then the legend, one symbol column per
   * chapter. Spoken: the figure's name, the formula's `alttext`, then the caption.
   * P39-hk.F1 round 2 (OQ19): each legend symbol in its own measured box (`LegendSymbol`);
   * one wider than the legend's whole row scrolls inside the symbol column, as F7 signs for a
   * display row. Where it fits, the box is two plain inline spans and nothing changes.
   */
  formula(block: TypedBlock, id: string | undefined): ReactNode {
    const raw = str(block.tex);
    if (raw === null) return null;
    // A block scalar keeps its final newline (S7): trimmed before the steps test.
    const tex = raw.replace(/\s+$/, "");
    const alt = str(block.alt) ?? "";
    const reading = inl(block.reading);
    const legend = arr(block.where).flatMap((item) => {
      if (!isRec(item)) return [];
      const sym = str(item.sym);
      return sym === null ? [] : [{ sym, means: inl(item.means) }];
    });
    const steps = isSteps(tex);
    if (this.lib) return this.libFormula(id, tex, alt, reading, legend);
    return (
      <figure
        className={steps ? "ra-mb ra-mb--steps" : "ra-mb"}
        id={id}
        data-block={id}
        aria-label={CHAPTER.formula.label(alt, this.ko)}
      >
        <FormulaBox label={CHAPTER.formula.scrolls(this.ko)}>
          {mathElement(mathTree(tex, true), { alttext: alt })}
        </FormulaBox>
        <figcaption className="ra-mb__cap">
          {reading && reading.length ? (
            <p className="ra-mb__read">{this.inline(reading)}</p>
          ) : null}
          {legend.length ? (
            <>
              <p className="ra-mb__where">{CHAPTER.formula.where(this.ko)}</p>
              <dl className="ra-legend">
                {legend.map((row, i) => {
                  const sym = mathTree(row.sym, false);
                  return (
                    <Fragment key={i}>
                      <dt>
                        <LegendSymbol label={CHAPTER.formula.scrolls(this.ko)}>
                          {mathElement(sym, { alttext: linearText(sym) })}
                        </LegendSymbol>
                      </dt>
                      <dd>{this.inline(row.means)}</dd>
                    </Fragment>
                  );
                })}
              </dl>
            </>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  /**
   * The Library's formula set apart (`BlocksFormula.dc.html`): `figure.read.blocks-fm` between two hairlines, the
   * formula in its own sideways box at the section-heading step in the math face, then its reading, `where` and the
   * legend (`dl.blocks-legend`: one symbol column for the chapter, the symbol at the text's size, the meaning at the
   * small step). A Korean chapter's `where` is its own word (`CHAPTER.formula`).
   */
  private libFormula(
    id: string | undefined,
    tex: string,
    alt: string,
    reading: Inline[] | null,
    legend: { sym: string; means: Inline[] | null }[],
  ): ReactNode {
    return (
      <figure className="read blocks-fm" id={id} data-block={id}>
        <ScrollBox
          className="scroll-box blocks-box blocks-fm-eq"
          label={READER_BLOCKS.region.formula}
        >
          {mathElement(mathTree(tex, true), { alttext: alt })}
        </ScrollBox>
        {(reading && reading.length) || legend.length ? (
          <figcaption className="blocks-figcap">
            {reading && reading.length ? (
              <p className="blocks-fm-read">{this.inline(reading)}</p>
            ) : null}
            {legend.length ? (
              <>
                <p className="blocks-fm-where">
                  {this.ko
                    ? CHAPTER.formula.where(true)
                    : READER_BLOCKS.formula.where}
                </p>
                <dl className="blocks-legend">
                  {legend.map((row, i) => {
                    const sym = mathTree(row.sym, false);
                    return (
                      <Fragment key={i}>
                        <dt>
                          {mathElement(sym, { alttext: linearText(sym) })}
                        </dt>
                        <dd>{this.inline(row.means)}</dd>
                      </Fragment>
                    );
                  })}
                </dl>
              </>
            ) : null}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  /**
   * The Library's caption and credit (`BlocksFigure.dc.html`): `.blocks-cap`, then `.blocks-credit` (**Credit**,
   * then the text). No number, no "Figure"; the still-frame line is not drawn.
   */
  private libFigcap(
    caption: Inline[] | null,
    credit: Inline[] | null,
  ): ReactNode {
    const hasCaption = !!caption && caption.length > 0;
    const hasCredit = !!credit && credit.length > 0;
    if (!hasCaption && !hasCredit) return null;
    return (
      <figcaption className="blocks-figcap">
        {hasCaption ? (
          <p className="blocks-cap">{this.inline(caption)}</p>
        ) : null}
        {hasCredit ? (
          <p className="blocks-credit">
            <b>{READER_BLOCKS.figure.credit}</b>
            <span>{this.inline(credit)}</span>
          </p>
        ) : null}
      </figcaption>
    );
  }

  /** §2 the figure's caption, credit and (for an animated asset) the still-frame line. */
  figcap(
    caption: Inline[] | null,
    credit: Inline[] | null,
    still: boolean,
  ): ReactNode {
    const hasCredit = !!credit && credit.length > 0;
    if (!(caption && caption.length) && !hasCredit && !still) return null;
    return (
      <figcaption className="fg-figcap">
        {caption && caption.length ? (
          <p className="fg-cap">{this.inline(caption)}</p>
        ) : null}
        {hasCredit ? (
          <p className="fg-credit">
            <span className="fg-credit__label">{CHAPTER.figure.credit}</span>
            <span className="fg-credit__text">{this.inline(credit)}</span>
          </p>
        ) : null}
        {still ? <p className="fg-still">{CHAPTER.figure.still}</p> : null}
      </figcaption>
    );
  }

  /** §2 the figure (`figure` block): an image, its caption and its credit; `column` or `wide`. */
  figure(block: TypedBlock, id: string | undefined): ReactNode {
    const info = resolveAsset(str(block.src), this.links);
    const wide = str(block.width) === "wide";
    const media = this.imageBox(info, str(block.alt) ?? "");
    // The Library's figure (`BlocksFigure.dc.html`): the image on its own ratio in its sideways box (a wide one never
    // narrower than the column's full width), then the caption and the credit.
    if (this.lib)
      return (
        <figure
          className={wide ? "read blocks-fig is-wide" : "read blocks-fig"}
          id={id}
          data-block={id}
          style={ratioOf(info?.width ?? null, info?.height ?? null)}
        >
          <ScrollBox
            className="scroll-box blocks-box"
            label={READER_BLOCKS.region.image}
          >
            {media}
          </ScrollBox>
          {this.libFigcap(inl(block.caption), inl(block.credit))}
        </figure>
      );
    const caption = this.figcap(
      inl(block.caption),
      inl(block.credit),
      !!info && info.animated && info.stillUrl !== null,
    );
    // A `wide` figure is a scroll box when it overflows (measured in the browser); a column
    // figure never is.
    if (wide)
      return (
        <ScrollFigure
          id={id}
          kind="image"
          wide
          ariaLabel={CHAPTER.figure.aria}
          hint={CHAPTER.figure.hint}
          caption={caption}
        >
          {media}
        </ScrollFigure>
      );
    return (
      <figure className="fg-fig" id={id} data-block={id}>
        <div className="fg-box">
          <div className="fg-box__scroll">{media}</div>
        </div>
        {caption}
      </figure>
    );
  }

  /** §4 the figure row (`figures` block): 2-3 items under the row's caption, between two hairlines. */
  figures(block: TypedBlock, id: string | undefined): ReactNode {
    const items = recs(block.items);
    const cards = items.length > 0 && items.every((i) => i.kind === "card");
    const caption = inl(block.caption);
    // The Library draws no row of figures: its items, one under the other, each as the signed body draws it (an
    // image a figure, a drawing a drawing, a card a quiet callout), then the row's caption (an operator question).
    if (this.lib)
      return (
        <figure className="read blocks-fig" id={id} data-block={id}>
          {items.map((item, i) => (
            <Fragment key={i}>
              {this.figuresItem(item, `${id ?? "figures"}-${i + 1}`)}
            </Fragment>
          ))}
          {this.libFigcap(caption, null)}
        </figure>
      );
    return (
      <figure
        className={`fg-row fg-row--${items.length}${cards ? "fg-row--cards" : ""}`}
        id={id}
        data-block={id}
      >
        {caption && caption.length ? (
          <figcaption className="fg-row__cap">
            {this.inline(caption)}
          </figcaption>
        ) : null}
        <div className="fg-row__items">
          <div className="fg-row__grid">
            {items.map((item, i) => (
              <Fragment key={i}>
                {this.figuresItem(item, `${id ?? "figures"}-${i + 1}`)}
              </Fragment>
            ))}
          </div>
        </div>
      </figure>
    );
  }

  /** An item's own caption: under the item, in secondary. */
  itemCap(nodes: Inline[] | null): ReactNode {
    if (!nodes || !nodes.length) return null;
    if (this.lib) return this.libFigcap(nodes, null);
    return (
      <figcaption className="fg-figcap">
        <p className="fg-cap">{this.inline(nodes)}</p>
      </figcaption>
    );
  }

  figuresItem(item: Rec, scope: string): ReactNode {
    if (this.lib) return this.libItem(item, scope);
    switch (item.kind) {
      case "image":
        return (
          <figure className="fg-item" data-kind="image">
            {this.imageBox(
              resolveAsset(str(item.src), this.links),
              str(item.alt) ?? "",
            )}
            {this.itemCap(inl(item.caption))}
          </figure>
        );
      case "diagram":
        return isRec(item.diagram) ? (
          <figure className="fg-item" data-kind="diagram">
            {this.drawn(item.diagram, undefined, "div", null)}
            {this.itemCap(inl(item.caption))}
          </figure>
        ) : null;
      case "svg":
        return (
          <figure className="fg-item fg-svg fg-svg--item" data-kind="svg">
            {this.svg(item.svg, str(item.label) ?? "", scope, true)}
            {this.itemCap(inl(item.caption))}
          </figure>
        );
      case "card":
        return this.card(item);
      default:
        return null;
    }
  }

  /** The Library's item of a row: an image, a drawing or an svg as a figure of its own; a card as a quiet callout. */
  private libItem(item: Rec, scope: string): ReactNode {
    switch (item.kind) {
      case "image": {
        const info = resolveAsset(str(item.src), this.links);
        return (
          <figure
            className="read blocks-fig"
            style={ratioOf(info?.width ?? null, info?.height ?? null)}
          >
            <ScrollBox
              className="scroll-box blocks-box"
              label={READER_BLOCKS.region.image}
            >
              {this.imageBox(info, str(item.alt) ?? "")}
            </ScrollBox>
            {this.itemCap(inl(item.caption))}
          </figure>
        );
      }
      case "diagram":
        return isRec(item.diagram)
          ? this.drawn(item.diagram, undefined, "div", inl(item.caption))
          : null;
      case "svg":
        return (
          <figure className="read blocks-fig">
            <ScrollBox
              className="scroll-box blocks-box"
              label={READER_BLOCKS.region.drawing}
            >
              {this.islandOf(() =>
                this.svg(item.svg, str(item.label) ?? "", scope, true),
              )}
            </ScrollBox>
            {this.itemCap(inl(item.caption))}
          </figure>
        );
      case "card":
        return this.card(item);
      default:
        return null;
    }
  }

  /** §5 the row card: a title and a Markdown body on the tone's soft ground. A tone is never the only signal. */
  card(item: Rec): ReactNode {
    if (this.lib)
      return (
        <aside className="callout">
          <p className="callout-title">{this.text(str(item.title) ?? "")}</p>
          {arr(item.body).map((para, i) => (
            <p key={i}>{this.inline(inl(para))}</p>
          ))}
        </aside>
      );
    return (
      <div className={`fg-card fg-tone-${tone(item.tone)}`} data-kind="card">
        <p className="fg-card__title">{this.text(str(item.title) ?? "")}</p>
        {arr(item.body).map((para, i) => (
          <p key={i} className="fg-card__p">
            {this.inline(inl(para))}
          </p>
        ))}
      </div>
    );
  }

  /** How many drawn diagrams this render has made (their title ids: `dg-title-<n>`). */
  private dgCount = 0;

  /**
   * A diagram, drawn on the server into safe React elements (`03-diagrams` round 01): the frame in the slot, the
   * drawing (an SVG for flow, state and sequence, HTML in `em` for stack, timeline and chart), the visually hidden
   * text alternative and the caption. `tag` is `div` inside a figure-row item, whose own figcaption carries the
   * caption.
   */
  drawn(
    d: Rec,
    id: string | undefined,
    tag: "figure" | "div",
    caption: Inline[] | null,
  ): ReactNode {
    const kind = kindOf(d);
    if (this.lib) return this.libDrawn(d, kind, id, tag, caption);
    const { drawing, alt } = diagramParts(
      d,
      kind,
      (s) => this.text(s),
      CHAPTER.diagram.alt.lead,
    );
    this.dgCount += 1;
    return (
      <DiagramFigure
        id={id}
        kind={kind}
        tag={tag}
        titleId={`dg-title-${this.dgCount}`}
        title={this.text(str(d.title) ?? "")}
        drawing={drawing}
        alt={alt}
        caption={
          caption && caption.length ? (
            <figcaption className="dg__cap">{this.inline(caption)}</figcaption>
          ) : null
        }
        ariaLabel={CHAPTER.diagram.aria}
        hint={CHAPTER.diagram.hint}
      />
    );
  }

  /**
   * The Library's drawing (`BlocksDiagram.dc.html`): `figure.read.blocks-dg` named by its title, the drawing in its
   * sideways box, its text alternative for a screen reader, then its caption. A flow in one row (`rowOf`) is drawn as
   * signed: boxes and lines placed in a row. Every other drawing (a branching flow, a state machine, a sequence, a
   * stack, a timeline, a chart) keeps its own drawing, in its old look, in the signed frame (an operator question).
   */
  private libDrawn(
    d: Rec,
    kind: string,
    id: string | undefined,
    tag: "figure" | "div",
    caption: Inline[] | null,
  ): ReactNode {
    this.dgCount += 1;
    const titleId = `dg-title-${this.dgCount}`;
    const row = kind === "flow" ? rowOf(graphSpec(d)) : null;
    let drawing: ReactNode;
    let alt: ReactNode;
    if (row) {
      drawing = (
        <div className="blocks-dg-draw" aria-hidden="true">
          {row.map((n, i) => (
            <Fragment key={i}>
              {i > 0 ? <i className="blocks-dg-edge" /> : null}
              <div className="blocks-dg-node">
                <b>{this.text(n.label)}</b>
                {n.sub ? <span>{this.text(n.sub)}</span> : null}
              </div>
            </Fragment>
          ))}
        </div>
      );
      alt = (
        <div className="sr-only">
          <p>{READER_BLOCKS.drawing.alt}</p>
          <ul>
            {row.map((n, i) => (
              <li key={i}>
                {this.text(
                  READER_BLOCKS.drawing.item(
                    n.label,
                    n.sub,
                    row[i + 1]?.label ?? null,
                  ),
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    } else {
      const parts = diagramParts(
        d,
        kindOf(d),
        (s) => this.text(s),
        READER_BLOCKS.drawing.alt,
        "sr-only",
      );
      drawing = (
        <OldIsland>
          <div className={`dg dg--${kind}`} data-kind={kind}>
            <div className="dg__box">
              <div className="dg__scroll">{parts.drawing}</div>
            </div>
          </div>
        </OldIsland>
      );
      alt = parts.alt;
    }
    const Root = tag;
    return (
      <Root
        className="read blocks-dg"
        id={id}
        data-block={id}
        data-kind={kind}
        aria-labelledby={titleId}
        role={tag === "div" ? "group" : undefined}
      >
        <p className="blocks-dg-title" id={titleId}>
          {this.text(str(d.title) ?? "")}
        </p>
        <ScrollBox
          className="scroll-box blocks-box"
          label={READER_BLOCKS.region.drawing}
        >
          {drawing}
        </ScrollBox>
        {alt}
        {caption && caption.length ? (
          <figcaption className="blocks-cap">{this.inline(caption)}</figcaption>
        ) : null}
      </Root>
    );
  }

  /** §6 the `svg` block: the drawing, scrolling in its box when narrower than its smallest label allows. */
  svgBlock(block: TypedBlock, id: string | undefined): ReactNode {
    const caption = inl(block.caption);
    // The Library draws no svg block: a figure, the drawing in its sideways box, in its own old look (its tones are
    // the old palette's) in an island (an operator question).
    if (this.lib)
      return (
        <figure className="read blocks-fig" id={id} data-block={id}>
          <ScrollBox
            className="scroll-box blocks-box"
            label={READER_BLOCKS.region.drawing}
          >
            {this.islandOf(() =>
              this.svg(block.svg, str(block.label) ?? "", id ?? "svg", false),
            )}
          </ScrollBox>
          {this.itemCap(caption)}
        </figure>
      );
    return (
      <ScrollFigure
        id={id}
        kind="svg"
        wide={false}
        ariaLabel={CHAPTER.drawing.aria}
        hint={CHAPTER.drawing.hint}
        caption={this.itemCap(caption)}
      >
        {this.svg(block.svg, str(block.label) ?? "", id ?? "svg", false)}
      </ScrollFigure>
    );
  }

  /**
   * Rebuild a validated svg tree as React elements, through the allowlist again. `--fg-vbw` is
   * the viewBox's width; `--fg-minw` (a block, not a row item) is the width below which the
   * drawing's smallest label would be under 11 px (16 when the source sets no font-size).
   */
  svg(tree: unknown, label: string, scope: string, item: boolean): ReactNode {
    if (!isRec(tree) || tree.name !== "svg") return null;
    const root = tree as unknown as SvgElement;
    const props = svgAttrsToProps("svg", root.attrs ?? {}, scope);
    const vbw = viewBoxWidth(root.attrs?.viewBox);
    const style: Record<string, string | number> = {};
    if (vbw !== null) {
      style["--fg-vbw"] = vbw;
      if (!item)
        style["--fg-minw"] = `${Math.ceil((vbw * 11) / smallestFont(root))}px`;
    }
    return createElement(
      "svg",
      {
        ...props,
        xmlns: "http://www.w3.org/2000/svg",
        role: "img",
        "aria-label": label,
        className: ["fg-svg__svg", props.className].filter(Boolean).join(" "),
        style,
      },
      this.svgChildren(root, scope),
    );
  }

  svgChildren(node: SvgElement, scope: string): ReactNode {
    const children = node.children ?? [];
    // <title>/<desc> take ONE string child: React 19 treats `title` as document
    // metadata and stringifies anything else ("[object Object]"), which also
    // breaks hydration. Text elsewhere goes in as plain strings too.
    if (TEXT_ELEMENTS.has(node.name) && children.every((c) => "text" in c)) {
      return children.map((c) => ("text" in c ? c.text : "")).join("");
    }
    return children.map((child: SvgChild, i) => {
      if ("text" in child)
        return TEXT_ELEMENTS.has(node.name) ? child.text : null;
      if (!allowedSvgElement(child.name) || child.name === "svg") return null;
      return createElement(
        child.name,
        { key: i, ...svgAttrsToProps(child.name, child.attrs ?? {}, scope) },
        this.svgChildren(child, scope),
      );
    });
  }

  /**
   * The quiz (`04-quiz` round 01): the chapter's one client island. The block's items are
   * handed over as data (`spec`: grading is client-side, so the key ships in the page) and
   * as rendered inline Markdown, so a link in a prompt, an option or an explanation is the
   * reader's link. The island paints the state the view model gives (saved answers
   * included) and hydrates to answer, grade, retry and save.
   */
  quiz(block: TypedBlock, id: string | undefined): ReactNode {
    // P63-fk.S10: the Library draws a quiz of the board's three forms; one holding a form only `04-quiz` signs keeps
    // the product's own look, whole, in an island of the Library's body.
    if (this.lib) {
      const specs = recs(block.items).flatMap((item, i) => {
        const spec = specOf(item, i + 1);
        return spec ? [spec] : [];
      });
      if (drawable(specs)) return this.libQuiz(block, id);
      return this.islandOf(() => this.quiz(block, id));
    }
    const bid = id ?? "quiz";
    const title = str(block.title);
    const q = this.quizCtx;
    const items: QuizItemProps[] = [];
    // P30.S26: the same items for paper (the quiz as printed, and its answer key).
    const paper: PrintItem[] = [];
    recs(block.items).forEach((item, i) => {
      const spec = specOf(item, i + 1);
      if (!spec) return;
      const domId = `${bid}--${spec.id}`;
      const explain = inl(item.explain);
      const props: QuizItemProps = {
        spec,
        domId,
        prompt: null,
        explain: explain && explain.length ? this.inline(explain) : undefined,
        signInHref: q?.signIn
          ? signInToSaveHref(q.signIn.target, {
              lang: q.signIn.lang,
              version: q.signIn.version,
              section: domId,
            })
          : null,
        saved: q?.saved[domId],
      };
      if (spec.type === "choice") {
        props.prompt = this.inline(inl(item.prompt));
        props.options = recs(item.options).map((o) => this.inline(inl(o.text)));
      } else if (spec.type === "recall") {
        props.prompt = this.inline(inl(item.prompt));
        props.answer = this.inline(inl(item.answer));
      } else {
        this.cloze = { n: 0 };
        try {
          props.prompt = this.inline(inl(item.text));
        } finally {
          this.cloze = null;
        }
      }
      items.push(props);
      // P39-hk.S9: paper's copy is drawn again, without ids (a term's `tm-<id>-<n>`, a
      // citation's): the island holds them, and an id is the page's once.
      const sheet: PrintItem = this.copied(() => ({
        spec,
        prompt: spec.type === "cloze" ? null : this.inline(inl(item.prompt)),
        options:
          spec.type === "choice"
            ? recs(item.options).map((o) => this.inline(inl(o.text)))
            : undefined,
        answer:
          spec.type === "recall" ? this.inline(inl(item.answer)) : undefined,
        explain: explain && explain.length ? this.inline(explain) : undefined,
      }));
      if (spec.type === "cloze") {
        // The sentence again, its blanks as numbered rules instead of the island's inputs.
        this.cloze = { n: 0, print: true };
        try {
          sheet.prompt = this.copied(() => this.inline(inl(item.text)));
        } finally {
          this.cloze = null;
        }
      }
      paper.push(sheet);
    });
    const noun = q?.place ?? "chapter";
    if (paper.length) this.printKeys.push({ title, items: paper });
    return (
      <>
        <QuizBlock
          id={bid}
          name={title ? `${CHAPTER.quiz.label}: ${title}` : CHAPTER.quiz.label}
          title={title ? this.text(title) : undefined}
          items={items}
          member={q?.member ?? false}
          write={q?.write ?? null}
          version={q?.version ?? 0}
          place={noun}
          lang={q?.lang ?? "en"}
        />
        {paper.length ? (
          <PrintQuiz
            title={title ? this.text(title) : null}
            items={paper}
            noun={noun}
          />
        ) : null}
      </>
    );
  }

  /**
   * P63-fk.S10 — the quiz in the Library's look (`LibraryQuiz`; Library round 02, `BlocksQuiz.dc.html`): the same
   * items, the same reader's context and the same save path as the old island (`quiz` above), its words drawn in the
   * Library's look. Paper keeps today's quiz and answer key: their copy is drawn in the old look, the printed quiz
   * in an old-look island (print only), the key with the chapter's others at the body's end.
   */
  private libQuiz(block: TypedBlock, id: string | undefined): ReactNode {
    const bid = id ?? "quiz";
    const title = str(block.title);
    const q = this.quizCtx;
    const items: LibraryQuizItem[] = [];
    const paper: PrintItem[] = [];
    recs(block.items).forEach((item, i) => {
      const spec = specOf(item, i + 1);
      if (!spec) return;
      const domId = `${bid}--${spec.id}`;
      const explain = inl(item.explain);
      const props: LibraryQuizItem = {
        spec,
        domId,
        prompt: null,
        explain: explain && explain.length ? this.inline(explain) : undefined,
        signInHref: q?.signIn
          ? signInToSaveHref(q.signIn.target, {
              lang: q.signIn.lang,
              version: q.signIn.version,
              section: domId,
            })
          : null,
        saved: q?.saved[domId],
      };
      if (spec.type === "choice") {
        props.prompt = this.inline(inl(item.prompt));
        props.options = recs(item.options).map((o) => this.inline(inl(o.text)));
      } else if (spec.type === "recall") {
        props.prompt = this.inline(inl(item.prompt));
        props.answer = this.inline(inl(item.answer));
      } else {
        this.cloze = { n: 0 };
        try {
          props.prompt = this.inline(inl(item.text));
        } finally {
          this.cloze = null;
        }
      }
      items.push(props);
      // Paper's copy, as today: the old look, without ids.
      this.lib = false;
      try {
        const sheet: PrintItem = this.copied(() => ({
          spec,
          prompt: spec.type === "cloze" ? null : this.inline(inl(item.prompt)),
          options:
            spec.type === "choice"
              ? recs(item.options).map((o) => this.inline(inl(o.text)))
              : undefined,
          answer:
            spec.type === "recall" ? this.inline(inl(item.answer)) : undefined,
          explain: explain && explain.length ? this.inline(explain) : undefined,
        }));
        if (spec.type === "cloze") {
          this.cloze = { n: 0, print: true };
          try {
            sheet.prompt = this.copied(() => this.inline(inl(item.text)));
          } finally {
            this.cloze = null;
          }
        }
        paper.push(sheet);
      } finally {
        this.lib = true;
      }
    });
    const noun = q?.place ?? "chapter";
    let printed: ReactNode = null;
    if (paper.length) {
      this.printKeys.push({ title, items: paper });
      this.lib = false;
      try {
        printed = (
          <OldIsland>
            <PrintQuiz
              title={title ? this.text(title) : null}
              items={paper}
              noun={noun}
            />
          </OldIsland>
        );
      } finally {
        this.lib = true;
      }
    }
    return (
      <>
        <LibraryQuiz
          id={bid}
          name={
            title
              ? `${READER_AIDS.quiz.label}: ${title}`
              : READER_AIDS.quiz.label
          }
          items={items}
          member={q?.member ?? false}
          write={q?.write ?? null}
          version={q?.version ?? 0}
          lang={q?.lang ?? "en"}
        />
        {printed}
      </>
    );
  }

  /** §7 the sources list; each item draws its way back from the citations (`cites.ts`). */
  sources(block: TypedBlock, id: string | undefined): ReactNode {
    if (this.lib) return this.libSources(block, id);
    return (
      <ol
        className="fg-src"
        id={id}
        data-block={id}
        aria-label={CHAPTER.sources.label}
      >
        {recs(block.items).map((item, i) => {
          const sid = str(item.id);
          const url = str(item.url);
          const target = url ? resolveLink(url, this.links) : null;
          const meta = [
            str(item.publisher),
            str(item.date),
            item.accessed
              ? CHAPTER.sources.accessed(String(item.accessed))
              : null,
          ].filter((m): m is string => !!m);
          const note = str(item.note);
          return (
            <li key={i} className="fg-src__item" id={sid ?? undefined}>
              <span className="fg-src__n">[{i + 1}]</span>
              <div className="fg-src__body">
                <p className="fg-src__title">
                  {this.text(str(item.title) ?? "")}
                </p>
                {meta.length ? (
                  <p className="fg-src__meta">
                    {meta.map((m, j) => (
                      <Fragment key={j}>
                        {j > 0 ? <span aria-hidden="true"> · </span> : null}
                        {this.text(m)}
                      </Fragment>
                    ))}
                  </p>
                ) : null}
                {url ? (
                  <p className="fg-src__url">
                    <span className="pp-screen">
                      {target?.kind === "external" ? (
                        <a
                          className="fg-src__link"
                          href={target.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-link="external"
                        >
                          {url}
                          <span className="kb-ch-link__ext">
                            {CHAPTER.newTab}
                          </span>
                        </a>
                      ) : (
                        url
                      )}
                    </span>
                    {/* P30.S26: on paper the address, broken between its segments. */}
                    <span className="pp-src__addr pp-only" data-an-skip="">
                      <PrintAddr address={url} />
                    </span>
                  </p>
                ) : null}
                {note ? (
                  <p className="fg-src__note">{this.text(note)}</p>
                ) : null}
                {sid ? this.sourceBack(sid) : null}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  /**
   * The Library draws no sources list: a numbered list (`ol`, the body's own), each source its title, its publisher,
   * date and access, its address (a link, the address in full on paper), its note and its way back to the
   * citations (an operator question).
   */
  private libSources(block: TypedBlock, id: string | undefined): ReactNode {
    return (
      <ol id={id} data-block={id} aria-label={CHAPTER.sources.label}>
        {recs(block.items).map((item, i) => {
          const sid = str(item.id);
          const url = str(item.url);
          const target = url ? resolveLink(url, this.links) : null;
          const meta = [
            str(item.publisher),
            str(item.date),
            item.accessed
              ? CHAPTER.sources.accessed(String(item.accessed))
              : null,
          ].filter((m): m is string => !!m);
          const note = str(item.note);
          return (
            <li key={i} id={sid ?? undefined}>
              <p>{this.text(str(item.title) ?? "")}</p>
              {meta.length ? (
                <p>
                  {meta.map((m, j) => (
                    <Fragment key={j}>
                      {j > 0 ? <span aria-hidden="true"> · </span> : null}
                      {this.text(m)}
                    </Fragment>
                  ))}
                </p>
              ) : null}
              {url ? (
                <p>
                  <span className="pp-screen">
                    {target?.kind === "external" ? (
                      <a
                        className="link"
                        href={target.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-link="external"
                      >
                        {url}
                        <span>{CHAPTER.newTab}</span>
                      </a>
                    ) : (
                      url
                    )}
                  </span>
                  <span className="pp-src__addr pp-only" data-an-skip="">
                    <PrintAddr address={url} />
                  </span>
                </p>
              ) : null}
              {note ? <p>{this.text(note)}</p> : null}
              {sid ? this.sourceBack(sid) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  /** §7 the way back: once cited, one link; cited twice or more, a lead and one lettered link each; never cited, none. */
  sourceBack(sid: string): ReactNode {
    const cites = this.plan.sources.get(sid)?.cites ?? [];
    if (!cites.length) return null;
    if (cites.length === 1) {
      const c = cites[0];
      return (
        <p className={this.lib ? undefined : "fg-src__back"}>
          <a
            className={this.lib ? "link" : "fg-back"}
            href={`#${c.citeId}`}
            aria-label={CHAPTER.sources.backAria(c.section)}
          >
            <span
              className={this.lib ? undefined : "fg-back__chev"}
              aria-hidden="true"
            >
              ‹
            </span>
            <span>{CHAPTER.sources.back}</span>
          </a>
        </p>
      );
    }
    return (
      <p className={this.lib ? undefined : "fg-src__back"}>
        <span>{CHAPTER.sources.backLead}</span>
        {cites.map((c, i) => {
          const letter = letters(i);
          return (
            <a
              key={c.citeId}
              className={this.lib ? "link" : "fg-back fg-back--letter"}
              href={`#${c.citeId}`}
              aria-label={CHAPTER.sources.backLetterAria(
                letter,
                cites.length,
                c.section,
              )}
            >
              <span
                className={this.lib ? undefined : "fg-back__chev"}
                aria-hidden="true"
              >
                ‹
              </span>{" "}
              {letter}
            </a>
          );
        })}
      </p>
    );
  }
}

/** The viewBox's width, or null when it is not four numbers (ingest checked it; defence in depth). */
function viewBoxWidth(viewBox: string | undefined): number | null {
  const parts = (viewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0
    ? parts[2]
    : null;
}

/** The smallest `font-size` attribute in the drawing; 16 when it sets none. */
function smallestFont(root: SvgElement): number {
  let smallest = Infinity;
  const walk = (node: SvgElement) => {
    const size = parseFloat(node.attrs?.["font-size"] ?? "");
    if (Number.isFinite(size) && size > 0) smallest = Math.min(smallest, size);
    for (const child of node.children ?? [])
      if (!("text" in child)) walk(child);
  };
  walk(root);
  return Number.isFinite(smallest) ? smallest : 16;
}
