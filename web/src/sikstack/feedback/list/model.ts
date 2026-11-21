/**
 * The Feedback list's rules (`result.md` § The list; frame.md F128, F130, F139 to F141, F340, F343), pure
 * so a node test reaches them: which body stands in the panel, the rows as the table draws them, the
 * pager's figures, No such view's block. No React and no I/O: `./load.ts` reads, `./view.tsx` draws.
 */

import { BACK_TO_FEEDBACK, NOT_FOUND } from "@/content/feedback-frame";
import { noSuchViewText } from "@/content/feedback-list";
import { pagerRange } from "@/sikstack/library/pager-model";
import type { StateModel } from "@/sikstack/states";
import { when } from "@/lib/feedback/format";
import { langAttr } from "@/lib/feedback/lang";
import {
  feedbackHref,
  feedbackItemHref,
  type FeedbackPlace,
  type FeedbackScope,
} from "@/lib/feedback/place";
import type { Feedback } from "@/lib/feedback/types";

/** Fifty rows a page (F340, `FB.PAGE`). */
export const PAGE_SIZE = 50;

/**
 * Where the list's request is (the board's `phase`): `ready`; `loading` (the page itself: Try again);
 * `searching` (a search, a filter or Clear on its way); `paging` (a page on its way, its rows kept);
 * `failed` (the list did not load).
 */
export type ListPhase = "ready" | "loading" | "searching" | "paging" | "failed";

/** What stands in the panel under the bar. */
export type ListBody =
  "failed" | "waiting" | "rows" | "no-projects" | "no-match" | "none";

/**
 * Which body shows, in the record's precedence: failed, then a request out, then rows, then no
 * project in the org, then no match (a search or a filter is set), then no feedback yet.
 */
export function listBody({
  phase,
  rows,
  projects,
  filtered,
}: {
  phase: ListPhase;
  rows: number;
  projects: number;
  filtered: boolean;
}): ListBody {
  if (phase === "failed") return "failed";
  if (phase === "loading" || phase === "searching") return "waiting";
  if (rows > 0) return "rows";
  if (projects === 0) return "no-projects";
  if (filtered) return "no-match";
  return "none";
}

/** A request is out: the panel is `aria-busy`. */
export const isBusy = (phase: ListPhase) =>
  phase === "loading" || phase === "searching" || phase === "paging";

/** The count line is a bar while the rows are skeletons (F343). */
export const isCounting = (phase: ListPhase) =>
  phase === "loading" || phase === "searching";

/** How many of the project and rating filters are set (the no-match sentence's form). */
export const filtersSet = (place: FeedbackPlace) =>
  (place.project ? 1 : 0) + (place.rating ? 1 : 0);

/** One row as the table draws it: every value already a string, in the viewer's zone. */
export interface FeedbackListRow {
  id: string;
  value: 1 | 2 | null;
  message: string;
  /** `ko` on a Korean message; none when it is the page's language. */
  lang?: string;
  /** The project's name; null draws the dash. */
  project: string | null;
  projectLang?: string;
  /** The record's product; null draws the dash. */
  product: string | null;
  /** The ISO instant (`time[datetime]`). */
  at: string;
  /** `2h ago`, `Nov 6` (F2, `FW.when`). */
  when: string;
  /** The item, in the Shell the list shows, carrying the list's place as the way back. */
  href: string;
}

/** The records as rows: names from the org's projects, times in `timeZone`. */
export function listRows(
  records: readonly Feedback[],
  {
    scope,
    place,
    projects,
    timeZone,
    now,
  }: {
    scope: FeedbackScope;
    place: FeedbackPlace;
    projects: readonly { id: string; name: string }[];
    timeZone?: string;
    now?: number;
  },
): FeedbackListRow[] {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  return records.map((r) => {
    const project = (r.project_id && names.get(r.project_id)) || null;
    return {
      id: r.id,
      value:
        r.feedback_value === 1 || r.feedback_value === 2
          ? r.feedback_value
          : null,
      message: r.message,
      lang: langAttr(r.message),
      project,
      projectLang: langAttr(project),
      product: r.source_product || null,
      at: r.ingested_at,
      when: when(r.ingested_at, { timeZone, now }),
      href: feedbackItemHref(scope, r.id, place),
    };
  });
}

/** How many pages the list has (at least one). */
export const pageCount = (total: number) =>
  Math.max(1, Math.ceil(total / PAGE_SIZE));

/** The pager's range, the rows on screen and the total: `51–100 of 230`. */
export const listRange = (page: number, total: number) =>
  pagerRange(page, PAGE_SIZE, total);

/** No such view (`Feedback.dc.html`): its sentence, and Back to Feedback to the list at rest. */
export function noSuchView(orgName: string, scope: FeedbackScope): StateModel {
  return {
    title: NOT_FOUND.view,
    text: noSuchViewText(orgName),
    actions: [
      {
        kind: "link",
        label: BACK_TO_FEEDBACK,
        href: feedbackHref(scope),
        variant: "default",
      },
    ],
    reference: null,
  };
}
