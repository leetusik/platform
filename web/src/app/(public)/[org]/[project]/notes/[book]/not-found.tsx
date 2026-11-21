import { Bar } from "@/sikstack/library";
import { MISSING_BACK, NotesFrame } from "@/sikstack/reader/book-notes";
import { requestNonce } from "@/sikstack/shell/data";
import { StateBlock } from "@/sikstack/states";
import { BOOK_NOTES } from "@/content/book-notes";
import { LIBRARY_HREF } from "@/lib/reader-href";

// Book not found (`BookNotes.dc.html`, preset Not found; frame.md F71): a missing book, a private book's
// address and one in another org are the same state, 404 and never 403. The Bar's way back is the Library;
// F5's block with the page's own words and Back to Library.
export default async function BookNotesNotFound() {
  const nonce = await requestNonce();
  const t = BOOK_NOTES.notFound;
  return (
    <NotesFrame
      nonce={nonce}
      state
      bar={
        <Bar
          back={MISSING_BACK.label}
          backShort={MISSING_BACK.short}
          backHref={MISSING_BACK.href}
          homeHref={LIBRARY_HREF}
        />
      }
    >
      <StateBlock
        narrow
        state={{
          title: t.title,
          text: t.text,
          actions: [
            {
              kind: "link",
              label: t.back,
              href: LIBRARY_HREF,
              variant: "default",
            },
          ],
          reference: null,
        }}
      />
    </NotesFrame>
  );
}
