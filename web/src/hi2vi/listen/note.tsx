import { LISTEN } from "@/content/listen";
import { Ico, Meter, Say } from "@/hi2vi/ui";
import type { NoteAction } from "@/lib/listen/view";

import { SHAPE_STATE, type HeadNote, type ListenWhat } from "./model";

/**
 * The note (F204, F206, `AudioHead.dc.html`): the state word in its shape, its sentence, the thin line with
 * its words and figure, the reference, and at most one button; and its held copy, hidden and inert, which
 * keeps the slot's height.
 */

const ACTION: Record<Exclude<NoteAction, "">, [ListenWhat, string, string]> = {
  play: ["play", LISTEN.note.play, LISTEN.note.play],
  retry: ["retry", LISTEN.note.tryAgain, LISTEN.note.tryAgain],
  again: ["startover", LISTEN.note.startOver, LISTEN.note.startOver],
  signin: ["signin", LISTEN.note.signIn, LISTEN.note.signIn],
  update: ["update", LISTEN.note.update, LISTEN.note.updating],
};

/** The held copies' button stands only where the live note would show one (F206). */
const heldActs = (n: HeadNote): boolean =>
  !!n.view.action && (n.key === "outdated" || n.key === "fail-limit");

export function Note({
  note,
  act,
  updating,
  onAct,
}: {
  note: HeadNote;
  act: boolean;
  updating: boolean;
  onAct: (what: ListenWhat) => void;
}) {
  const v = note.view;
  const a = act && v.action ? ACTION[v.action] : null;
  const busy = updating && v.action === "update";
  return (
    <div className="note" data-state={note.key}>
      <Say state={SHAPE_STATE[v.shape]} word={v.word} />
      {v.text ? <p className="note-text">{v.text}</p> : null}
      {v.line !== null ? <Meter value={v.line} label={v.lineLabel} /> : null}
      {v.ref ? <p className="note-ref">{v.ref}</p> : null}
      {a ? (
        <button
          type="button"
          className="btn"
          data-busy={updating ? "true" : "false"}
          onClick={busy ? undefined : () => onAct(a[0])}
        >
          {v.action === "play" ? <Ico name="play" /> : null}
          <span className="swap">
            <span>{a[1]}</span>
            <span>{a[2]}</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

/** A held copy: hidden, inert, its line without a progressbar and its button a stand-in of the same size. */
export function Held({ note }: { note: HeadNote }) {
  const v = note.view;
  const a = heldActs(note) && v.action ? ACTION[v.action] : null;
  return (
    <div className="note is-held" aria-hidden="true" inert>
      <Say state={SHAPE_STATE[v.shape]} word={v.word} />
      {v.text ? <p className="note-text">{v.text}</p> : null}
      {v.line !== null ? (
        <div className="meter-row">
          <span className="meta">{v.lineLabel}</span>
          <Meter value={v.line} />
          <span className="meta">{Math.round(v.line)}%</span>
        </div>
      ) : null}
      {v.ref ? <p className="note-ref">{v.ref}</p> : null}
      {a ? (
        <span className="btn" tabIndex={-1}>
          {a[1]}
        </span>
      ) : null}
    </div>
  );
}
