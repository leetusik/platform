import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BOOK_NOTES } from "@/content/book-notes";
import { Bar } from "@/sikstack/library";
import {
  BookNotesBody,
  NotesFrame,
  notesOpening,
} from "@/sikstack/reader/book-notes";
import { requestNonce } from "@/sikstack/shell/data";
import { requireIdentity } from "@/lib/auth-guards";
import { loadNotesPage } from "@/lib/reader/book-notes-load";
import { LIBRARY_HREF } from "@/lib/reader-href";

// Notes in this book (sikstack Library, job 03 round 02, `## Build` § Page: book-notes): `/@{org}/{project}/notes/{book}`,
// beside `books/` so a chapter keyed `notes` keeps its address. Wholly new on the Bar's frame (`.ui > .page >
// .app.bare > Bar + main.app-main > .column.is-narrow`). The reader's own marks, so it needs a session: a visitor
// is sent to sign in and back here (`requireIdentity`). Every miss (an unknown org, project or book, a private
// project) is the same Book not found (`./not-found.tsx`).
//
// `?from=book` is the book page's link: the Bar's way back is the book. Otherwise it was opened from a chapter's
// Notes sheet, which names the chapter, language, version and section to return to (`ch`, `lang`, `v`, `at`).

export const metadata: Metadata = {
  title: BOOK_NOTES.title,
  robots: { index: false },
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function BookNotesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string; book: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params;
  const org = safeDecode(p.org);
  const project = safeDecode(p.project);
  const book = safeDecode(p.book);
  // THE GUARD: our public namespace is `@`-prefixed. Reject before the session is read.
  if (!org.startsWith("@") || org.length < 2) notFound();
  if (project === "" || book === "") notFound();
  const q = await searchParams;
  const { token } = await requireIdentity();
  const [view, nonce] = await Promise.all([
    loadNotesPage({
      token,
      org: org.slice(1),
      project,
      book,
      opening: notesOpening((k) => q[k]),
    }),
    requestNonce(),
  ]);
  return (
    <NotesFrame
      nonce={nonce}
      bar={
        <Bar
          back={view.back.label}
          backShort={view.back.short}
          backHref={view.back.href}
          homeHref={LIBRARY_HREF}
        />
      }
    >
      <BookNotesBody key={`${org}/${project}/${book}`} view={view} />
    </NotesFrame>
  );
}
