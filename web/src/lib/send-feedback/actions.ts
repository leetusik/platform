"use server";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { requireIdentity } from "@/lib/auth-guards";

import type { SendFeedbackResult as Result } from "./check";
import { feedbackSettings, readCaptureKey } from "./config";
import { postCapture, sendAccountFeedback, sendVisitorFeedback } from "./core";

// hi2vi's own feedback control, as two server actions. A server action posts to the
// page's own path (`/`, `/dashboard`), which the edge already sends to web, and the
// capture key stays on this server: the browser sends only the message (and a
// visitor's optional email), and the integration is fixed by which action runs.
//
// NOTE: a `"use server"` module may export only async functions. The type below is
// erased before Next's loader sees the module, like `dashboard/actions.ts`' types.

/** What both actions answer; the dialog maps each status to its sentence. */
export type SendFeedbackResult = Result;

/** The landing's control: a visitor, with an optional email for a reply. */
export async function sendLandingFeedback(input: {
  message: string;
  email?: string;
  website?: string;
}): Promise<SendFeedbackResult> {
  return sendVisitorFeedback(input, {
    headers: await headers(),
    settings: feedbackSettings(),
    captureKey: readCaptureKey(),
    post: postCapture,
  });
}

/** Org home's control: the signed-in account sends as itself; only the message is read. */
export async function sendOrgHomeFeedback(input: {
  message: string;
}): Promise<SendFeedbackResult> {
  return sendAccountFeedback(input, {
    headers: await headers(),
    settings: feedbackSettings(),
    captureKey: readCaptureKey(),
    post: postCapture,
    identify: async () => {
      const { identity } = await requireIdentity();
      return { userId: identity.user.id, email: identity.user.email };
    },
    rethrow: unstable_rethrow,
  });
}
