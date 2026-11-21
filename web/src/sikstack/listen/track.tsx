"use client";

import { listenActions, useKept, useListen } from "@/lib/listen/store";
import type { ListenSeed } from "@/lib/listen/types";
import type { DockLead } from "@/lib/listen/view";

import { Dock } from "./dock";
import {
  controlOf,
  textOf,
  trackOf,
  trackStartingOf,
  type HeadControl,
} from "./model";
import { ListenPill } from "./pill";
import { setPressed, usePressed } from "./starting";

/**
 * The dock's track on a reading page (F208, listen:FG1; `Listen.dc.html`'s `.dock-track`): in the flow at the
 * page's foot, before `ReaderFoot`, sticky to the window's foot, so it floats over the text while reading and
 * stands under the last line at the page's end. It holds the dock while a Listen is under way (the store's, so
 * it stays between reading pages), else Listen's pill (`pill`: the page's measure of the head's control under
 * the top bar), else nothing and no track. On a chapter it stands one foot bar up while the bars show. P64-3y.F1:
 * while the text's head reads Starting… it holds nothing (`trackOf`'s `starting`).
 */
export function ListenTrack({
  seed,
  shown,
  pill,
  chapter,
  hidden,
  signInHref,
  held = false,
  pillOf = null,
  starting = false,
}: {
  seed: ListenSeed | null;
  /** The page's text has Listen (F206: a member, the newest version, a seed). */
  shown: boolean;
  pill: boolean;
  chapter: boolean;
  hidden: boolean;
  signInHref: string;
  /**
   * The book page (listen:FG2, C01): the track is held, drawn empty at rest, so `.listen-book`'s grid keeps its side
   * column whether or not a Listen is under way.
   */
  held?: boolean;
  /** The book page's pill: the book's control and its start (the chapter's own is `seed`'s, `controlOf`). */
  pillOf?: { control: HeadControl; go: () => void } | null;
  /**
   * P64-3y.F1 — the page's head reads Starting… (the book page's own press, which has no text seed): the track holds
   * nothing until its Listen answers. A text page's press is read from `./starting` instead.
   */
  starting?: boolean;
}) {
  const listen = useListen();
  const kept = useKept();
  const pressed = usePressed();
  const t = trackOf({
    listen,
    shown: shown && (!!seed || !!pillOf),
    pill,
    chapter,
    hidden,
    // P64-3y.F1: nothing while this text's head reads Starting… (`Listen.dc.html`'s "Starting…").
    starting: trackStartingOf({ starting, pressed, seed, listen }),
  });
  const className = t.overFoot ? "dock-track over-foot" : "dock-track";
  if (!t.show) return held ? <div className={className} /> : null;

  if (t.show === "dock" && listen) {
    const onLead = (lead: DockLead) => {
      switch (lead) {
        case "pause":
          listenActions.pause();
          return;
        case "play":
          listenActions.play();
          return;
        case "startover":
          listenActions.startOver();
          return;
        case "retry":
          listenActions.retry();
          return;
        case "signin":
          window.location.assign(signInHref);
          return;
        case "play-off":
          return;
      }
    };
    return (
      <div className={className}>
        <Dock
          listen={listen}
          onLead={onLead}
          onOpen={listenActions.openPlayer}
        />
      </div>
    );
  }
  if (pillOf) {
    return (
      <div className={className}>
        <ListenPill control={pillOf.control} onGo={pillOf.go} />
      </div>
    );
  }
  if (!seed) return held ? <div className={className} /> : null;
  const control = controlOf(seed, kept);
  return (
    <div className={className}>
      <ListenPill
        control={control}
        onGo={() => {
          // The pill is the head's control (F207): its press is the head's, Starting… until the Listen answers.
          setPressed(textOf(seed));
          listenActions.start(seed, control.from);
        }}
      />
    </div>
  );
}
