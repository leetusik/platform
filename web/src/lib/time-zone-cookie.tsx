"use client";

import { useEffect } from "react";

import { timeZoneCookieString, zoneToWrite } from "./time-zone";

/**
 * The one time zone's setter (decision 5; `time-zone.ts`): after the first paint it writes the
 * browser's zone into the cookie the server formats dates in, once, and never again while the
 * cookie already holds that zone. It renders nothing, runs no inline script (so no CSP nonce is
 * needed) and reads no request data, so the root layout that mounts it stays static.
 *
 * It does not refresh the route after the first write: the page already on screen keeps its UTC
 * dates, and the next server render (a navigation or a reload) uses the viewer's zone.
 */
export function TimeZoneCookie() {
  useEffect(() => {
    let browserZone: string | undefined;
    try {
      browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    const zone = zoneToWrite(document.cookie, browserZone);
    if (zone === null) return;
    document.cookie = timeZoneCookieString(
      zone,
      window.location.protocol === "https:",
    );
  }, []);
  return null;
}
