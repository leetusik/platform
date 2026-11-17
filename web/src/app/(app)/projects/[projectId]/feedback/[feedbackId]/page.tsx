import type { Metadata } from "next";

import {
  FeedbackItemBody,
  feedbackItemMetadata,
} from "@/hi2vi/feedback/item/body";

/**
 * One piece of feedback, with a project picked: `/projects/<projectId>/feedback/<id>` (a record of another project, or of none, is Feedback not found).
 * The page is the shared item (`@/hi2vi/feedback/item`); this file only reads the address.
 */
type Params = { projectId: string; feedbackId: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { projectId, feedbackId } = await params;
  return feedbackItemMetadata(projectId, feedbackId);
}

export default async function FeedbackItemPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { projectId, feedbackId } = await params;
  const { from } = await searchParams;
  return (
    <FeedbackItemBody scope={projectId} feedbackId={feedbackId} from={from} />
  );
}
