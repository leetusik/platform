import type { CSSProperties, KeyboardEvent } from "react";

import { LISTEN } from "@/content/listen";
import { Ico, Meter, Say, Status, type IcoName } from "@/hi2vi/ui";
import { clockPos } from "@/lib/listen/format";
import type { PlayerLead, PlayerView } from "@/lib/listen/view";

import { SHAPE_STATE } from "./model";
import type { PlayerEvent } from "./press";

/**
 * The opened player's body (`ListenPlayer.dc.html`, frame.md F211, F234 FG8), top to bottom: the meta line and
 * the title; the zone (the state word, the note's sentence, line and reference, and a button only for Update
 * audio, holding `Updating…` in its width, and Sign in); the position, the one bold move (`0:00` alone while
 * nothing is made); the seek bar; the transport (−15, the sheet's one primary, +15; then Previous and Next at
 * the two ends, a book only); Speed, Follow along and a book's Chapters; Stop listening. Hook-free: the sheet
 * (`./player`) passes the view and answers the events.
 */

const P = LISTEN.player;

const PLAY: Record<PlayerLead, [string, IcoName]> = {
  pause: [P.pause, "pause"],
  play: [P.play, "play"],
  "play-off": [P.play, "play"],
  startover: [P.startOver, "again"],
  retry: [P.tryAgain, "again"],
};

