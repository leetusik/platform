import { DocumentLoading } from "@/hi2vi/reader/document";

// P63-fk.S12 — Loading keeps the reader's frame and scheme (`Document.dc.html`, Loading): the Bar complete,
// skeleton bars for the title, two facts and three paragraphs, no foot until the document is ready.
export default function DocumentLoadingPage() {
  return <DocumentLoading />;
}
