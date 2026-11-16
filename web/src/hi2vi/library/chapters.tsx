import { CHAPTERS } from "@/content/library-frame";
import { cx } from "@/lib/cx";
import type { StatusState } from "@/hi2vi/ui";

/**
 * ReaderChapters and its row (`ReaderChapters.dc.html`, frame.md F54, F63): a book's chapters as rows,
 * the body of the Contents sheet and the list under a finished chapter's end. `ol.chapters >
 * li.chapter-row`: the number, the title (`onOpen(id)`), **Updated** where it applies, the state (F54).
 * The chapter being read is bold and says **Reading now**, its sections under it (`onSection(id)`), the
 * one on screen marked. A visitor's rows carry no state. The book's own contents copies the row.
 */
export interface ChapterRowItem {
  id: string;
  n: number;
  title: string;
  updated?: boolean;
  /** The reading state's word and shape (`Finished` done, `Started, 42%` active, `Not started` idle); none for a visitor. */
  state?: { word: string; status: StatusState } | null;
}

export interface ChapterSection {
  id: string;
  title: string;
}

export interface ChapterRowProps {
  row: ChapterRowItem;
  current?: boolean;
  /** The current chapter's sections; shown when there are two or more. */
  sections?: readonly ChapterSection[];
  section?: string;
  onOpen?: (id: string) => void;
  onSection?: (id: string) => void;
}

const statusClass = (status: StatusState) =>
  cx("status", status !== "active" && `status-${status}`);

export function ChapterRow({
  row,
  current = false,
  sections = [],
  section,
  onOpen,
  onSection,
}: ChapterRowProps) {
  const state = current
    ? { word: CHAPTERS.readingNow, status: "live" as const }
    : (row.state ?? null);
  return (
    <li className="chapter-row" aria-current={current ? "true" : undefined}>
      <span className="chapter-n">{row.n}</span>
      <span className="chapter-name">
        <button
          type="button"
          className="link-strong chapter-open"
          onClick={() => onOpen?.(row.id)}
        >
          {row.title}
        </button>
        {row.updated && <span className="badge">{CHAPTERS.updated}</span>}
      </span>
      {state && (
        <span className={cx(statusClass(state.status), "chapter-state")}>
          {state.word}
        </span>
      )}
      {current && sections.length > 1 && (
        <ol className="chapter-sections" aria-label={CHAPTERS.sections}>
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="section-link"
                aria-current={s.id === section ? "location" : undefined}
                onClick={() => onSection?.(s.id)}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export interface ReaderChaptersProps {
  rows: readonly ChapterRowItem[];
  /** The chapter being read. */
  current?: string;
  sections?: readonly ChapterSection[];
  section?: string;
  onOpen?: (id: string) => void;
  onSection?: (id: string) => void;
}

export function ReaderChapters({
  rows,
  current,
  sections,
  section,
  onOpen,
  onSection,
}: ReaderChaptersProps) {
  return (
    <ol className="chapters" aria-label={CHAPTERS.list}>
      {rows.map((row) => (
        <ChapterRow
          key={row.id}
          row={row}
          current={row.id === current}
          sections={row.id === current ? sections : undefined}
          section={section}
          onOpen={onOpen}
          onSection={onSection}
        />
      ))}
    </ol>
  );
}