export function PlayerBody({
  view: v,
  uid,
  onEvent,
  onSeekInput,
  onSeekCommit,
}: {
  view: PlayerView;
  /** A page-unique prefix for the rows' label ids. */
  uid: string;
  onEvent: (e: PlayerEvent) => void;
  /** The seek bar while it moves (the sheet shows the place; the audio moves on commit). */
  onSeekInput?: (at: number) => void;
  onSeekCommit?: () => void;
}) {
  const len = v.len;
  const pos = Math.max(0, Math.min(len, v.pos));
  const of = P.of(clockPos(len), v.soFar);
  const play = PLAY[v.lead];
  const speedId = `${uid}-speed`;
  const followId = `${uid}-follow`;
  const onSeekKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Page Up and Down move 15 s (F226); the arrows are the range's own 5 s steps.
    if (!v.seekable) return;
    const d = e.key === "PageUp" ? 15 : e.key === "PageDown" ? -15 : 0;
    if (!d) return;
    e.preventDefault();
    onEvent({ t: "seek", at: Math.max(0, Math.min(len, pos + d)) });
  };
  return (
    <div className="player" data-state={v.key}>
      <div className="stack gap-1">
        <p className="meta">{v.meta}</p>
        <h2 lang={v.titleLang}>{v.title}</h2>
      </div>
      <div className="note" role="status">
        <Say state={SHAPE_STATE[v.shape]} word={v.word} />
        {v.text ? <p className="note-text">{v.text}</p> : null}
        {v.line !== null ? <Meter value={v.line} label={v.lineLabel} /> : null}
        {v.ref ? <p className="note-ref">{v.ref}</p> : null}
        {v.action ? (
          <button
            type="button"
            className="btn"
            data-busy={v.updating ? "true" : "false"}
            onClick={
              v.updating && v.action === "update"
                ? undefined
                : () => onEvent({ t: "action", what: v.action as "update" })
            }
          >
            <span className="swap">
              <span>
                {v.action === "update"
                  ? LISTEN.note.update
                  : LISTEN.note.signIn}
              </span>
              <span>
                {v.action === "update"
                  ? LISTEN.note.updating
                  : LISTEN.note.signIn}
              </span>
            </span>
          </button>
        ) : null}
      </div>
      <div className="stack gap-1">
        <p className="position">
          <span className="position-at">{clockPos(pos)}</span>
          {len > 0 ? <span className="position-of">{of}</span> : null}
        </p>
        <input
          className="seek"
          type="range"
          min={0}
          max={len || 1}
          step={5}
          value={pos}
          aria-label={P.position}
          aria-valuetext={
            len > 0
              ? P.posText(clockPos(pos), clockPos(len), v.soFar)
              : clockPos(pos)
          }
          disabled={!v.seekable}
          style={
            {
              "--at": `${(len ? (100 * pos) / len : 0).toFixed(1)}%`,
            } as CSSProperties
          }
          onChange={(e) => {
            const at = Number(e.currentTarget.value);
            if (onSeekInput) onSeekInput(at);
            else onEvent({ t: "seek", at });
          }}
          onPointerUp={onSeekCommit}
          onKeyUp={onSeekCommit}
          onBlur={onSeekCommit}
          onKeyDown={onSeekKey}
        />
      </div>
      <div className="transport" role="group" aria-label={P.transport}>
        <div className="transport-main">
          <button
            type="button"
            className="btn transport-skip"
            aria-label={P.back}
            disabled={!v.seekable}
            onClick={() => onEvent({ t: "skip", by: -15 })}
          >
            {P.backFace}
          </button>
          <button
            type="button"
            className={
              v.lead === "play-off"
                ? "btn transport-play"
                : "btn transport-play btn-primary"
            }
            disabled={v.lead === "play-off"}
            onClick={() => onEvent({ t: "play", lead: v.lead })}
          >
            <Ico name={play[1]} />
            {play[0]}
          </button>
          <button
            type="button"
            className="btn transport-skip"
            aria-label={P.fwd}
            disabled={!v.seekable}
            onClick={() => onEvent({ t: "skip", by: 15 })}
          >
            {P.fwdFace}
          </button>
        </div>
        {v.isBook ? (
          <div className="transport-ch">
            {v.hasPrev ? (
              <button
                type="button"
                className="btn"
                aria-label={P.previous}
                onClick={() => onEvent({ t: "step", dir: -1 })}
              >
                <Ico name="prev" />
                {P.previousShort}
              </button>
            ) : null}
            {v.hasNext ? (
              <button
                type="button"
                className="btn is-next"
                aria-label={P.next}
                onClick={() => onEvent({ t: "step", dir: 1 })}
              >
                {P.nextShort}
                <Ico name="next" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="player-row">
        <span className="label" id={speedId}>
          {P.speed}
        </span>
        <div className="choice speed" role="group" aria-labelledby={speedId}>
          {P.speeds.map((s) => (
            <button
              key={s}
              type="button"
              className="btn"
              aria-pressed={v.speed === s}
              onClick={() => onEvent({ t: "speed", v: s })}
            >
              {P.speedValue(s)}
            </button>
          ))}
        </div>
      </div>
      <div className="player-row">
        <span className="label" id={followId}>
          {P.follow}
        </span>
        <button
          type="button"
          className="btn"
          role="switch"
          aria-checked={v.follow}
          aria-labelledby={followId}
          data-swap={v.follow ? "false" : "true"}
          onClick={() => onEvent({ t: "follow", on: !v.follow })}
        >
          <span className="swap">
            <span>{P.on}</span>
            <span>{P.off}</span>
          </span>
        </button>
      </div>
      {v.isBook ? (
        <div className="stack gap-2">
          <div className="player-row">
            <span className="label">{P.chapters}</span>
            <span className="dim">{v.where}</span>
          </div>
          <ol className="chapters" aria-label={P.chapterList}>
            {v.rows.map((c) => (
              <li
                key={c.id}
                className="chapter-row"
                aria-current={c.current ? "true" : "false"}
              >
                <span className="chapter-n">{c.n}</span>
                <span className="chapter-name">
                  {c.playable && !c.current ? (
                    <button
                      type="button"
                      className="link-strong chapter-open"
                      lang={c.titleLang}
                      onClick={() => onEvent({ t: "pick", id: c.id })}
                    >
                      {c.title}
                    </button>
                  ) : (
                    <span className="chapter-open" lang={c.titleLang}>
                      {c.title}
                    </span>
                  )}
                </span>
                {c.current && c.word ? (
                  <Status
                    state={c.word === P.playing ? "live" : "active"}
                    className="chapter-state"
                  >
                    {c.word}
                  </Status>
                ) : (
                  <span className="dim chapter-state">{c.line}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="player-row">
        <button
          type="button"
          className="btn"
          onClick={() => onEvent({ t: "stop" })}
        >
          {P.stop}
        </button>
      </div>
    </div>
  );
}
