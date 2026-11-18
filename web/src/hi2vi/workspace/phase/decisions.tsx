"use client";

import { useState } from "react";

import { WS_GLOSSARY } from "@/content/workspace/frame";
import { PHASE_PAGE } from "@/content/workspace/phase";
import { WsText } from "@/hi2vi/workspace/frame";
import { Swap } from "@/hi2vi/ui";
import type { NotebookDecision } from "@/lib/workspace/types";

import { NOTEBOOK_DECISIONS_SHOWN } from "./model";

/** The list's id, named by the button's `aria-controls`. */
export const DECISIONS_ID = "phase-decisions";

/**
 * The notebook's Decisions (`PhaseNotebook.dc.html`): the key, the text, the slice that made it (read out as
 * `Decided in S1`). More than five: the first five, then **Show all 20 decisions** at the list's right end,
 * which becomes **Show the first 5**: one button, `aria-expanded`, both labels in one width (`.swap`). A page
 * arrives with the list closed.
 */
export function NotebookDecisions({
  decisions,
}: {
  decisions: readonly NotebookDecision[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <DecisionList
      decisions={decisions}
      expanded={expanded}
      onToggle={() => setExpanded((x) => !x)}
    />
  );
}

/** The list and its button at one state: the first five, or all of them (`expanded`). */
export function DecisionList({
  decisions,
  expanded,
  onToggle,
}: {
  decisions: readonly NotebookDecision[];
  expanded: boolean;
  onToggle?: () => void;
}) {
  const canExpand = decisions.length > NOTEBOOK_DECISIONS_SHOWN;
  const shown =
    expanded || !canExpand
      ? decisions
      : decisions.slice(0, NOTEBOOK_DECISIONS_SHOWN);
  return (
    <>
      <ul className="phase-notes" id={DECISIONS_ID}>
        {shown.map((d, i) => (
          <li key={`${d.id}-${i}`} className="phase-note">
            <span className="ws-id">{d.id}</span>
            <span className="phase-note-text">
              <WsText text={d.text} />
            </span>
            {d.slice ? (
              <span className="dim phase-note-end">
                <span className="sr-only">{PHASE_PAGE.decidedIn}</span>
                {d.slice}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {canExpand ? (
        <div className="cluster to-end phase-more">
          <button
            type="button"
            className="btn"
            aria-expanded={expanded}
            aria-controls={DECISIONS_ID}
            data-swap={expanded ? "true" : undefined}
            onClick={onToggle}
          >
            <Swap
              labels={[
                WS_GLOSSARY.buttons.showAllDecisions(decisions.length),
                WS_GLOSSARY.buttons.showFirst,
              ]}
            />
          </button>
        </div>
      ) : null}
    </>
  );
}
