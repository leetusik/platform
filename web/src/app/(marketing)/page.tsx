import { connection } from "next/server";

import { Landing } from "@/hi2vi/landing";
import { feedbackControl } from "@/lib/send-feedback/config";

// The public landing at `/` (job 06, round 01-landing, signed), with hi2vi's own feedback control in
// its footer (job 08, round 01-landing-diagram-feedback, `## Build` 3c-3d) where the server holds the
// control's key. `connection()` makes the page wait for a request, so the key is read from the running
// server's environment on every request, never frozen into a page prerendered at build time.
export default async function LandingPage() {
  await connection();
  const feedback = feedbackControl();
  return (
    <Landing
      sendFeedback={feedback.configured ? { limit: feedback.limit } : undefined}
    />
  );
}
