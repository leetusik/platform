"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BOOK_PAGE } from "@/content/book-page";
import { ReadingData, type ReadingDataPhase } from "@/sikstack/library";
import {
  AudioHead,
  bookHeadOf,
  bookRowsOf,
  bookStartOf,
  bookTrackOf,
  ListenTrack,
  type BookListenSeedView,
  type ListenWhat,
} from "@/sikstack/listen";
import { clearBookReadingData } from "@/lib/book/actions";
import { clearedView } from "@/lib/book/model";
import type { BookView } from "@/lib/book/view";
import { unitOfKey } from "@/lib/listen/book";
import { listenActions, useKept, useListen } from "@/lib/listen/store";

import { BookChapters } from "./book-chapters";
import { BookContinue } from "./book-continue";
import { BookHead } from "./book-head";

/**
 * The book page's column (`Book.dc.html`, `## Build` § Page: book, 24 px between parts): BookHead,
 * BookContinue, Contents with BookChapters, then Your reading data. The page holds the one open version
 * region and the clear's phase. A clear calls the existing action; once it lands the page reads as cleared
 * at once (`clearedView`) and is read again from the server, and Your reading data stays, with its cleared
 * line, until the reader leaves.
 *
 * Listen (job 07, round 01: F206, F209, F234 FG2, C01; `Listen.dc.html`'s book view): for a member, AudioHead under
 * the head's facts (`bookHeadOf`), each row's audio line (`bookRowsOf`), and `.listen-book`: the column and the
 * dock's track, held as a grid from 64em whether or not a Listen is under way (`bookTrackOf`). Listen, Continue
 * listening and Start over start the Listen inside the press and open its chapter's reader (`bookStartOf`); the
 * track holds the dock, or Listen's pill once the head's control is under the top bar. A visitor's column stands
 * alone. The opened player is the frame's (`BookFrame`).
 */
export function BookBody({
  view: served,
  listen: seed = null,
  signInHref,
}: {
  view: BookView;
  listen?: BookListenSeedView | null;
  /** Sign in, for the dock's lead and the note's action once signed out mid-Listen. */
  signInHref: string;
}) {
  const router = useRouter();
  const listen = useListen();
  const kept = useKept();
  const [starting, setStarting] = useState(false);
  const [past, setPast] = useState(false);
  const slotRef = useRef<HTMLDivElement | null>(null);
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

  // F206: the slot is a member's only, and only where the server could seed a Listen of the book.
  const shown = !!seed && view.signedIn && view.head.member;
  const unit = seed ? unitOfKey(seed.start.key) : null;
  // The Listen answered the press: the busy form ends.
  const answered =
    starting && !!listen && listen.unit === unit && listen.state !== "loading";
  if (answered) setStarting(false);
  const head =
    shown && seed
      ? bookHeadOf({
          listen,
          seed,
          kept,
          starting: starting && !answered,
          count: view.count,
        })
      : null;

  // Listen's pill (F207, listen:FG3): once the head's control is under the top bar.
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const slot = slotRef.current;
      const bar = slot?.closest(".app")?.querySelector(".bar-wrap");
      const under =
        !!slot &&
        !!bar &&
        slot.getBoundingClientRect().bottom <=
          bar.getBoundingClientRect().bottom;
      setPast((prev) => (prev === under ? prev : under));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [shown]);

  /** Start a Listen inside the press, then open its chapter's reader with the dock. */
  const begin = (what: "listen" | "resume" | "startover") => {
    if (!seed || starting) return;
    const go = bookStartOf(what, seed, kept);
    if (!go) return;
    setStarting(true);
    listenActions.start(go.seed, go.from);
    if (go.href) router.push(go.href);
  };
  const onListen = (what: ListenWhat) => {
    switch (what) {
      case "listen":
      case "resume":
      case "startover":
        begin(what);
        return;
      case "play":
        listenActions.play();
        return;
      case "retry":
        listenActions.retry();
        return;
      case "update":
        listenActions.update();
        return;
      case "signin":
        window.location.assign(signInHref);
        return;
    }
  };

  const showData = view.signedIn && (!!data || phase !== "rest");
  const t = BOOK_PAGE.contents;
  const track = bookTrackOf({ shown, listen });
  const control = head?.control ?? null;
  return (
    <div className={track.wrap}>
      <div className="column is-narrow book-col">
        <BookHead
          head={view.head}
          listen={
            head ? (
              <AudioHead head={head} onListen={onListen} slotRef={slotRef} />
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
          <BookChapters
            rows={view.rows}
            open={open}
            onVersions={setOpen}
            audio={shown ? bookRowsOf(seed, listen) : null}
          />
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
      </div>
      {track.track ? (
        <ListenTrack
          seed={null}
          shown={shown}
          pill={past && head?.show === "control"}
          chapter={false}
          hidden={false}
          signInHref={signInHref}
          held
          starting={starting && !answered}
          pillOf={
            control
              ? {
                  control,
                  go: () =>
                    begin(control.form === "resume" ? "resume" : "listen"),
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}
