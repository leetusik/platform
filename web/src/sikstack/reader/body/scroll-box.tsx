"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { READER_BLOCKS } from "@/content/reader-blocks";
import { scrollState } from "@/lib/native/look";

/**
 * A box that scrolls sideways (frame.md F60; `Read.dc.html`'s `fit` recipe): the code, a table, a figure's image, a
 * drawing, a formula. While its content is wider than it, the box carries `data-scrolls="true"` and is a Tab stop
 * (`tabIndex` 0), and the sentence under it (`.scroll-hint`, the next sibling) shows; otherwise `data-scrolls`
 * is `false` and `tabIndex` -1. The state is measured, never guessed, and follows from the widths of now only
 * (`scrollState`, D154-by): a `ResizeObserver` on the box and on its content, a loaded image inside it and the
 * fonts arriving re-measure it. Server render and first client render agree (no state yet); the measure runs in an
 * effect.
 */
export function ScrollBox({
  as = "div",
  className,
  label,
  children,
}: {
  as?: "div" | "pre";
  /** The box's classes: `scroll-box` and the block's own (`read-code`, `table-scroll`, `blocks-box` …). */
  className: string;
  /** The region's name (`Code`, `Table`, `Image`, `Drawing`, `Formula`). */
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<ReturnType<typeof scrollState> | null>(
    null,
  );
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = scrollState(el);
    setState((prev) =>
      prev && prev.scrolls === next.scrolls && prev.tabIndex === next.tabIndex
        ? prev
        : next,
    );
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    el.addEventListener("load", measure, true);
    let alive = true;
    document.fonts?.ready.then(() => alive && measure()).catch(() => {});
    return () => {
      alive = false;
      ro?.disconnect();
      el.removeEventListener("load", measure, true);
    };
  }, [measure]);
  const Tag = as;
  return (
    <>
      <Tag
        ref={(el: HTMLElement | null) => {
          ref.current = el;
        }}
        className={className}
        role="region"
        aria-label={label}
        data-scrolls={state ? String(state.scrolls) : undefined}
        tabIndex={state?.tabIndex}
      >
        {children}
      </Tag>
      <p className="scroll-hint">{READER_BLOCKS.scrollHint}</p>
    </>
  );
}
