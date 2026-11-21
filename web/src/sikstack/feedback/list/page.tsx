import { StateBlock } from "@/sikstack/states";
import type { FeedbackScope } from "@/lib/feedback/place";

import { FeedbackList } from "./list";
import { readFeedbackList } from "./load";
import { noSuchView } from "./model";

/**
 * The Feedback list's server body, one for both routes (`result.md` § The list): `/feedback` (the org's
 * list, `scope` null) and `/projects/{id}/feedback` (a project picked: no select, no Project column).
 * No such view replaces the head and the panel; otherwise the list's island draws the rest.
 */
export async function FeedbackListPage({
  scope,
  searchParams,
}: {
  scope: FeedbackScope;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const read = await readFeedbackList(scope, await searchParams);
  if (read.kind === "no-view")
    return <StateBlock state={noSuchView(read.orgName, scope)} />;
  return <FeedbackList {...read.list} />;
}
