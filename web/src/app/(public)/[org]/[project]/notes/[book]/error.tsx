"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { Bar } from "@/hi2vi/library";
import {
  NotesChoiceWaiting,
  NotesFailed,
  NotesFrame,
  NotesHead,
  notesPlace,
} from "@/hi2vi/reader/book-notes";
import { boundaryRetry, type BoundaryRetryProps } from "@/hi2vi/states";
import { LIBRARY_HREF } from "@/lib/reader-href";

// Did not load (`BookNotes.dc.html`, preset Did not load) when the book itself did not load: the head stands
// (with no title to name), the choices disabled, one panel: `Notes did not load.` and Try again, which fetches
// the page again (`boundaryRetry`). The page draws the same state in place, with the book's title, when only the
// marks did not load. The Bar's way back comes from the address.
export default function BookNotesError({
  // the boundary's error: nothing of it is shown here (the board draws no reference line)
  error: _error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const back = notesPlace(`${pathname}${query ? `?${query}` : ""}`);
  return (
    <NotesFrame
      bar={
        <Bar
          back={back.label}
          backShort={back.short}
          backHref={back.href}
          homeHref={LIBRARY_HREF}
        />
      }
    >
      <NotesHead>
        <NotesChoiceWaiting />
      </NotesHead>
      <NotesFailed onRetry={boundaryRetry(retry)} />
    </NotesFrame>
  );
}
