import { DocumentMissing } from "@/hi2vi/reader/document";

// P63-fk.S12 — Document not found, in the bar's frame (`Document.dc.html`: Not found, Not found visitor).
// Reached by the page's non-integer id short-circuit (before the session is read, so a visitor lands here
// too), by `loadDocument`'s `notFound()` in the member branch (a missing, cross-tenant or non-integer id: ids
// cannot be probed) and by a version that does not exist. A visitor's miss on a real id still goes to sign in.
export default function DocumentNotFound() {
  return <DocumentMissing />;
}
