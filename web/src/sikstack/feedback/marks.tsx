import { ABSENT, WAITING } from "@/content/feedback-frame";
import { cx } from "@/lib/cx";
import { ratingOf, type FeedbackValue } from "@/lib/feedback/format";
import { langAttr } from "@/lib/feedback/lang";

/**
 * Rating (`Rating.dc.html`, frame.md F122): `span.rating` holding its word, a triangle before Liked (up)
 * and Disliked (down), none before Unrated, ink only. In a column of ratings (a table's cell, a `.row`'s
 * cell) Unrated keeps the mark's place, so the three words start on one edge; alone (a fact, a title, a
 * stacked row) it keeps none. The sheet does both: put the part straight in the cell.
 */
export function Rating({
  value,
  className,
}: {
  /** The API's `feedback_value`: 1 liked, 2 disliked, null unrated. */
  value: FeedbackValue;
  className?: string;
}) {
  const rating = ratingOf(value);
  return <span className={cx(rating.className, className)}>{rating.word}</span>;
}

/** Absent (frame.md F124): F2's dash in the second ink, with `Not recorded` for a screen reader. */
export function Absent() {
  return (
    <span className="absent">
      <span aria-hidden="true">{ABSENT.mark}</span>
      <span className="sr-only">{ABSENT.label}</span>
    </span>
  );
}

/**
 * Tags (`Tag.dc.html`, frame.md F125): the caller's words as written, `ul.tags > li.tag`, a Korean one
 * `lang="ko"`. Not controls: they link nowhere and filter nothing. With none, the dash (F124).
 */
export function Tags({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <Absent />;
  return (
    <ul className="tags">
      {tags.map((tag, i) => (
        <li key={i} className="tag" lang={langAttr(tag)}>
          {tag}
        </li>
      ))}
    </ul>
  );
}

/**
 * Waiting (`Waiting.dc.html`, frame.md F45, F344): the system's badge, dashed, its word in ink, beside
 * the title of the agenda item that waits for the workspace's next sync. The board's
 * `badge is-waiting` is the system's `.badge.is-waiting.is-ink` (D238-rm).
 */
export function Waiting() {
  return <span className="badge is-waiting is-ink">{WAITING}</span>;
}
