"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { LISTEN } from "@/content/listen";
import { outsideBox, sheetClass } from "@/sikstack/library/sheet-model";
import { setOpenPlayer, useListen } from "@/lib/listen/store";
import { playerView } from "@/lib/listen/view";

import { PlayerBody } from "./player-body";
import { goToText, pressPlayer, type PlayerEvent } from "./press";
import { focusAfterPress } from "./press-focus";

/**
 * The opened player (frame.md F211, F234 FG8; `Listen.dc.html`'s player sheet): the reader's sheet from the end
 * side, `dialog.sheet.at-end` named `Listen` with no visible title, its head **Go to the text** and **Close**
 * (they wrap). The Library's sheet mechanics (`@/sikstack/library/sheet-model`): `showModal()`, so the page
 * behind is inert and the scrim is the `::backdrop`; focus opens on Close; Escape, Close and the scrim close
 * it and the focus returns to the dock. Stop listening ends the Listen and closes it, the focus going to the
 * head's control. The dock's open area opens it (`listenActions.openPlayer`). A press whose control leaves the
 * sheet (a chapter row that becomes the current one, Previous or Next at an end) moves the focus to a stable
 * control in the sheet (`focusAfterPress`), never to the page.
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
  /** The last press in the body, until its control is seen to stay or to leave (the move may land renders later). */
  const pressed = useRef<PlayerEvent | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();

  useEffect(() => setOpenPlayer(() => setOpen(true)), []);

  const shown = open && !!listen;
  useEffect(() => {
    const el = ref.current;
    if (!el || !shown) return;
    after.current = "dock";
    pressed.current = null;
    if (!el.open) el.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (el.open) el.close();
      focusAfter(after.current);
    };
  }, [shown]);

  // After every render of the open sheet: when the last press's control is no longer drawn (or is disabled) and the
  // focus fell out of the sheet with it, the rule's stable control takes it. A focus the reader moved elsewhere
  // in the sheet meanwhile stays where it is; a control still drawn keeps its press pending (a chapter move lands
  // once the audio reaches it, renders later).
  useLayoutEffect(() => {
    const e = pressed.current;
    const el = ref.current;
    // Closing (Escape, Close, the scrim, Stop listening) is the sheet's own: its focus goes to the dock or the head.
    if (!e || !el || !el.open || !shown || !listen) return;
    const to = focusAfterPress(e, playerView(listen, { docWhere }));
    if (to === null) return;
    pressed.current = null;
    const at = document.activeElement;
    const held =
      !!at &&
      at !== document.body &&
      at !== el &&
      el.contains(at) &&
      !at.matches(":disabled");
    if (held) return;
    const target =
      to === "play"
        ? el.querySelector<HTMLElement>(".transport-play:not(:disabled)")
        : null;
    (target ?? closeRef.current)?.focus({ preventScroll: true });
  });

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
    pressed.current = e;
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
