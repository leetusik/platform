"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { leavesListen } from "@/lib/listen/leave";
import { isListenPath } from "@/lib/listen/paths";
import { listenActions } from "@/lib/listen/store";

/**
 * P41-sr.W1 — Listen's mount in the root layout (the one layout the document, chapter and
 * book routes share; it also wraps the app, auth and marketing).
 *
 *  - It reads only the pathname on the client, so the layout stays as static as it was:
 *    no headers, no cookies, no nonce, and every prerendered page stays prerendered.
 *  - Off a reader or book path it renders nothing and loads nothing beyond this module and
 *    the Listen store (a few small pure modules, no media).
 *  - On one, it loads the host (`ListenHost`: the `<audio>` and the engine) as a client
 *    chunk through Next's own loader, never server-rendered. Under the reader routes'
 *    nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`) that chunk is trusted the
 *    way every Next chunk is: Next's nonced bootstrap inserts it (`'strict-dynamic'`), and
 *    hls.js, when the element has no native HLS, is a further chunk of the same kind.
 *
 * P64-3y.F1 — leaving the Listen pages ends the Listen (job 07 frame.md F231, `@/lib/listen/leave`): on a move of
 * the address (a link, Back, Forward) from a Listen page to any other, a Listen with a place ends as Stop
 * listening does (its place kept: Continue listening on the way back), any other ends keeping nothing. It runs in
 * the commit that removes the host, before the host's own cleanup, so the engine still carries it out. A full
 * page load is the browser's (the `pagehide` beacon, the place read at load).
 */
const ListenHost = dynamic(() => import("./listen-host"), { ssr: false });

export function ListenRoot() {
  const pathname = usePathname();
  const was = useRef(pathname);
  useLayoutEffect(() => {
    if (leavesListen(was.current, pathname)) listenActions.leave();
    was.current = pathname;
  }, [pathname]);
  return isListenPath(pathname) ? <ListenHost /> : null;
}
