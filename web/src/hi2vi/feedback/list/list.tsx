"use client";

import type { MouseEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  feedbackChangeHref,
  feedbackHref,
  feedbackPageHref,
  type FeedbackChange,
  type FeedbackPlace,
} from "@/lib/feedback/place";

import type { ListPhase } from "./model";
import { FeedbackListView, type FeedbackListViewProps } from "./view";

/** What the server read: everything but where a request is. */
export type FeedbackListProps = Omit<
  FeedbackListViewProps,
  | "phase"
  | "pending"
  | "onSearch"
  | "onProject"
  | "onRating"
  | "onClear"
  | "onPage"
  | "onRetry"
> & {
  /** The list did not load. */
  failed: boolean;
};

type Held = Pick<FeedbackListProps, "rows" | "total" | "place">;

type Asked = {
  phase: "loading" | "searching" | "paging";
  page: number | null;
  /**
   * The place asked for, drawn at once while the request is out, as the board does: the search, the
   * project and the rating as sent (so Clear shows as soon as one is set), or on Clear the field empty,
   * Any rating pressed and Clear gone. The bar's field and select take a new value in place (no redraw),
   * so focus stays where it was.
   */
  shown?: Partial<FeedbackPlace>;
};

/** Clear's place, drawn at once (`page` stays until the rows land). */
const CLEARED = { q: "", project: null, rating: null } as const;

/** A click the browser should keep (a new tab, a download): never taken over. */
const ownClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey;

/**
 * The list's client island (`result.md` § The list, *Wiring*; F141, F340): every way through the list is
 * an App Router navigation to its address (S3's place), in one transition.
 *
 * - **A newer request replaces one in flight**: each is a `router.push` in a transition. The router
 *   still commits an overtaken navigation when its answer comes first (seen in P65-nh.S9: two quick page
 *   clicks drew the first page's rows for a moment), so while a page is asked for the island keeps
 *   drawing the rows, total and place it had when the first request left (`held`), and only the newest
 *   answer, once the transition ends, replaces them.
 * - **Search, a filter, Clear**: the rows become skeleton rows and the count a bar until it lands
 *   (`searching`); the bar stays usable and shows what was asked at once (`Asked.shown`).
 * - **A page**: the page asked for is marked current at once, the rows on screen stay with the panel
 *   `aria-busy` until it lands (`paging`), then the window goes to its top.
 * - **Try again** reads the page again on the server (`router.refresh()`): the page's loading state
 *   (`loading`, the bar disabled), then the list or this block again.
 */
export function FeedbackList({ failed, ...data }: FeedbackListProps) {
  const router = useRouter();
  const [inFlight, start] = useTransition();
  const [asked, setAsked] = useState<Asked | null>(null);
  /** What was on screen when the first request of this transition left: drawn while a page loads. */
  const [held, setHeld] = useState<Held | null>(null);
  const toTop = useRef(false);
  const { scope, place } = data;

  useEffect(() => {
    if (inFlight || !toTop.current) return;
    toTop.current = false;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [inFlight, place.page]);

  const go = (href: string, next: Asked) => {
    toTop.current = next.phase === "paging";
    setAsked(next);
    setHeld((h) =>
      inFlight && h ? h : { rows: data.rows, total: data.total, place },
    );
    start(() => {
      router.push(href, { scroll: false });
    });
  };
  const change = (to: FeedbackChange) =>
    go(feedbackChangeHref(scope, place, to), {
      phase: "searching",
      page: null,
      shown: to,
    });

  const phase: ListPhase =
    inFlight && asked ? asked.phase : failed ? "failed" : "ready";

  return (
    <FeedbackListView
      {...data}
      {...(phase === "paging" && held ? held : null)}
      {...(phase === "searching" && asked?.shown
        ? { place: { ...place, ...asked.shown } }
        : null)}
      phase={phase}
      pending={phase === "paging" ? (asked?.page ?? null) : null}
      onSearch={(q) => change({ q: q.trim() })}
      onProject={(project, q) => change({ project, q: q.trim() })}
      onRating={(rating, q) => change({ rating, q: q.trim() })}
      onClear={(event) => {
        if (ownClick(event)) return;
        event.preventDefault();
        go(feedbackHref(scope), {
          phase: "searching",
          page: null,
          shown: CLEARED,
        });
      }}
      onPage={(n, event) => {
        if (ownClick(event)) return;
        event.preventDefault();
        go(feedbackPageHref(scope, place, n), { phase: "paging", page: n });
      }}
      onRetry={() => {
        toTop.current = false;
        setAsked({ phase: "loading", page: null });
        start(() => {
          router.refresh();
        });
      }}
    />
  );
}
