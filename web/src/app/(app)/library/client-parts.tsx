"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { LIBRARY_PAGE } from "@/content/library-page";
import { Choice, ReadingData, type ReadingDataPhase } from "@/hi2vi/library";
import { LibraryContinue, LibraryDocs } from "@/hi2vi/library/lists";
import { clearAllReadingData } from "@/lib/library/actions";
import {
  viewHref,
  type LibraryPlace,
  type LibraryView,
} from "@/lib/library/list-place";

import { LibraryBarLoading, ShelvesLoading } from "./parts";

/**
 * The view (`Library.dc.html`, frame.md F320): **By project** and **All documents**, a `Choice` at the
 * toolbar's end. Switching keeps the list's search, filter and page: they are the address's, and
 * the other view is the same address with another `view`.
 */
export function ViewChoice({ place }: { place: LibraryPlace }) {
  const router = useRouter();
  const t = LIBRARY_PAGE.view;
  return (
    <Choice<LibraryView>
      label={t.label}
      value={place.view}
      options={[
        { value: "project", content: t.project },
        { value: "all", content: t.all },
      ]}
      onChange={(view) => {
        if (view !== place.view) router.push(viewHref(place, view));
      }}
    />
  );
}

/**
 * Your reading data (frame.md F69), last on the page in every state. The page holds the phase: the
 * clear is the library's one write (`clearAllReadingData`); cleared, the page reads its lists again,
 * so every reading state reads Not started.
 */
export function LibraryReadingData() {
  const router = useRouter();
  const [phase, setPhase] = useState<ReadingDataPhase>("rest");
  const [, startRefresh] = useTransition();
  return (
    <ReadingData
      scope="all"
      phase={phase}
      onPhase={(next) => {
        setPhase(next);
        if (next !== "clearing") return;
        void clearAllReadingData()
          .then((result) => {
            setPhase(result.ok ? "cleared" : "failed");
            if (result.ok)
              startRefresh(() => {
                router.refresh();
              });
          })
          .catch(() => setPhase("failed"));
      }}
    />
  );
}

/**
 * The library's failed state (`Library.dc.html` Failed, frame.md F97): `The library did not load.`
 * and **Try again**, which reads the page again; while it does, the loading state's parts.
 */
export function LibraryFailed() {
  const router = useRouter();
  const [pending, startRetry] = useTransition();
  if (pending)
    return (
      <>
        <LibraryContinue loading />
        <section
          className="section library-view"
          aria-label={LIBRARY_PAGE.views}
          aria-busy="true"
        >
          <LibraryBarLoading />
          <ShelvesLoading />
        </section>
      </>
    );
  return (
    <section className="panel" aria-label={LIBRARY_PAGE.views}>
      <div className="block">
        <p className="block-text" role="alert">
          {LIBRARY_PAGE.failed}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() =>
            startRetry(() => {
              router.refresh();
            })
          }
        >
          {LIBRARY_PAGE.retry}
        </button>
      </div>
    </section>
  );
}

/**
 * The views while the page loads (`Library.dc.html` Loading): the toolbar's count as a bar and no
 * choice; By project's two sections of skeleton rows, or All documents' table skeleton. The view is
 * the address's.
 */
export function ViewsLoading() {
  const all = useSearchParams().get("view") === "all";
  return (
    <section
      className="section library-view"
      aria-label={LIBRARY_PAGE.views}
      aria-busy="true"
    >
      <LibraryBarLoading />
      {all ? (
        <LibraryDocs phase="loading" head={false} projects={[]} />
      ) : (
        <ShelvesLoading />
      )}
    </section>
  );
}
