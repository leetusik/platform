"use client";

import { useState } from "react";

import { unitOfKey } from "@/lib/listen/book";
import { listenActions, useKept, useListen } from "@/lib/listen/store";
import type { ListenSeed } from "@/lib/listen/types";

import { AudioHead } from "./audio-head";
import { headOf, type ListenWhat } from "./model";

/**
 * Listen's slot on a text page (a chapter; a document reuses it, S6): the page's seed, the docked Listen
 * (the store's, so it outlives the page) and the kept place give AudioHead its form (`./model` `headOf`).
 * The press is the page's own: the control is busy from it until the Listen answers with a state other than
 * `loading`, and the slot takes its held height at once (F206, listen C07). The book page mounts AudioHead
 * with its own `head` (S5).
 */
export function ListenHeadSlot({
  seed,
  signInHref,
  onHead,
}: {
  seed: ListenSeed;
  signInHref: string;
  /** The slot's element, for the frame that measures it (the pill shows once it is under the top bar). */
  onHead?: (el: HTMLDivElement | null) => void;
}) {
  const listen = useListen();
  const kept = useKept();
  const [starting, setStarting] = useState(false);
  const unit = unitOfKey(seed.key);
  // The Listen answered the press: the busy form ends (a later `loading`, a Try again, is the note's Loading…).
  const answered =
    starting && !!listen && listen.unit === unit && listen.state !== "loading";
  if (answered) setStarting(false);
  const head = headOf({ listen, seed, kept, starting: starting && !answered });

  const onListen = (what: ListenWhat) => {
    switch (what) {
      case "listen":
      case "startover":
        setStarting(true);
        listenActions.start(seed, 0);
        return;
      case "resume":
        setStarting(true);
        listenActions.start(seed, head.control.from);
        return;
      case "play":
        listenActions.play();
        return;
      case "retry":
        listenActions.retry();
        return;
      case "update":
        listenActions.update();
        return;
      case "signin":
        window.location.assign(signInHref);
        return;
    }
  };

  return <AudioHead head={head} onListen={onListen} slotRef={onHead} />;
}
