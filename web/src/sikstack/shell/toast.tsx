"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { createToastStore, type Toast } from "./toast-store";

/**
 * The app's toast (frame.md F4, F29): one at a time, 4 s, a new one replaces the old, in a region that
 * is always in the DOM. The Shell mounts `ToastRegion` as the last child of `main.app-main`; a page
 * publishes from a client component with `publishToast("Project changple created.")` (a node may carry
 * a `lang` span). Nothing that failed is a toast (F4).
 */
const store = createToastStore<ReactNode>();

/** Show a toast, replacing any on screen; it leaves after 4 s. */
export function publishToast(message: ReactNode): void {
  store.publish(message);
}

/** Take the toast down now. */
export function clearToast(): void {
  store.clear();
}

const noToast = (): Toast<ReactNode> | null => null;

/** The region: `role="status"`, `aria-live="polite"`, empty or holding one `p.toast`. */
export function ToastRegion() {
  const toast = useSyncExternalStore(store.subscribe, store.get, noToast);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast ? (
        <p className="toast" key={toast.id}>
          {toast.message}
        </p>
      ) : null}
    </div>
  );
}
