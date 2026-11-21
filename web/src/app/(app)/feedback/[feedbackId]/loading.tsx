import { FeedbackItemLoadingState } from "@/sikstack/feedback/item";

/** One piece of feedback while it loads (`FeedbackItem.dc.html`, Loading): no add and no Agenda part. */
export default function FeedbackItemLoading() {
  return <FeedbackItemLoadingState />;
}
