"use client";

import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";

import { SHEET } from "@/content/library-frame";

import { outsideBox, sheetClass, type SheetSide } from "./sheet-model";

/**
 * Sheet (`Sheet.dc.html`, frame.md F61): a native `<dialog class="sheet">` opened with `showModal()`, so
 * it sits in the top layer over a `::backdrop` (the scrim) and the page behind is inert. **One at a
 * time**: the page holds which sheet is open (`nextSheet`) and passes `open` to each. Contents and Notes
 * come from the start side, Version history, Display and (under 64em) Ask from the end; under 40em of
 * the app every sheet comes from the bottom, as wide as the window (frame.css). `.sheet-head` (the `h2`
 * and **Close**, its one button) stays while `.sheet-body` scrolls. Close, Escape and a click on the scrim
 * close it (`onClose`); the focus then returns to the control that opened it, or to `returnFocus()`.
 */
export interface SheetProps {
  open: boolean;
  /** The sheet's title, its `h2` and its name. */
  title: string;
  side?: SheetSide;
  onClose: () => void;
  /** Where focus goes on close when the opener may be gone. */
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}

export function Sheet({
  open,
  title,
  side = "start",
  onClose,
  returnFocus,
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const latest = useRef({ onClose, returnFocus });
  useEffect(() => {
    latest.current = { onClose, returnFocus };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const opener =
      document.activeElement instanceof HTMLElement &&
      !el.contains(document.activeElement)
        ? document.activeElement
        : null;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
      const back = latest.current.returnFocus?.() ?? opener;
      // An opener inside another sheet that has since closed has nowhere to take the focus.
      if (back && back.isConnected && !back.closest("dialog:not([open])"))
        back.focus();
    };
  }, [open]);

  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const el = ref.current;
    if (!el || event.target !== el) return;
    if (outsideBox(event.clientX, event.clientY, el.getBoundingClientRect()))
      latest.current.onClose();
  };

  return (
    <dialog
      ref={ref}
      className={sheetClass(side)}
      aria-labelledby={titleId}
      onClick={onBackdrop}
      onClose={() => {
        // The effect's own close (the page closed it, or opened another) is not the reader's.
        if (open && !ref.current?.open) latest.current.onClose();
      }}
    >
      <div className="sheet-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="btn" onClick={onClose}>
          {SHEET.close}
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
