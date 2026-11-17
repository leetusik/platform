// Project home's three parts (`ProjectHomeWorkspace`, `ProjectHomeLibrary`, `ProjectHomeFeedback`):
// server-safe markup, so `page.tsx` and `loading.tsx` both render them. Each panel's Try again is its
// client island (`library-retry.tsx`, `feedback-retry.tsx`).

import Link from "next/link";
import type { ReactNode } from "react";

import { PROJECT_HOME } from "@/content/project";
import {
  Badge,
  Block,
  BlockText,
  Panel,
  PanelHead,
  Skeleton,
} from "@/hi2vi/ui";
import { Rating } from "@/hi2vi/feedback";
import { date, type FormatOptions } from "@/lib/format";

import type { FeedbackRow, LibraryRow } from "./model";
import { workspaceWords } from "./model";

/** Three skeleton rows of a row's height (F24), the second bar `tail` wide. */
export function WaitRows({ tail }: { tail: string }) {
  return (
    <>
      <ul>
        {["16em", "12em", "14em"].map((w) => (
          <li key={w} className="row ph-wait">
            <Skeleton width={w} />
            <Skeleton width={tail} />
          </li>
        ))}
      </ul>
      <span className="sr-only">{PROJECT_HOME.loading}</span>
    </>
  );
}

/**
 * Workspace, as operator D1 has it until the sync phase: the panel's head with the `Coming` badge (the
 * landing's composition: `cluster baseline gap-3` around the `h2` and the badge) and the signed empty
 * state. The board drops an empty part's count and foot, so "See all in Workspace" is not drawn.
 */
export function WorkspacePanel() {
  const w = workspaceWords();
  return (
    <Panel className="ph-part" aria-label={w.heading}>
      <PanelHead>
        <div className="cluster baseline gap-3">
          <h2>{w.heading}</h2>
          <Badge>{w.badge}</Badge>
        </div>
      </PanelHead>
      <Block className="panel-body has-rule">
        {/*
          HELD BACK (operator D1, 2026-11-16; D244-h0): the signed sentence continues
          `Run [LINK COMMAND] in the project’s repo.` The sync phase restores it here, with the real
          command, in `PROJECT_HOME.workspace.empty`; the phase rows, the `N deferred` count, the
          "See all in Workspace" foot and the loading rows (`ProjectHomeWorkspace.dc.html`) go in
          this panel once there is workspace data.
        */}
        <BlockText>{w.empty}</BlockText>
      </Block>
    </Panel>
  );
}

const L = PROJECT_HOME.library;

/** The Library panel's head: `Library` and, once known and above 0, the active total. */
function LibraryHead({ count }: { count: string | null }) {
  return (
    <PanelHead>
      <h2>{L.heading}</h2>
      {count !== null ? <p className="meta">{count}</p> : null}
    </PanelHead>
  );
}

/** The Library panel's states (`ProjectHomeLibraryStates.dc.html`). */
export type LibraryState =
  /** `all`: the foot's address, the project's own library (`projectLibraryHref`). */
  | { kind: "rows"; rows: readonly LibraryRow[]; all: string }
  | { kind: "failed"; retry: ReactNode }
  /** Fetched again after Try again: the count stays, three skeleton rows. */
  | { kind: "loading" }
  /** Nothing known yet: no count, three skeleton rows. */
  | { kind: "first-load" };

/**
 * Library (`ProjectHomeLibrary.dc.html`): the active total in the head, the five newest documents
 * (the title as a link with `lang` set, a book with its `Book` badge and second title, the length and
 * the date), the foot to the Library; its empty, failed, loading-again and first-load forms.
 */
