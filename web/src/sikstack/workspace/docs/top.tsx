"use client";

import { useEffect } from "react";

/**
 * Lands a doc's new view at the page's top. Opening an earlier version (or going back to the latest) changes only
 * the address's search, which the router scrolls to the column's top, under the app's bar; the loading form the
 * page draws while it reads the version mounts this, so the view starts at the page's own top. Its effect runs
 * after the router's own scroll. A view read from the router's cache draws no loading form, so a back or forward
 * step keeps the browser's restored place.
 */
export function DocTop() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return null;
}
