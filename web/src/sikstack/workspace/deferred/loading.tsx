"use client";

import { useParams, useSearchParams } from "next/navigation";

import { DEFERRED_JOB, DEFERRED_LIST } from "@/content/workspace/deferred";
import { WS_GLOSSARY, WS_PLACES } from "@/content/workspace/frame";
import { BackRow, WsNav, type WsSyncLine } from "@/sikstack/workspace/frame";
import {
  agendaHref,
  backlogHref,
  decodeWorkspaceFrom,
  deferredHref,
  docsHref,
  FROM_PARAM,
  wayBack,
} from "@/lib/workspace/address";

import { DeferredFilter } from "./filter";
import { readDeferredPlace } from "./list-model";

/** While the page loads the sync line is a bar: the line itself is not read yet. */
const WAIT_LINE: WsSyncLine = {
  state: "fresh",
  text: "",
  cls: "",
  version: "",
};

/** A skeleton row's name and second line (`DeferredList.dc.html`'s `waits`). */
const WAITS: [string, string][] = [
  ["58%", "34%"],
  ["44%", "40%"],
  ["66%", "28%"],
  ["38%", "36%"],
  ["52%", "30%"],
  ["61%", "42%"],
  ["47%", "26%"],
  ["55%", "38%"],
];

function useProject(): string {
  const params = useParams<{ projectId: string }>();
  return params?.projectId ?? "";
}

/**
 * The list while it loads (`DeferredList.dc.html`, Loading): the Shell and `WsNav` stand (the sync line a bar);
 * the head holds a skeleton count; the toolbar stands with the field and the four choices off, a bar in each
 * count's room, so nothing moves when the counts arrive; eight skeleton rows of a real row's two lines.
 */
export function DeferredListLoading() {
  const project = useProject();
  const place = readDeferredPlace(useSearchParams() ?? new URLSearchParams());
  const w = DEFERRED_LIST;
  return (
    <div className="column">
      <WsNav
        current="deferred"
        line={WAIT_LINE}
        loading
        hrefs={{
          agenda: agendaHref(project),
          backlog: backlogHref(project),
          deferred: deferredHref(project),
          docs: docsHref(project),
        }}
      />
      <section className="panel" aria-label={w.title} aria-busy="true">
        <div className="panel-head">
          <h2>{w.title}</h2>
          <p className="meta">
            <span className="skel" style={{ width: "4em" }} />
            <span className="sr-only">{w.loading}</span>
          </p>
        </div>
        <div className="panel-body has-rule dj-tools">
          <div className="dj-find">
            <input
              className="input"
              type="search"
              autoComplete="off"
              aria-label={w.search.label}
              placeholder={w.search.placeholder}
              defaultValue={place.q}
              disabled
            />
          </div>
          <DeferredFilter
            value={place.status}
            counts={null}
            totals={null}
            disabled
          />
        </div>
        <ul className="ws-list">
          {WAITS.map(([name, sub], i) => (
            <li key={i} className="row ws-row">
              <span className="ws-id">
                <span className="skel" style={{ width: "4em" }} />
              </span>
              <span className="ws-open ws-name dj-wait">
                <span className="row-stack">
                  <span>
                    <span className="skel" style={{ width: name }} />
                  </span>
                  <span className="meta">
                    <span className="skel" style={{ width: sub }} />
                  </span>
                </span>
              </span>
              <span className="ws-state">
                <span className="skel" style={{ width: "5em" }} />
              </span>
              <span className="ws-end dj-end">
                <span>
                  <span className="skel" style={{ width: "5em" }} />
                </span>
                <span>
                  <span className="skel" style={{ width: "3em" }} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The way back from a job, from its address's `from` (the list's page, search and status). */
export function useJobBack(): { href: string; label: string } {
  const project = useProject();
  const search = useSearchParams();
  const back = wayBack(
    project,
    { kind: "job" },
    decodeWorkspaceFrom(search?.get(FROM_PARAM), project),
  );
  return { href: back.href, label: WS_PLACES.deferred };
}

const BRIEF_BARS = ["6em", "34em", "28em", "6em", "20em"];

/**
 * One job while it loads (`DeferredJob.dc.html`, Loading): the way back stands, the sync line is a bar, the title
 * is a skeleton, the three facts and **Deferred because** keep their labels over bars, the **Brief** panel keeps
 * its head over five bars.
 */
export function DeferredJobLoading() {
  const back = useJobBack();
  const labels = WS_GLOSSARY.labels.job;
  return (
    <div className="column">
      <div className="stack gap-5" aria-busy="true">
        <header className="page-top">
          <BackRow {...back} line={WAIT_LINE} loading />
          <div className="page-head ws-head">
            <div className="page-title">
              <h1>
                <span className="skel" style={{ width: "14em" }} />
                <span className="sr-only">{DEFERRED_JOB.loading}</span>
              </h1>
            </div>
          </div>
        </header>
        <dl className="facts">
          <div className="fact">
            <dt>{labels.source}</dt>
            <dd>
              <span className="skel" style={{ width: "5em" }} />
            </dd>
          </div>
          <div className="fact">
            <dt>{labels.trigger}</dt>
            <dd>
              <span className="skel" style={{ width: "14em" }} />
            </dd>
          </div>
          <div className="fact">
            <dt>{labels.created}</dt>
            <dd>
              <span className="skel" style={{ width: "3em" }} />
            </dd>
          </div>
          <div className="fact ws-fact-long">
            <dt>{labels.deferredBecause}</dt>
            <dd>
              <span className="skel" style={{ width: "22em" }} />
            </dd>
          </div>
        </dl>
        <section className="panel" aria-label={WS_GLOSSARY.heads.brief}>
          <div className="panel-head">
            <h2>{WS_GLOSSARY.heads.brief}</h2>
          </div>
          <div className="panel-body has-rule stack gap-3">
            {BRIEF_BARS.map((width, i) => (
              <span key={i} className="dj-line">
                <span className="skel" style={{ width }} />
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
