import { ReaderMissing } from "@/sikstack/reader";

// P63-fk.S8 — Chapter not found, in the bar's frame (`Chapter.dc.html`): a missing chapter and one
// private to this reader are the same screen, with a member's and a visitor's words.
export default function ChapterNotFound() {
  return <ReaderMissing />;
}
