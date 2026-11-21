import { DocumentMissing } from "@/sikstack/reader/document";

// P63-fk.S12 — Document not found, in the bar's frame (`Document.dc.html`: Not found, Not found visitor),
// for the pretty share address. Reached by the page's `@`-prefix guard (this route is the catch-all for every
// unmatched three-segment address, so `/nope/x/y` lands here: D249-7z), by `loadDocument`'s `notFound()`
// for the resolver's one indistinguishable 404 (unknown org, project or slug, a private project) and by a
// version that does not exist. A member: Back to Library; a visitor: the visitor's words and Sign in.
export default function PrettyDocumentNotFound() {
  return <DocumentMissing />;
}
