"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

import { LISTEN } from "@/content/listen";
import { outsideBox, sheetClass } from "@/hi2vi/library/sheet-model";
import { setOpenPlayer, useListen } from "@/lib/listen/store";
import { playerView } from "@/lib/listen/view";

import { PlayerBody } from "./player-body";
import { goToText, pressPlayer, type PlayerEvent } from "./press";

/**
 * The opened player (frame.md F211, F234 FG8; `Listen.dc.html`'s player sheet): the reader's sheet from the end
 * side, `dialog.sheet.at-end` named `Listen` with no visible title, its head **Go to the text** and **Close**
 * (they wrap). The Library's sheet mechanics (`@/hi2vi/library/sheet-model`): `showModal()`, so the page
 * behind is inert and the scrim is the `::backdrop`; focus opens on Close; Escape, Close and the scrim close
 * it and the focus returns to the dock. Stop listening ends the Listen and closes it, the focus going to the
 * head's control. The dock's open area opens it (`listenActions.openPlayer`).
 */

type After = "dock" | "head" | "none";

/** Where the focus goes once the sheet has closed (the dock; after Stop listening, the head's control). */
function focusAfter(after: After): void {
  if (after === "none") return;
  window.setTimeout(() => {
    const el =
      (after === "head"
        ? document.querySelector<HTMLElement>(".listen-slot .listen-ctl button")
        : null) ??
      document.querySelector<HTMLElement>(".dock-open") ??
      document.querySelector<HTMLElement>(".listen-slot button") ??
      document.getElementById("main-content");
    if (!el) return;
    if (el.id === "main-content" && !el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus({ preventScroll: true });
  }, 0);
}

export function ListenPlayerSheet({
  signInHref,
  docWhere,
}: {
  signInHref: string;
  /** A document's meta line, the head's (`Document in <project>`). */
  docWhere?: string;
}) {
  const listen = useListen();
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const after = useRef<After>("dock");
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();

  useEffect(() => setOpenPlayer(() => setOpen(true)), []);

  const shown = open && !!listen;
  useEffect(() => {
    const el = ref.current;
    if (!el || !shown) return;
    after.current = "dock";
    if (!el.open) el.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (el.open) el.close();
      focusAfter(after.current);
    };
  }, [shown]);

  // The Listen ended under the sheet (Stop listening, or elsewhere): the sheet goes with it, and the next
  // Listen does not open it again.
  if (open && !listen) setOpen(false);
  if (!listen) return null;

  const close = (to: After) => {
    after.current = to;
    setDrag(null);
    setOpen(false);
  };
  const onEvent = (e: PlayerEvent) => {
    if (e.t === "stop") after.current = "head";
    pressPlayer(listen, e, () => window.location.assign(signInHref));
    if (e.t === "stop") close("head");
  };
  const commit = () => {
    if (drag === null) return;
    pressPlayer(listen, { t: "seek", at: drag }, () => {});
    setDrag(null);
  };
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const el = ref.current;
    if (!el || event.target !== el) return;
    if (outsideBox(event.clientX, event.clientY, el.getBoundingClientRect()))
      close("dock");
  };
  const view = playerView(listen, { docWhere });
  const shownView = drag === null ? view : { ...view, pos: drag };

  return (
    <dialog
      ref={ref}
      className={sheetClass("end")}
      aria-label={LISTEN.player.title}
      onClick={onBackdrop}
      onClose={() => {
        // Escape (the dialog's own close); the effect's own close is not the reader's.
        if (open) close("dock");
      }}
    >
      <div className="sheet-head listen-sheet-head">
        <button
          type="button"
          className="btn"
          onClick={() => {
            after.current = "dock";
            goToText(listen, pathname, {
              push: (href) => {
                after.current = "none";
                router.push(href);
              },
              here: () => window.dispatchEvent(new Event("listen:text")),
            });
            close(after.current);
          }}
        >
          {LISTEN.player.goToText}
        </button>
        <button
          ref={closeRef}
          type="button"
          className="btn"
          onClick={() => close("dock")}
        >
          {LISTEN.player.close}
        </button>
      </div>
      <div className="sheet-body">
        {shown ? (
          <PlayerBody
            view={shownView}
            uid={uid}
            onEvent={onEvent}
            onSeekInput={setDrag}
            onSeekCommit={commit}
          />
        ) : null}
      </div>
    </dialog>
  );
}
