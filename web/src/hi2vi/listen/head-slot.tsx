"use client";

import { useEffect } from "react";

import { listenActions, useKept, useListen } from "@/lib/listen/store";
import type { ListenSeed } from "@/lib/listen/types";

import { AudioHead } from "./audio-head";
import { headOf, startingOf, textOf, type ListenWhat } from "./model";
import { getPressed, setPressed, usePressed } from "./starting";

/**
 * Listen's slot on a text page (a chapter; a document reuses it, S6): the page's seed, the docked Listen
 * (the store's, so it outlives the page) and the kept place give AudioHead its form (`./model` `headOf`).
 * The press is the page's own: the control is busy from it until the Listen answers with a state other than
 * `loading`, and the slot takes its held height at once (F206, listen C07). The book page mounts AudioHead
 * with its own `head` (S5). P64-3y.F1: the press is kept in `./starting` (the head's control and the pill set it),
 * so the dock's track holds nothing while the head reads Starting… (`startingOf`, `trackOf`).
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
  const pressed = usePressed();
  const text = textOf(seed);
  const mine = pressed === text;
  const starting = startingOf({ pressed, seed, listen });
  // The Listen answered the press: the busy form ends (a later `loading`, a Try again, is the note's Loading…).
  useEffect(() => {
    if (mine && !starting) setPressed(null);
  }, [mine, starting]);
  // The page goes: its press goes with it.
  useEffect(
    () => () => {
      if (getPressed() === text) setPressed(null);
    },
    [text],
  );
  const head = headOf({ listen, seed, kept, starting });

  const onListen = (what: ListenWhat) => {
    switch (what) {
      case "listen":
      case "startover":
        setPressed(text);
        listenActions.start(seed, 0);
        return;
      case "resume":
        setPressed(text);
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
