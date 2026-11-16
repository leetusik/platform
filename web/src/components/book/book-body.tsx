"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BOOK_PAGE } from "@/content/book-page";
import { ReadingData, type ReadingDataPhase } from "@/hi2vi/library";
import { clearBookReadingData } from "@/lib/book/actions";
import { clearedView } from "@/lib/book/model";
import type { BookView } from "@/lib/book/view";

import { BookChapters } from "./book-chapters";
import { BookContinue } from "./book-continue";
import { BookHead } from "./book-head";
import { BookListen, type BookListenSeedView } from "./book-listen";
import { ListenHost } from "./listen-host";

/**
 * The book page's column (`Book.dc.html`, `## Build` § Page: book, 24 px between parts): BookHead,
 * BookContinue, Contents with BookChapters, then Your reading data. The page holds the one open version
 * region and the clear's phase. A clear calls the existing action; once it lands the page reads as cleared
 * at once (`clearedView`) and is read again from the server, and Your reading data stays, with its cleared
 * line, until the reader leaves.
 *
 * Listen (operator decision 3): the head's control for a reader who is signed in, in its old look (the dock
 * and the player are mounted by the page, outside the column).
 */
export function BookBody({
  view: served,
  listen = null,
}: {
  view: BookView;
  listen?: BookListenSeedView | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [phase, setPhase] = useState<ReadingDataPhase>("rest");
  const [cleared, setCleared] = useState(false);
  const [data] = useState(served.data);
  const view = cleared ? clearedView(served) : served;

  async function clear() {
    let ok = false;
    try {
      ok = (
        await clearBookReadingData({
          org: view.org,
          project: view.project,
          book: view.slug,
        })
      ).ok;
    } catch {
      ok = false;
    }
    if (ok) {
      setCleared(true);
      setOpen(null);
      setPhase("cleared");
      router.refresh();
    } else {
      setPhase("failed");
    }
  }

  const onPhase = (next: ReadingDataPhase) => {
    if (next === "clearing") {
      if (phase === "clearing") return;
      setPhase("clearing");
      void clear();
      return;
    }
    setPhase(next);
  };

  const showData = view.signedIn && (!!data || phase !== "rest");
  const t = BOOK_PAGE.contents;
  return (
    <>
      <BookHead
        head={view.head}
        listen={
          listen && view.signedIn ? (
            <ListenHost>
              <BookListen seed={listen} count={view.count} />
            </ListenHost>
          ) : null
        }
      />
      <BookContinue cont={view.cont} notes={view.notes} />
      <section className="section" aria-labelledby="book-contents">
        <div className="section-head">
          <h2 id="book-contents">{t.title}</h2>
          <span className="meta">{view.count}</span>
        </div>
        {view.shapeNote ? <p className="dim">{view.shapeNote}</p> : null}
        <BookChapters rows={view.rows} open={open} onVersions={setOpen} />
      </section>
      {showData ? (
        <ReadingData
          scope="book"
          subject={view.title}
          chapters={data?.chapters ?? 0}
          marks={data?.marks ?? 0}
          phase={phase}
          onPhase={onPhase}
        />
      ) : null}
    </>
  );
}
