import { FeedbackItemNotFoundState } from "@/sikstack/feedback/item";

/**
 * Feedback not found (`FeedbackItem.dc.html`, Not found; F132): a malformed id, a missing record or
 * another org's read alike, so ids cannot be probed.
 */
export default function FeedbackItemNotFound() {
  return <FeedbackItemNotFoundState />;
}
