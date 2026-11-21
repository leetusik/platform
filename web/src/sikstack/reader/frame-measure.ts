"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { layerHolderOf, readerTopH, slotLift, type LayerHolder } from "./slot";

/**
 * P64-3y.F4 — what the reading pages' frames measure for `./slot`'s rules: the marks layer's part in the frame's
 * slot, the reader's top bar's real height, and how far the slot's holder stands on the dock. Each is written in
 * one place (the frame's root, `.app.reader`) and only when it changes, so a page at rest writes nothing.
 */

/** The reader's top bar's real height (`./slot` `readerTopH`), on `.app.reader`; the sheets default it to `--top-h`. */
export const READER_TOP_H = "--reader-top-h";
/** How far the slot's holder rises to stand on the dock (`./slot` `slotLift`), on `.app.reader`; none by default. */
export const SLOT_LIFT = "--reader-slot-lift";

/** The bar of a reading page (`@/sikstack/library` `Bar`). */
const BAR = ":scope > .bar-wrap > .bar";
/** The dock in its track (`@/sikstack/listen` `ListenTrack`). */
const DOCK = ":scope > .dock-track > .dock";
/** What can hold the slot under the dock: the layer's part in `.marks-slot`, and `ReaderFoot`'s resume pill. */
const SLOT = ":scope > .marks-slot > *, :scope > .reader-foot > .pill";

/**
 * The marks layer's part in the frame's slot host (`./slot` `layerHolderOf`): the frame owns the host, the layer
 * portals its undo line, Sign in to save or place bar into it; read again whenever the layer changes what it holds.
 */
export function useLayerHolder(host: HTMLElement | null): LayerHolder | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!host || typeof MutationObserver === "undefined") return () => {};
      const watch = new MutationObserver(notify);
      watch.observe(host, { childList: true });
      return () => watch.disconnect();
    },
    [host],
  );
  return useSyncExternalStore(
    subscribe,
    () => layerHolderOf(host?.firstElementChild ?? null),
    () => null,
  );
}

/**
 * The reader's top bar's real height, measured from the bar and written once per change to `--reader-top-h` on the
 * frame's root (before the page's landings run: a layout effect). Returned too, for the old root's islands, whose
 * own sheet cannot read the frame's properties across the old-page boundary.
 */
export function useReaderTopBar(
  rootRef: RefObject<HTMLElement | null>,
): number | null {
  const [topH, setTopH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = root?.querySelector<HTMLElement>(BAR);
    if (!root || !bar) return;
    let last: number | null | undefined;
    const write = () => {
      const h = readerTopH(bar.clientHeight);
      if (h === last) return;
      last = h;
      if (h === null) root.style.removeProperty(READER_TOP_H);
      else root.style.setProperty(READER_TOP_H, `${h}px`);
      setTopH(h);
    };
    write();
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(write);
    resize?.observe(bar);
    return () => {
      resize?.disconnect();
      root.style.removeProperty(READER_TOP_H);
    };
  }, [rootRef]);
  return topH;
}

/**
 * The slot's holder stands on the dock (`./slot` `slotLift`), measured after every render of the frame (a holder or
 * the dock coming or going, the bars hiding) and on a scroll or a resize (the dock standing under the page's last
 * line); written to `--reader-slot-lift` on the frame's root only when it changes.
 */
export function useSlotLift(rootRef: RefObject<HTMLElement | null>): void {
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const now = parseFloat(root.style.getPropertyValue(SLOT_LIFT)) || 0;
    const dock = root.querySelector<HTMLElement>(DOCK);
    let holderBottom: number | null = null;
    if (dock) {
      root.querySelectorAll<HTMLElement>(SLOT).forEach((el) => {
        const bottom = el.getBoundingClientRect().bottom + now;
        holderBottom =
          holderBottom === null ? bottom : Math.max(holderBottom, bottom);
      });
    }
    const gap =
      parseFloat(getComputedStyle(root).getPropertyValue("--space-2")) || 8;
    const lift = slotLift({
      dockTop: dock ? dock.getBoundingClientRect().top : null,
      holderBottom,
      gap,
    });
    if (lift === now) return;
    if (lift) root.style.setProperty(SLOT_LIFT, `${lift}px`);
    else root.style.removeProperty(SLOT_LIFT);
  }, [rootRef]);

  useLayoutEffect(measure);

  useEffect(() => {
    let frame = 0;
    const later = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
    };
  }, [measure]);
}
