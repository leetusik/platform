import type { ReactNode } from "react";

import { READER_DOCUMENT } from "@/content/reader-document";
import { READER_FRAME } from "@/content/reader-frame";

/**
 * ReaderHead (`ReaderHead.dc.html`, frame.md F64): the head of a text. No eyebrow, no subtitle: the
 * title (`h1`), the lede, one row of facts (`Chapter 6 of 14`, `v3, published Nov 2`, **Version
 * history**, and at the end the place of Listen), then at most one notice (an older version, or an
 * older translation), then **In this chapter** when the text has two or more sections, each a button
 * that scrolls to its section.
 *
 * `listen` is the place of Listen: the existing control, mounted in its old look (operator decision 3
 * of P63-fk); the reader's sheet puts it at the end of the facts row.
 */
export interface ReaderHeadProps {
  noun: "chapter" | "document";
  title: ReactNode;
  lede?: ReactNode;
  lang: string;
  /** `Chapter 6 of 14`, or a document's own fact. */
  where: string;
  version: number;
  newest: number;
  /** The version's date, already formatted (`Nov 2`). */
  published: string;
  /** An older translation: its source's name, the version it was made from and the source's newest. */
  translation?: { source: string; from: number; newest: number } | null;
  sections: readonly { id: string; title: ReactNode; lang?: string }[];
  /**
   * A long list of sections folds (a loose document, `Document.dc.html`; F68's fold, FG8): `sections` is the
   * part on show, and the nav's last line is **Show all N sections** / **Show fewer** (`aria-expanded`, both
   * labels in one `.swap` cell so it keeps its width). None: the head renders as it always has.
   */
  fold?: { total: number; open: boolean; onToggle: () => void } | null;
  listen?: ReactNode;
  onVersions?: () => void;
  onNewest?: (n: number) => void;
  onSource?: () => void;
  onSection?: (id: string) => void;
}

export function ReaderHead({
  noun,
  title,
  lede,
  lang,
  where,
  version,
  newest,
  published,
  translation,
  sections,
  fold,
  listen,
  onVersions,
  onNewest,
  onSource,
  onSection,
}: ReaderHeadProps) {
  const h = READER_FRAME.head;
  const older = version < newest;
  const toc = h.sections(noun);
  return (
    <header className="read-head">
      <h1 className="read-title" lang={lang}>
        {title}
      </h1>
      {lede ? (
        <p className="read-lede" lang={lang}>
          {lede}
        </p>
      ) : null}
      <div className="read-facts">
        <span>{where}</span>
        <span>{h.version(version, published)}</span>
        <button type="button" className="link-row" onClick={onVersions}>
          {h.versionHistory}
        </button>
        {listen ? <div className="read-listen">{listen}</div> : null}
      </div>
      {older ? (
        <div className="notice read-notice" role="status">
          <p>
            <strong>{h.olderVersion}</strong>{" "}
            {h.olderVersionLine(version, newest, noun)}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => onNewest?.(newest)}
          >
            {h.readNewest(newest)}
          </button>
        </div>
      ) : translation ? (
        <div className="notice read-notice" role="status">
          <p>
            <strong>{h.olderTranslation}</strong>{" "}
            {h.olderTranslationLine(
              translation.source,
              translation.from,
              translation.newest,
            )}
          </p>
          <button type="button" className="btn" onClick={onSource}>
            {h.readSource(translation.source, translation.newest)}
          </button>
        </div>
      ) : null}
      {sections.length >= 2 ? (
        <nav className="read-toc" aria-label={toc}>
          <h2>{toc}</h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="toc-link"
                  lang={s.lang ?? lang}
                  onClick={() => onSection?.(s.id)}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
          {fold ? (
            <div className="cluster read-toc-more">
              <button
                type="button"
                className="link-row"
                aria-expanded={fold.open}
                data-swap={fold.open ? "true" : "false"}
                onClick={fold.onToggle}
              >
                <span className="swap">
                  <span>{READER_DOCUMENT.fold.showAll(fold.total)}</span>
                  <span>{READER_DOCUMENT.fold.showFewer}</span>
                </span>
              </button>
            </div>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
