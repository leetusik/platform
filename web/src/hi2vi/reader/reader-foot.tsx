import { READER_FRAME } from "@/content/reader-frame";
import { cx } from "@/lib/cx";

/**
 * ReaderFoot (`ReaderFoot.dc.html`, frame.md F64, F94): the foot of the reader. The pill that says
 * reading was picked up (**From the top**), and a chapter's bar: **Previous**, **Contents** with the
 * place (`Chapter 6 of 14, 42%`; `6 of 14` under 36em), **Next**, or on the last chapter **The book**.
 * The first chapter has no Previous and Contents keeps its place. The percentage sits in a slot three
 * figures wide (figure spaces, tabular figures), so Contents keeps one width from 0% to 100% (FG12).
 * `bar` false (a loose document) leaves the pill alone. `hidden` hides the bar with the top bar.
 */
export interface ReaderFootProps {
  bar?: boolean;
  n?: number;
  total?: number;
  pct?: number;
  /** The neighbours' titles; none at the book's first and last chapter. */
  prev?: string | null;
  next?: string | null;
  hidden?: boolean;
  pill?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onContents?: () => void;
  onBook?: () => void;
  onTop?: () => void;
}

export function ReaderFoot({
  bar = true,
  n = 0,
  total = 0,
  pct = 0,
  prev,
  next,
  hidden = false,
  pill = false,
  onPrev,
  onNext,
  onContents,
  onBook,
  onTop,
}: ReaderFootProps) {
  const f = READER_FRAME.foot;
  return (
    <div className={cx("reader-foot", hidden && "is-hidden")}>
      {pill ? (
        <div className="pill" role="status">
          <span>{f.pill}</span>
          <button type="button" className="link-row" onClick={onTop}>
            {f.fromTop}
          </button>
        </div>
      ) : null}
      {bar ? (
        <nav className="foot-bar" aria-label={f.label}>
          <div className="foot-row">
            <button
              type="button"
              className="btn foot-prev"
              style={{ visibility: prev ? "visible" : "hidden" }}
              aria-label={f.previousAria(prev ?? "")}
              onClick={onPrev}
            >
              <span className="foot-label">{f.previous}</span>
            </button>
            <button
              type="button"
              className="btn foot-mid"
              aria-label={f.contentsAria(n, total, pct)}
              onClick={onContents}
            >
              <span>{f.contents}</span>
              <span className="foot-where">{f.where(n, total, pct)}</span>
              <span className="foot-count">{f.count(n, total)}</span>
            </button>
            {next ? (
              <button
                type="button"
                className="btn foot-next"
                aria-label={f.nextAria(next)}
                onClick={onNext}
              >
                <span className="foot-label">{f.next}</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn foot-next"
                aria-label={f.bookAria}
                onClick={onBook}
              >
                <span className="foot-label">{f.book}</span>
              </button>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
