// The words of an html document in its Original layout (src/hi2vi/reader/document/original.tsx; P63-fk.S13).
// Verbatim from the signed boards of Library round 02 (job 03: `Document.dc.html`'s state Original layout,
// `ReaderHead.dc.html`, `Bar.dc.html`; frame.md's Bar `tag` and its list of tags). Everything else the page says is
// the document page's (`@/content/reader-document`), the frame's (`@/content/reader-frame`) or, for the parts
// kept from the legacy reader (the frame's own name, the paper notice), `@/content/reader`'s `legacy` and
// `print`, unchanged. Imported by its own path, never through `content/index.ts`.

export const READER_ORIGINAL = {
  /** The tag in the bar and the head: the document is shown in its own layout, not the Library's. */
  tag: "Original layout",
} as const;
