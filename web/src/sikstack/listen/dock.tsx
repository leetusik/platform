import { LISTEN } from "@/content/listen";
import { Ico, Meter, Say, type IcoName } from "@/sikstack/ui";
import type { Listen } from "@/lib/listen/types";
import { dockView, type DockLead } from "@/lib/listen/view";

import { SHAPE_STATE } from "./model";

/**
 * The dock (`ListenDock.dc.html`, frame.md F208, F232, F234): one floating capsule. The lead (Pause, Play, a
 * disabled Play, Start over as marks; Try again and Sign in in words) holds one width in every state, the
 * widest lead word's, its mark or word centred in it (C03), so the title and the state line never move. The
 * rest of the capsule is one button that opens the player: the title on one line, the state word and its rest
 * under it (the middle dot is the rest's `::before`, clipped when the rest wraps: C04), the up mark. Then the
 * line of where the audio is, always drawn, and a polite live region that says the state and the chapter.
 * Hook-free: the page's track (`./track`) passes the Listen and answers the events.
 */

const MARK: Partial<Record<DockLead, [IcoName, string, boolean]>> = {
  pause: ["pause", LISTEN.dock.pause, true],
  play: ["play", LISTEN.dock.play, true],
  "play-off": ["play", LISTEN.dock.play, false],
  startover: ["again", LISTEN.dock.startOver, false],
};

const WORDS: Partial<Record<DockLead, string>> = {
  retry: LISTEN.dock.tryAgain,
  signin: LISTEN.dock.signIn,
};

/** The lead's held width: the widest lead words, hidden, in the lead's one cell (C03). */
function Sizes() {
  return (
    <>
      <span className="lead-size" aria-hidden="true">
        {LISTEN.dock.tryAgain}
      </span>
      <span className="lead-size" aria-hidden="true">
        {LISTEN.dock.signIn}
      </span>
    </>
  );
}

export function Dock({
  listen,
  onLead,
  onOpen,
}: {
  listen: Listen;
  onLead?: (lead: DockLead) => void;
  onOpen?: () => void;
}) {
  const v = dockView(listen);
  const mark = MARK[v.act];
  const lead = () => {
    if (v.act !== "play-off") onLead?.(v.act);
  };
  return (
    <section
      className="dock"
      aria-label={LISTEN.dock.region}
      data-state={listen.state}
    >
      {mark ? (
        <button
          type="button"
          className={mark[2] ? "btn dock-lead btn-primary" : "btn dock-lead"}
          aria-label={mark[1]}
          disabled={v.act === "play-off"}
          onClick={lead}
        >
          <span className="lead-hold">
            <Sizes />
            <Ico name={mark[0]} />
          </span>
        </button>
      ) : (
        <button type="button" className="btn dock-lead" onClick={lead}>
          <span className="lead-hold">
            <Sizes />
            <span>{WORDS[v.act]}</span>
          </span>
        </button>
      )}
      <button
        type="button"
        className="dock-open"
        aria-label={LISTEN.dock.open}
        aria-haspopup="dialog"
        onClick={() => onOpen?.()}
      >
        <span className="dock-text">
          <span className="dock-title" lang={listen.titleLang ?? "en"}>
            {listen.title}
          </span>
          <Say
            as="span"
            state={SHAPE_STATE[v.shape]}
            word={v.word}
            rest={v.rest || undefined}
          />
        </span>
        <Ico name="up" />
      </button>
      <Meter value={v.pct} />
      <p className="sr-only" role="status" aria-live="polite">
        {v.say}
      </p>
    </section>
  );
}
