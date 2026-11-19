// A slice's page (design job 02, rounds 01-workspace and 02-agenda-and-links: `Slice.dc.html`, `SliceHead`,
// `SliceVerdict`, `SliceCommits`; frame.md F78, F305), verbatim. The heads and the fact labels are the frame's
// glossary (`@/content/workspace/frame`, `WS_GLOSSARY`); this file holds what only this page says. Imported by
// its own path, never through `content/index.ts`.

import { plural } from "@/lib/format";

export const WS_SLICE = {
  /** The back link reads the phase's id; its accessible name says where it goes. */
  back: (phase: string) => `Back to ${phase}`,
  /** A slice that is done and wrote no result (a design slice). */
  noResult: "No result text. A design slice ends with a signed design.",
  /** A slice with no plan yet. */
  noPlan: "No plan yet. It is written when work on this slice starts.",
  /** A plan earns its Sections list from this many sections (F84). */
  outlineFrom: 5,
  loading: "Loading…",
  commits: {
    /** `2 commits`. */
    count: (n: number) => plural(n, "commit"),
    /** The row's link, to a screen reader: `Commit 4f1c2a9 in platform on GitHub: Serve the app at the apex`. */
    label: (short: string, repo: string, subject: string) =>
      `Commit ${short} in ${repo} on GitHub: ${subject}`,
    /** Read before the repo's name in a row. */
    repo: "Repository ",
  },
} as const;
