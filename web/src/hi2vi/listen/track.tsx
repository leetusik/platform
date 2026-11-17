"use client";

import { listenActions, useKept, useListen } from "@/lib/listen/store";
import type { ListenSeed } from "@/lib/listen/types";
import type { DockLead } from "@/lib/listen/view";

import { Dock } from "./dock";
import { controlOf, trackOf } from "./model";
import { ListenPill } from "./pill";

/**
 * The dock's track on a reading page (F208, listen:FG1; `Listen.dc.html`'s `.dock-track`): in the flow at the
 * page's foot, before `ReaderFoot`, sticky to the window's foot, so it floats over the text while reading and
 * stands under the last line at the page's end. It holds the dock while a Listen is under way (the store's, so
 * it stays between reading pages), else Listen's pill (`pill`: the page's measure of the head's control under
 * the top bar), else nothing and no track. On a chapter it stands one foot bar up while the bars show.
 */
export function ListenTrack({
  seed,
  shown,
  pill,
  chapter,
  hidden,
  signInHref,
}: {
  seed: ListenSeed | null;
  /** The page's text has Listen (F206: a member, the newest version, a seed). */
  shown: boolean;
  pill: boolean;
  chapter: boolean;
  hidden: boolean;
  signInHref: string;
}) {
  const listen = useListen();
  const kept = useKept();
  const t = trackOf({ listen, shown: shown && !!seed, pill, chapter, hidden });
  if (!t.show) return null;
  const className = t.overFoot ? "dock-track over-foot" : "dock-track";

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
  if (!seed) return null;
  const control = controlOf(seed, kept);
  return (
    <div className={className}>
      <ListenPill
        control={control}
        onGo={() => listenActions.start(seed, control.from)}
      />
    </div>
  );
}
