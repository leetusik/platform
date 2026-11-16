// The words of the body of a text in the Library's reader (P63-fk.S9): verbatim from the signed boards of Library
// round 02 (job 03: `Read.dc.html`, `BlocksFigure.dc.html`, `BlocksDiagram.dc.html`, `BlocksFormula.dc.html`;
// frame.md F60). Imported by its own path, never through the content barrel. The words the old body already had
// and keeps (a link's " · new tab", a missing link's "(link unavailable)", "This block couldn't be shown.", the
// callouts' kind words, a Korean chapter's "여기서") stay in `./chapter`.

export const READER_BLOCKS = {
  /** Under a box that scrolls sideways, shown only while it scrolls (F60). */
  scrollHint: "Scroll sideways to see the rest.",
  /** Each scroll box's region name. */
  region: {
    code: "Code",
    table: "Table",
    image: "Image",
    drawing: "Drawing",
    formula: "Formula",
  },
  figure: {
    missing: "Image not available",
    credit: "Credit",
  },
  drawing: {
    /** The drawing's text alternative, for a screen reader: its lead, then one item a box. */
    alt: "The drawing, as text.",
    item: (label: string, sub: string | null, next: string | null): string =>
      `${label}${sub ? ` (${sub})` : ""}${next !== null ? `. Goes to ${next}.` : ", an end state."}`,
  },
  formula: {
    /** Over the legend: lowercase, as a mathematician writes it. */
    where: "where",
  },
} as const;
