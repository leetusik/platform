import { DEFERRED_FILTERS, DEFERRED_LIST } from "@/content/workspace/deferred";
import type { JobFilter } from "@/lib/workspace/address";

import { filterChoices, type FilterCounts } from "./list-model";

/**
 * The status filter (`DeferredFilter.dc.html`, frame.md F82, deferred:FG1): a `role="group"` named **Status** of
 * four toggle buttons (`aria-pressed`), each its count then its word: `12 Open`, `2 Promoted`, `2 Dropped`,
 * `1 Done`. Each choice holds still: a hidden copy keeps the room its count can need (the status's whole count,
 * three figures at least), and the count on show ends that room, so a search that lowers it moves nothing.
 * While the list loads (`counts` null) each room holds a bar and every choice is off.
 */
export function DeferredFilter({
  value,
  counts,
  totals,
  disabled = false,
  onPick,
}: {
  value: JobFilter;
  counts: FilterCounts | null;
  totals: FilterCounts | null;
  disabled?: boolean;
  onPick?: (key: JobFilter) => void;
}) {
  const choices = filterChoices(value, counts, totals, DEFERRED_FILTERS);
  return (
    <div className="dj-filter" role="group" aria-label={DEFERRED_LIST.filter}>
      {choices.map((c) => (
        <button
          key={c.key}
          type="button"
          className="dj-choice"
          aria-pressed={c.pressed}
          disabled={disabled}
          onClick={onPick ? () => onPick(c.key) : undefined}
        >
          <span className="dj-box">
            <span className="dj-room" aria-hidden="true">
              <span className="dj-n">{c.room}</span>
              <span>{c.label}</span>
            </span>
            <span className="dj-on">
              {c.count === null ? (
                <span className="skel" />
              ) : (
                <span className="dj-n">{c.count}</span>
              )}
              <span>{c.label}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
