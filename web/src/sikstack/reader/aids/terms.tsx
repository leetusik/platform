import type { ReactNode } from "react";

import { READER_AIDS } from "@/content/reader-aids";

/**
 * A chapter's terms in the Library's reader (P63-fk.S10; job 03, Library round 02: `BlocksTerm.dc.html`,
 * `BlocksGlossary.dc.html`, `## Build` § Page: blocks). Server markup, drawn by the renderer (`render.tsx`) with
 * the chapter's own words; the term layer (`LibraryTermLayer`) only toggles it.
 *
 * - `TermWindows`: one hidden window a linked term (`div.blocks-term-box#tw-<id>[role=dialog]`, not modal, named by
 *   its term), all in one holder at the text's end, which the layer places under the term (`.blocks-term-float`)
 *   or turns into the sheet under 40em of the reader (`.blocks-term-sheet`). Head: the term and **Close**; `Also
 *   called …`; the short definition, the longer one hidden under a hairline behind **Read more** / **Show less**;
 *   **In the glossary**, a link to the entry, at the foot's end.
 * - `GlossaryList`: the entries A to Z (`li.blocks-gl-entry#gl-<id>`): the term, `Also called …`, the short and the
 *   longer definition, and, for a linked term, its hidden **Back to the text** (`.back`), which the layer shows on
 *   the entry a window led to.
 */

const W = READER_AIDS.term;

export interface TermEntryView {
  id: string;
  term: ReactNode;
  /** The aliases, comma-joined, in the chapter's language; null when it has none. */
  aka: ReactNode | null;
  short: ReactNode;
  long: ReactNode | null;
}

/** `Also called` and the aliases: the label English in every chapter, the aliases the chapter's (`aka`'s own `lang`). */
function Aka({ aka, className }: { aka: ReactNode; className: string }) {
  return (
    <p className={className} lang="en">
      {W.alsoCalled} {aka}
    </p>
  );
}

export function TermWindows({
  entries,
  chrome,
}: {
  entries: TermEntryView[];
  /** `en` when the chapter is not English: the chrome's words carry it. */
  chrome?: string;
}) {
  if (!entries.length) return null;
  return (
    <div className="blocks-term-float" data-term-holder="" data-placed="0">
      {entries.map((t) => {
        const w = `tw-${t.id}`;
        return (
          <div
            key={t.id}
            className="blocks-term-box"
            id={w}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${w}-t`}
            tabIndex={-1}
            data-term-window={t.id}
            hidden
          >
            <div className="blocks-term-head">
              <p className="blocks-term-name" id={`${w}-t`}>
                {t.term}
              </p>
              <button
                type="button"
                className="btn"
                lang={chrome}
                data-term-close=""
              >
                {W.close}
              </button>
            </div>
            <div className="blocks-term-body">
              {t.aka ? <Aka aka={t.aka} className="blocks-term-aka" /> : null}
              <p className="blocks-term-def">{t.short}</p>
              {t.long ? (
                <p
                  className="blocks-term-def blocks-term-long"
                  id={`${w}-l`}
                  hidden
                >
                  {t.long}
                </p>
              ) : null}
            </div>
            <div className="blocks-term-foot" lang={chrome}>
              {t.long ? (
                <button
                  type="button"
                  className="link-row"
                  aria-expanded="false"
                  aria-controls={`${w}-l`}
                  data-swap="false"
                  data-term-more=""
                >
                  <span className="swap">
                    <span>{W.more}</span>
                    <span>{W.less}</span>
                  </span>
                </button>
              ) : null}
              <a className="link-row" href={`#gl-${t.id}`} data-term-go="">
                {W.toGlossary}
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GlossaryList({
  entries,
  linked,
  chrome,
}: {
  entries: TermEntryView[];
  /** The ids of the terms the text links: their entries carry the way back. */
  linked: ReadonlySet<string>;
  chrome?: string;
}) {
  return (
    <ul className="blocks-gl-list">
      {entries.map((t) => (
        <li
          key={t.id}
          className="blocks-gl-entry"
          id={`gl-${t.id}`}
          tabIndex={-1}
        >
          <p className="blocks-gl-term">{t.term}</p>
          {t.aka ? <Aka aka={t.aka} className="blocks-gl-aka" /> : null}
          <p>{t.short}</p>
          {t.long ? <p>{t.long}</p> : null}
          {linked.has(t.id) ? (
            <button
              type="button"
              className="back"
              lang={chrome}
              data-term-back=""
              hidden
            >
              {READER_AIDS.glossary.back}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
