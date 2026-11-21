import type { Metadata } from "next";

import {
  FeedbackItemBody,
  feedbackItemMetadata,
} from "@/sikstack/feedback/item/body";

/**
 * One piece of feedback, the org's: `/feedback/<id>`.
 * The page is the shared item (`@/sikstack/feedback/item`); this file only reads the address.
 */
type Params = { feedbackId: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { feedbackId } = await params;
  return feedbackItemMetadata(null, feedbackId);
}

export default async function FeedbackItemPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { feedbackId } = await params;
  const { from } = await searchParams;
  return <FeedbackItemBody scope={null} feedbackId={feedbackId} from={from} />;
}
