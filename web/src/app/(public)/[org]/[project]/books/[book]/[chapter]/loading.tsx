import { ReaderLoading } from "@/hi2vi/reader";

// P63-fk.S8 — Loading keeps the reader's frame and scheme (`Chapter.dc.html`, frame.md F93): the Bar,
// skeleton bars in the real elements, no foot bar until the chapter is ready.
export default function ChapterLoading() {
  return <ReaderLoading />;
}
