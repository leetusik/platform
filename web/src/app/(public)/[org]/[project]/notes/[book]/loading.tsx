import { headers } from "next/headers";

import { Bar } from "@/hi2vi/library";
import {
  NotesFrame,
  NotesLoading,
  notesPlace,
} from "@/hi2vi/reader/book-notes";
import { requestNonce } from "@/hi2vi/shell/data";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";
import { LIBRARY_HREF } from "@/lib/reader-href";

// Notes in this book while it loads (`BookNotes.dc.html`, preset Loading): the Bar complete, its way back
// `Book` or `Chapter` from the address (no book read to name it by); the `h1`, skeleton facts, the three
// choices disabled with no count, two panels of skeleton rows, `aria-busy` and `Loading…`.
export default async function BookNotesLoading() {
  const [path, nonce] = await Promise.all([
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
    requestNonce(),
  ]);
  const back = notesPlace(path);
  return (
    <NotesFrame
      nonce={nonce}
      bar={
        <Bar
          back={back.label}
          backShort={back.short}
          backHref={back.href}
          homeHref={LIBRARY_HREF}
        />
      }
    >
      <NotesLoading />
    </NotesFrame>
  );
}
