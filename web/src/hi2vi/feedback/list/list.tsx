"use client";

import type { MouseEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  feedbackChangeHref,
  feedbackHref,
  feedbackPageHref,
  type FeedbackChange,
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

type Asked = { phase: "loading" | "searching" | "paging"; page: number | null };

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
 * - **A newer request replaces one in flight**: each is a `router.push` in a transition; the router
 *   drops a navigation a newer one overtook, so a result that is no longer the newest never lands.
 * - **Search, a filter, Clear**: the rows become skeleton rows and the count a bar until it lands
 *   (`searching`); the bar stays usable.
 * - **A page**: the page asked for is marked current at once, the rows on screen stay with the panel
 *   `aria-busy` until it lands (`paging`), then the window goes to its top.
 * - **Try again** reads the page again on the server (`router.refresh()`): the page's loading state
 *   (`loading`, the bar disabled), then the list or this block again.
 */
export function FeedbackList({ failed, ...data }: FeedbackListProps) {
  const router = useRouter();
  const [inFlight, start] = useTransition();
  const [asked, setAsked] = useState<Asked | null>(null);
  const toTop = useRef(false);
  const { scope, place } = data;

  useEffect(() => {
    if (!toTop.current) return;
    toTop.current = false;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [place.page]);

  const go = (href: string, next: Asked) => {
    toTop.current = next.phase === "paging";
    setAsked(next);
    start(() => {
      router.push(href, { scroll: false });
    });
  };
  const change = (to: FeedbackChange) =>
    go(feedbackChangeHref(scope, place, to), {
      phase: "searching",
      page: null,
    });

  const phase: ListPhase =
    inFlight && asked ? asked.phase : failed ? "failed" : "ready";

  return (
    <FeedbackListView
      {...data}
      phase={phase}
      pending={phase === "paging" ? (asked?.page ?? null) : null}
      onSearch={(q) => change({ q: q.trim() })}
      onProject={(project, q) => change({ project, q: q.trim() })}
      onRating={(rating, q) => change({ rating, q: q.trim() })}
      onClear={(event) => {
        if (ownClick(event)) return;
        event.preventDefault();
        go(feedbackHref(scope), { phase: "searching", page: null });
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
