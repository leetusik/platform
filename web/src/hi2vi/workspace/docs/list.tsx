import type { ReactNode } from "react";
import Link from "next/link";

import { WS_DOCS } from "@/content/workspace/docs";
import { WS_GLOSSARY, WS_STATES } from "@/content/workspace/frame";
import { WsText } from "@/hi2vi/workspace/frame/text";
import { cx } from "@/lib/cx";

import type { DocsRowView } from "./model";

/** The five skeleton rows' bar lengths, as the board draws them (Doc, Status, Version, Versioned, From). */
const SKELETON: readonly (readonly string[])[] = [
  ["5em", "5em", "2em", "3em", "9em"],
  ["7em", "5em", "2em", "3em", "9em"],
  ["6em", "5em", "2em", "3em", "5em"],
  ["2em", "5em", "2em", "3em", "5em"],
  ["6em", "5em", "2em", "3em", "9em"],
];

function Head() {
  return (
    <thead role="rowgroup">
      <tr role="row">
        {WS_DOCS.columns.map((c) => (
          <th key={c} scope="col" role="columnheader">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * One doc's row (`DocsList.dc.html`, F79): the title as the row's link, the status with what a stale doc waits
 * for under it, then Version, Versioned and From. The words `, versioned ` and `, from ` are in the cells and show
 * only when the row stacks (under 48em of the list's width); a doc from no phase reads `—` and its stacked line
 * ends at the date.
 */
function Row({ row }: { row: DocsRowView }) {
  return (
    <tr role="row">
      <td role="cell" className="has-control">
        <Link className="link-strong" href={row.href}>
          {row.lang === "ko" ? <span lang="ko">{row.title}</span> : row.title}
        </Link>
      </td>
      <td role="cell">
        {row.status ? (
          <span className={row.status.cls}>{row.status.word}</span>
        ) : null}
        {row.notes ? (
          <span className="meta docs-wait">
            <WsText text={row.notes} />
          </span>
        ) : null}
      </td>
      <td role="cell" className="nowrap docs-fact">
        {row.version}
      </td>
      <td role="cell" className="nowrap docs-fact">
        <span className="docs-join">{WS_DOCS.join.versioned}</span>
        {row.versioned}
      </td>
      <td role="cell" className={cx("docs-fact", !row.from && "is-none")}>
        <span className="docs-join">{WS_DOCS.join.from}</span>
        {row.from ? <WsText text={row.from} /> : WS_GLOSSARY.none}
      </td>
    </tr>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll">
      <table className="docs-table table" role="table">
        <Head />
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  );
}

export type DocsListState =
  | {
      kind: "ok";
      rows: DocsRowView[];
      count: string;
      retired: DocsRowView[];
      retiredCount: string;
    }
  | { kind: "loading" }
  | { kind: "failed"; retry: ReactNode };

/**
 * The docs list (`DocsList.dc.html`; F79, F82), its own size container (`.docs-list`): panel **Docs** with its
 * count and the fixed-layout table, then panel **Retired** on the same columns when the workspace has retired docs.
 * Loading keeps the head (no count) and the column heads over five skeleton rows; failed keeps the head and says
 * `Docs did not load.` with **Try again** (`retry`, the page's own control).
 */
export function DocsList({ state }: { state: DocsListState }) {
  return (
    <div className="stack docs-list gap-5">
      <section
        className="panel"
        aria-labelledby="docs-list-head"
        aria-busy={state.kind === "loading" ? true : undefined}
      >
        <div className="panel-head">
          <h2 id="docs-list-head">{WS_DOCS.head}</h2>
          {state.kind === "ok" ? <p className="meta">{state.count}</p> : null}
        </div>
        {state.kind === "ok" ? (
          <Table>
            {state.rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </Table>
        ) : null}
        {state.kind === "loading" ? (
          <>
            <Table>
              {SKELETON.map((bars, i) => (
                <tr role="row" key={i}>
                  <td role="cell">
                    <span className="skel" style={{ width: bars[0] }} />
                  </td>
                  <td role="cell">
                    <span className="skel" style={{ width: bars[1] }} />
                  </td>
                  <td role="cell" className="docs-fact">
                    <span className="skel" style={{ width: bars[2] }} />{" "}
                  </td>
                  <td role="cell" className="docs-fact">
                    <span className="skel" style={{ width: bars[3] }} />{" "}
                  </td>
                  <td role="cell" className="docs-fact">
                    <span className="skel" style={{ width: bars[4] }} />
                  </td>
                </tr>
              ))}
            </Table>
            <span className="sr-only">{WS_DOCS.loading}</span>
          </>
        ) : null}
        {state.kind === "failed" ? (
          <div className="panel-body has-rule block">
            <p className="block-text">{WS_STATES.partFailed.docs}</p>
            {state.retry}
          </div>
        ) : null}
      </section>
      {state.kind === "ok" && state.retired.length > 0 ? (
        <section className="panel" aria-labelledby="docs-retired-head">
          <div className="panel-head">
            <h2 id="docs-retired-head">{WS_GLOSSARY.heads.retired}</h2>
            <p className="meta">{state.retiredCount}</p>
          </div>
          <Table>
            {state.retired.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}
