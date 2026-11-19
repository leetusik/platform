import type { Metadata } from "next";

import { FEEDBACK } from "@/content/feedback-frame";
import { FeedbackListPage } from "@/hi2vi/feedback/list";

/**
 * The org's Feedback (`Feedback.dc.html`, job 04 round 02): a system page in the Shell, the rail's
 * Feedback current. Its address is the list's place (`?page=&q=&project=&rating=`, S3's
 * `lib/feedback/place.ts`); the project filter keeps the org's Shell. The tab title is `Feedback`
 * through the site's template.
 */
export const metadata: Metadata = { title: FEEDBACK };

export default function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FeedbackListPage scope={null} searchParams={searchParams} />;
}
