"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { mapSegments, readablesOf, type ReadableEl } from "@/lib/listen/follow";
import { noteKey } from "@/lib/listen/machine";
import { takeScroll, useListen } from "@/lib/listen/store";
import type { Listen } from "@/lib/listen/types";

import { followsIn } from "./model";

/** This page's Listen: the unit's, and (a book) heard on this page's chapter. */
function onThisPage(
  listen: Listen | null,
  unit: string | null,
  chapter: string | null,
): listen is Listen {
  return (
    !!listen &&
    !!unit &&
    listen.unit === unit &&
    (listen.kind !== "book" || listen.ch === chapter)
  );
}

/**
 * Follow along (F210): the block the voice reads gets `data-follow="true"` (the Listen sheet draws its 2 px
 * accent rule beside the text), when follow along is on, this page shows the Listen's text (a book: its
 * chapter) and the state is one with a place (`./model` `followsIn`). It moves nothing and never scrolls the
 * page. Which block: the engine's spoken segment, mapped onto the page's readable blocks
 * (`@/lib/listen/follow`), as before.
 *
 * Go to the text is the one scroll: the player asks for it (`askScroll`), and the page of the Listen's text
 * takes it once, to the block being read, or to the top at the start.
 */
export function useFollow(
  rootRef: RefObject<HTMLElement | null>,
  unit: string | null,
  chapter: string | null = null,
): void {
  const listen = useListen();
  const here = onThisPage(listen, unit, chapter);
  const on =
    here &&
    listen.follow &&
    listen.seg >= 0 &&
    followsIn(noteKey(listen.state, listen.old));
  const segs = here ? listen.segs : null;
  const seg = here ? listen.seg : -1;
  const cache = useRef<{
    segs: unknown;
    items: ReadableEl[];
    map: number[];
  } | null>(null);
  // Go to the text on this very page: the player asks, and the page takes it now.
  const [asks, setAsks] = useState(0);
  useEffect(() => {
    const onAsk = () => setAsks((n) => n + 1);
    window.addEventListener("listen:text", onAsk);
    return () => window.removeEventListener("listen:text", onAsk);
  }, []);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !unit || !here) return;
    const asked = takeScroll(unit, chapter);
    let el: HTMLElement | null = null;
    if (segs && segs.length > 0 && seg >= 0) {
      let c = cache.current;
      if (!c || c.segs !== segs) {
        const items = readablesOf(root);
        c = {
          segs,
          items,
          map: mapSegments(
            segs.map((x) => x.block),
            items,
          ),
        };
        cache.current = c;
      }
      el = c.items[c.map[seg] ?? -1]?.el ?? null;
    }
    if (asked) {
      // The reader's own scroll, not a gesture: the chrome stays as it is.
      window.dispatchEvent(new Event("reader:quiet"));
      if (el && seg > 0) el.scrollIntoView({ block: "center" });
      else window.scrollTo(0, 0);
    }
    if (!on || !el) return;
    el.setAttribute("data-follow", "true");
    return () => el?.removeAttribute("data-follow");
  }, [rootRef, unit, chapter, here, on, segs, seg, asks]);
}
