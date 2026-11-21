import type { Metadata } from "next";

import { FEEDBACK } from "@/content/feedback-frame";
import { FeedbackListPage } from "@/sikstack/feedback/list";

/**
 * A project's Feedback (`Feedback.dc.html` with a project picked, job 04 round 02): the list at
 * `/projects/{id}/feedback`, the project rail's Feedback current. No project select and no Project
 * column: the Shell says the project. An id that is no project of the active org is Not found.
 */
export const metadata: Metadata = { title: FEEDBACK };

export default async function ProjectFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  return <FeedbackListPage scope={projectId} searchParams={searchParams} />;
}
