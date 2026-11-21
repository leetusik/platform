"use client";

import { FeedbackItemErrorState } from "@/sikstack/feedback/item/states";
import type { BoundaryRetryProps } from "@/sikstack/states";

/** One piece of feedback did not load (`FeedbackItem.dc.html`, Error; F132), under its back row. */
export default function FeedbackItemError(
  props: BoundaryRetryProps & { error: Error & { digest?: string } },
) {
  return <FeedbackItemErrorState {...props} />;
}
