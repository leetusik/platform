/**
 * P63-fk.S9 — the two looks of a text's body, and the hooks both carry.
 *
 * `ChapterView` draws a body in one of two looks:
 *
 * - **old** (the default): the markup every caller had before the Library, byte for byte (`kb-ch-*`, `fg-*`,
 *   `ra-*`, `dg*`), styled by `app/reader.css` and `app/reader-aids.css`. Review's cards, the old version page and
 *   the document routes (until the document page's slice) read it.
 * - **library**: the signed body of a text (job 03, Library round 02: frame.md F60 and `## Build` § Page: blocks),
 *   in the frame's classes (`.read`, `.read-quote`, `.read-code`, `.scroll-box`, `.scroll-hint`, `.table`,
 *   `.callout`, `.link`) and the Blocks page's (`.blocks-*`, `styles/library/blocks.css`). It carries no class the
 *   old sheets style, but inside its old-look islands (`data-island`: the parts later slices rebuild).
 *
 * The layers that read a body in the page (annotations, terms, Listen's following, the reader's memory, the
 * reading aids' measures, print's preparation) find it and its parts by the HOOKS below, never by a class, so
 * the same layers work on both looks. A reader turns them on (`hooks`); the default old look carries none, so
 * every other caller keeps the markup it had.
 */

export type BodyLook = "old" | "library";

/** The hook attributes (`data-*`), one name each; every consumer reads these and nothing else. */
export const HOOK = {
  /** The body's root (the `ChapterView` element). */
  body: "data-reader-body",
  /** The prose column the body sits in. */
  prose: "data-reader-prose",
  /** The article that holds the body and its layers (the Library's; the document routes' is `.rd-article`). */
  article: "data-reader-article",
  /** A passage-like container anchoring skips into when it carries no stamp (a code line, a callout's title). */
  passage: "data-an-passage",
  /** A run kept whole (a hyphenated word; a formula with its Korean particle). */
  keep: "data-keep",
  /** A term link (the term layer opens its window). */
  term: "data-term",
  /** A block that scrolls in its own box (a code block, a table): a tap on it never toggles the bars. */
  box: "data-box",
  /** A block Listen does not read aloud (code, a block that couldn't be shown). */
  unspoken: "data-unspoken",
  /** An old-look island inside the Library body, and the element holding its content. */
  island: "data-island",
  islandBody: "data-island-body",
} as const;

/** Every hook a body may carry: what the default old look must never carry. */
export const BODY_HOOKS: readonly string[] = [
  HOOK.body,
  HOOK.prose,
  HOOK.article,
  HOOK.passage,
  HOOK.keep,
  HOOK.term,
  HOOK.box,
  HOOK.unspoken,
  HOOK.island,
  HOOK.islandBody,
];

/** `{ [name]: "" }` when `on`, else `{}`: a hook attribute spread onto an element. */
export const hook = (on: boolean, name: string): Record<string, string> =>
  on ? { [name]: "" } : {};

/**
 * A box that scrolls sideways says so and is a Tab stop only while it scrolls (frame.md F60, the `fit` recipe of
 * `Read.dc.html`). Pure: the state follows from the box's measured widths NOW, never from what it measured before,
 * so a table loaded wide and narrowed and widened again is in the state it loaded in (D154-by).
 */
export function scrollState(box: {
  scrollWidth: number;
  clientWidth: number;
}): {
  scrolls: boolean;
  tabIndex: 0 | -1;
} {
  const scrolls = box.scrollWidth > box.clientWidth + 1;
  return { scrolls, tabIndex: scrolls ? 0 : -1 };
}

/** A cell that is only a figure (`Read.dc.html`: a number, its grouping, a sign, a per cent). */
export const isFigure = (text: string): boolean =>
  /^[-−+]?[\d,.]+\s?%?$/.test(text.trim());

/** Each column whose every body cell is a figure is set right (the system's `.num`); a table with no rows has none. */
export function figureColumns(
  cols: number,
  rows: readonly string[][],
): boolean[] {
  return Array.from(
    { length: cols },
    (_, i) =>
      rows.length > 0 &&
      rows.every((r) => r[i] !== undefined && isFigure(r[i])),
  );
}

/** F60: Important, Warning and Caution are the strong rank (an `--edge` box); Note, Skip and Definition quiet. */
const STRONG = new Set(["IMPORTANT", "WARNING", "CAUTION"]);
export const calloutStrong = (kind: string): boolean => STRONG.has(kind);

/** A flow the signed drawing draws: one row of boxes, each joined to the next by one plain line. */
export interface RowNode {
  label: string;
  sub: string | null;
}

/**
 * The nodes of a flow that is one row (the Blocks page's Drawing: `nodes: [{ label, sub }]`), or null when the
 * flow is anything else (a branch, a group, a labelled or dashed line, a placed, shaped, toned or fielded box, a
 * start or an end marked, the `down` direction): those keep their own drawing.
 */
export function rowOf(spec: {
  direction?: string | null;
  nodes: readonly {
    id: string;
    label: string;
    sub?: string | null;
    at?: unknown;
    shape?: string | null;
    fields?: readonly string[] | null;
    tone?: string | null;
  }[];
  groups?: readonly unknown[] | null;
  edges?:
    | readonly {
        from: string;
        to: string;
        label?: string | null;
        style?: string | null;
        tone?: string | null;
      }[]
    | null;
  initial?: string | null;
  final?: readonly string[] | null;
}): RowNode[] | null {
  const nodes = spec.nodes;
  const edges = spec.edges ?? [];
  if (nodes.length < 2) return null;
  if (spec.direction && spec.direction !== "right") return null;
  if ((spec.groups ?? []).length || spec.initial || (spec.final ?? []).length)
    return null;
  if (
    nodes.some(
      (n) =>
        (n.at !== undefined && n.at !== null) ||
        (n.shape && n.shape !== "box") ||
        (n.fields && n.fields.length) ||
        (n.tone && n.tone !== "default"),
    )
  )
    return null;
  if (edges.length !== nodes.length - 1) return null;
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    if (e.from !== nodes[i].id || e.to !== nodes[i + 1].id) return null;
    if (
      e.label ||
      (e.style && e.style !== "solid") ||
      (e.tone && e.tone !== "default")
    )
      return null;
  }
  return nodes.map((n) => ({ label: n.label, sub: n.sub ?? null }));
}
