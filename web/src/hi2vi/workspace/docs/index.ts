// The Workspace's docs pages (design job 02, page docs: `Docs.dc.html`, `DocsList.dc.html`, `DocsNotice.dc.html`,
// `DocsVersions.dc.html`): the list with Retired, one doc, an earlier version, a retired doc. They emit the signed
// markup and the classes of src/hi2vi/styles/workspace/docs.css; their words are `@/content/workspace/docs`. The
// pure model (no React, no I/O) is tested on its own.
export {
  docsCount,
  docSource,
  docsRow,
  docView,
  placeHrefs,
  retiredCount,
  type DocsRowView,
  type DocView,
  type EarlierNotice,
  type StaleNotice,
  type VersionRowView,
} from "./model";
export { DocsList, type DocsListState } from "./list";
export { DocPage, DocVersions } from "./doc";
export { DocBackRow, DocLoading } from "./head";
export { DocsListFailed, DocStateBlock } from "./retry";
