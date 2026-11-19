// The Workspace's docs pages (design job 02, page docs: `Docs.dc.html`, `DocsList.dc.html`, `DocsNotice.dc.html`,
// `DocsVersions.dc.html`; frame.md F42, F78, F79, F82), verbatim. The words the frame already holds (the place's
// name, the heads Text, Retired and Earlier versions, the facts' labels, the badge Earlier version, `Docs did not
// load.`) are `@/content/workspace/frame`'s and are not repeated here. Imported by its own path.

import { plural } from "@/lib/format";

export const WS_DOCS = {
  /** The list panel's head (`h2`): the place's own name. */
  head: "Docs",
  /** The list's count: `5 docs`, or `5 docs, 2 stale`. */
  count: (docs: number, stale: number) =>
    `${plural(docs, "doc")}${stale ? `, ${stale} stale` : ""}`,
  /** The Retired panel's count: `2 docs`. */
  retiredCount: (docs: number) => plural(docs, "doc"),
  /** The table's column heads (F79). */
  columns: ["Doc", "Status", "Version", "Versioned", "From"],
  /** The words that join a stacked row's three facts into one line (`v14, versioned Oct 28, from P6-b2`). */
  join: { versioned: ", versioned ", from: ", from " },
  /** The Text panel's count: `9 sections`. */
  sections: (n: number) => plural(n, "section"),
  /** A stale doc's notice: `4 notes from P7-m3 and P8-q4 are not folded into this doc yet.` */
  stale: {
    from: " from ",
    /** After the phases: `are`, or `is` for one note. */
    rest: (single: boolean) =>
      ` ${single ? "is" : "are"} not folded into this doc yet.`,
  },
  /** An earlier version's notice: `The current version is v14, versioned Oct 28.` */
  earlier: {
    before: "The current version is ",
    after: (date: string) => `, versioned ${date}.`,
  },
  /** An earlier version's own facts: Versioned and Summary. */
  summary: "Summary",
  /** An earlier version's title: the doc's title, then the version (`Architecture v12`). */
  earlierTitle: (title: string, version: string) => `${title} ${version}`,
  /** An earlier version's row, named for what it opens: `Open v13`. */
  openVersion: (version: string) => `Open ${version}`,
  /** The back link from an earlier version reads the doc's title; its name says where it goes. */
  backTo: (title: string) => `Back to ${title}`,
  loading: "Loading…",
} as const;