export function LibraryPanel({
  count,
  state,
  format,
}: {
  count: string | null;
  state: LibraryState;
  format?: FormatOptions;
}) {
  const waiting = state.kind === "loading" || state.kind === "first-load";
  const rows = state.kind === "rows" ? state.rows : null;
  const all = state.kind === "rows" ? state.all : null;
  return (
    <Panel
      className="ph-part"
      aria-label={L.heading}
      aria-busy={waiting ? "true" : undefined}
    >
      <LibraryHead count={state.kind === "first-load" ? null : count} />
      {rows !== null && rows.length > 0 ? (
        <>
          <ul className="ph-list">
            {rows.map((row) => (
              <li key={row.key} className="row ph-doc">
                <Link href={row.href} className="link-strong ph-open">
                  <span className="row-stack">
                    <span className="cluster baseline">
                      <span className="ph-name-text" lang={row.lang}>
                        {row.title}
                      </span>
                      {row.book ? <Badge>{L.book}</Badge> : null}
                    </span>
                    {row.sub !== null ? (
                      <span className="meta ph-sub" lang={row.subLang}>
                        {row.sub}
                      </span>
                    ) : null}
                  </span>
                </Link>
                <span className="dim ph-len">{row.length ?? ""}</span>
                <span className="dim ph-date">
                  {row.date !== null ? date(row.date, format) : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="panel-foot">
            <Link href={all ?? "/library"} className="link link-row">
              {L.all}
            </Link>
          </div>
        </>
      ) : null}
      {rows !== null && rows.length === 0 ? (
        <Block className="panel-body has-rule">
          <BlockText>{L.empty}</BlockText>
        </Block>
      ) : null}
      {state.kind === "failed" ? (
        <Block className="panel-body has-rule">
          <BlockText>{L.failed}</BlockText>
          {state.retry}
        </Block>
      ) : null}
      {waiting ? <WaitRows tail="3em" /> : null}
    </Panel>
  );
}

const F = PROJECT_HOME.feedback;

/** The Feedback panel's states: the board's, and the Library's failed form (D247-4x). */
export type FeedbackState =
  /** `all`: the foot's address, the project's own Feedback list (`feedbackHref(projectId)`). */
  | { kind: "rows"; rows: readonly FeedbackRow[]; all: string }
  | { kind: "failed"; retry: ReactNode }
  /** Fetched again after Try again: the count stays, three skeleton rows. */
  | { kind: "loading" }
  /** Nothing known yet: no count, three skeleton rows. */
  | { kind: "first-load" };

/**
 * Feedback (`ProjectHomeFeedback.dc.html`): `N this month` in the head; the five newest messages, each
 * its Rating (the Feedback job's Liked, Disliked, Unrated: operator D3) in the rating column at the
 * panel's weight, the text as a link to the message in the project's Shell (`lang` set) and the time;
 * the foot to the project's Feedback list. Empty drops the count and the foot; the failed form is the
 * Library's (`Feedback did not load.` and Try again, the head kept).
 *
 * A long message is cut at the Feedback list's two lines by the list's own `.clamp-2`, put on the text
 * span rather than through `ClampLink`, which would drop `.ph-open`'s text-only underline, the text's
 * weight 400 and the span's `lang`. The link keeps one 12 px over and under: `.ph-open` and the list's
 * `.link-strong:has(> .clamp-2)` set the same `padding-block` to the same step, never adding up.
 */
export function FeedbackPanel({
  count,
  state,
}: {
  /** `23 this month`, or `null` when not known. */
  count: string | null;
  state: FeedbackState;
}) {
  const waiting = state.kind === "loading" || state.kind === "first-load";
  const rows = state.kind === "rows" ? state.rows : null;
  const shown =
    state.kind === "first-load" || (rows !== null && rows.length === 0)
      ? null
      : count;
  return (
    <Panel
      className="ph-part"
      aria-label={F.heading}
      aria-busy={waiting ? "true" : undefined}
    >
      <PanelHead>
        <h2>{F.heading}</h2>
        {shown !== null ? <p className="meta">{shown}</p> : null}
      </PanelHead>
      {rows !== null && rows.length > 0 ? (
        <>
          <ul className="ph-list">
            {rows.map((m) => (
              <li key={m.id} className="row ph-msg">
                <Rating value={m.rating} className="ph-rating" />
                <Link href={m.href} className="link-strong ph-open ph-said">
                  <span className="ph-name-text clamp-2" lang={m.lang}>
                    {m.text}
                  </span>
                </Link>
                <span className="dim ph-when">{m.when}</span>
              </li>
            ))}
          </ul>
          <div className="panel-foot">
            <Link
              href={state.kind === "rows" ? state.all : "/feedback"}
              className="link link-row"
            >
              {F.all}
            </Link>
          </div>
        </>
      ) : null}
      {rows !== null && rows.length === 0 ? (
        <Block className="panel-body has-rule">
          <BlockText>{F.empty}</BlockText>
        </Block>
      ) : null}
      {state.kind === "failed" ? (
        <Block className="panel-body has-rule">
          <BlockText>{F.failed}</BlockText>
          {state.retry}
        </Block>
      ) : null}
      {waiting ? <WaitRows tail="3em" /> : null}
    </Panel>
  );
}
