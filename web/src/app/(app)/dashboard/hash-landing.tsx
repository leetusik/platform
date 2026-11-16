"use client";

import { useEffect } from "react";

/**
 * Lands an address's `#<id>` on that element once the page's data is in. A client navigation to
 * `/dashboard#org-keys-head` (the landing's "Mint an org key") scrolls while `loading.tsx` shows, whose
 * Projects skeleton has three rows; the loaded table can be ten and a half, which pushes the keys head
 * below the window. Mounting with the loaded page, this scrolls to the target again. Renders nothing.
 */
export function HashLanding({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    document.getElementById(id)?.scrollIntoView();
  }, [id]);
  return null;
}
