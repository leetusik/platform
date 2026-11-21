"use client";

import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import { cx } from "@/lib/cx";

/**
 * Dialog (`Dialog.dc.html`, frame.md F3 and F10): a native `<dialog class="dlg">` around one
 * `.dlg-body`, opened with `showModal()` as it mounts, so the page behind is inert and focus is held
 * inside. Render it only while it is open; `onClose` hears a native close (Escape) and the parent
 * then drops it; the dialog's own buttons call the parent's handlers directly. No light dismiss: a click on
 * the backdrop does nothing (a modal's default, `closedby` unset). `locked` (a send in flight) makes
 * Escape do nothing. Focus goes first to `initialFocus` (else the browser's first focusable element)
 * and, on close, back to `returnFocus()` or else to the element that had it when the dialog opened.
 */
export interface DialogProps {
  /** The accessible name: the dialog's title. */
  label: string;
  onClose: () => void;
  /** The element focused first: Cancel on a confirm, Copy on the shown-once key. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Where focus goes on close, when the opener may be gone (a revoked row's button). */
  returnFocus?: () => HTMLElement | null;
  locked?: boolean;
  children: ReactNode;
}

export function Dialog({
  label,
  onClose,
  initialFocus,
  returnFocus,
  locked = false,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useRef({ returnFocus });
  useEffect(() => {
    latest.current = { returnFocus };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!el.open) el.showModal();
    initialFocus?.current?.focus();
    return () => {
      if (el.open) el.close();
      const back = latest.current.returnFocus?.() ?? opener;
      if (back && back.isConnected) back.focus();
    };
  }, [initialFocus]);

  return (
    <dialog
      ref={ref}
      className="dlg"
      aria-label={label}
      onCancel={(event) => {
        if (locked) event.preventDefault();
      }}
      onClose={() => {
        // A close the effect's cleanup made (a remount) finds the dialog open again: ignore it.
        if (ref.current?.open) return;
        onClose();
      }}
    >
      <div className="dlg-body">{children}</div>
    </dialog>
  );
}

/** The dialog's actions, at its end, Cancel first and the main action last. */
export function DialogActions({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("dlg-actions", className)} />;
}
