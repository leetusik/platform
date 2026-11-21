import Link from "next/link";

import { WS_GLOSSARY } from "@/content/workspace/frame";
import { PHASE_PAGE } from "@/content/workspace/phase";
import { WsSync, type WsBack } from "@/sikstack/workspace/frame";

const G = WS_GLOSSARY;
const L = G.labels.phase;

const skel = (width: string) => <span className="skel" style={{ width }} />;

/** A part's head over three skeleton rows of a row's height (`PhaseSlices.dc.html`, Loading). */
export function PhaseSlicesLoading() {
  const row = (id: string, name: string, state: string, end: string) => (
    <li className="row ws-row">
      <span className="ws-id">{skel(id)}</span>
      <span className="link-strong ws-open ws-name">{skel(name)}</span>
      <span className="ws-state">{skel(state)}</span>
      <span className="ws-end">{skel(end)}</span>
    </li>
  );
  return (
    <section
      className="panel"
      aria-labelledby="phase-slices-head"
      aria-busy="true"
    >
      <div className="panel-head">
        <h2 id="phase-slices-head">{G.heads.slices}</h2>
      </div>
      <ol className="ws-list">
        {row("3em", "12em", "5em", "6em")}
        {row("1.5em", "9em", "6em", "5em")}
        {row("1.5em", "14em", "4em", "6em")}
      </ol>
      <span className="sr-only">{PHASE_PAGE.loading}</span>
    </section>
  );
}

/** The notebook's head, Now and Decisions over skeleton lines (`PhaseNotebook.dc.html`, Loading). */
export function PhaseNotebookLoading() {
  const note = (width: string) => (
    <li className="phase-note">
      <span className="ws-id">{skel("1.5em")}</span>
      <span className="phase-note-text">{skel(width)}</span>
    </li>
  );
  return (
    <section
      className="panel"
      aria-labelledby="phase-notebook-head"
      aria-busy="true"
    >
      <div className="panel-head">
        <h2 id="phase-notebook-head">{G.heads.notebook}</h2>
      </div>
      <div className="phase-group">
        <h3>{G.groups.notebook[0]}</h3>
        <p>{skel("24em")}</p>
      </div>
      <div className="phase-group">
        <h3>{G.groups.notebook[2]}</h3>
        <ul className="phase-notes">
          {note("22em")}
          {note("16em")}
          {note("19em")}
        </ul>
      </div>
      <span className="sr-only">{PHASE_PAGE.loading}</span>
    </section>
  );
}

/**
 * A phase while it loads (`Phase.dc.html`, Loading): the back row with the sync line as a bar; the id (when the
 * address names one) with bars for the name and the status; the objective and the three dates as bars; then
 * every part's head over skeleton lines. It reads nothing.
 */
export function PhaseLoading({
  back,
  id,
}: {
  back: WsBack;
  id: string | null;
}) {
  return (
    <div className="column">
      <header className="page-top" aria-busy="true">
        <div className="ws-top">
          <Link className="back" href={back.href}>
            {back.label}
          </Link>
          <WsSync
            line={{ state: "never", text: "", cls: "", version: "" }}
            loading
          />
        </div>
        <div className="page-head ws-head">
          <div className="page-title">
            <h1>
              {id ? (
                <>
                  <span className="ws-id">{id}</span>{" "}
                </>
              ) : null}
              {skel("8em")}
            </h1>
            <span>{skel("6em")}</span>
          </div>
        </div>
        <div className="stack gap-4">
          <p className="phase-text">{skel("32em")}</p>
          <dl className="facts">
            <div className="fact">
              <dt>{L.created}</dt>
              <dd>{skel("3em")}</dd>
            </div>
            <div className="fact">
              <dt>{L.started}</dt>
              <dd>{skel("3em")}</dd>
            </div>
            <div className="fact">
              <dt>{L.completed}</dt>
              <dd>{skel("3em")}</dd>
            </div>
          </dl>
        </div>
        <span className="sr-only">{PHASE_PAGE.loading}</span>
      </header>
      <div className="sidebar">
        <div className="main stack gap-5">
          <PhaseSlicesLoading />
          <PhaseNotebookLoading />
          <section
            className="panel"
            aria-labelledby="phase-intent-head"
            aria-busy="true"
          >
            <div className="panel-head">
              <h2 id="phase-intent-head">{G.heads.intent}</h2>
            </div>
            <div className="panel-body has-rule stack gap-2">
              <h3>{G.groups.intent.original}</h3>
              <p>{skel("28em")}</p>
            </div>
            <div className="panel-body has-rule stack gap-2">
              <h3>{G.groups.intent.confirmed}</h3>
              <p>{skel("20em")}</p>
              <p>{skel("24em")}</p>
            </div>
            <span className="sr-only">{PHASE_PAGE.loading}</span>
          </section>
        </div>
        <div className="side stack gap-5">
          <section
            className="panel"
            aria-labelledby="phase-review-head"
            aria-busy="true"
          >
            <div className="panel-head">
              <h2 id="phase-review-head">{G.heads.review}</h2>
              <span>
                {skel("6em")}
                <span className="sr-only">{PHASE_PAGE.loading}</span>
              </span>
            </div>
          </section>
          <section
            className="panel"
            aria-labelledby="phase-gate-head"
            aria-busy="true"
          >
            <div className="panel-head">
              <h2 id="phase-gate-head">{G.heads.gate}</h2>
              <span>
                {skel("6em")}
                <span className="sr-only">{PHASE_PAGE.loading}</span>
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
