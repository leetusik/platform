// hi2vi's own feedback control (job 08, round 01-landing-diagram-feedback): one element, mounted on
// the landing's footer (a visitor) and org home's head (a signed-in user), only where the server
// holds the control's key. Its words are `@/content/send-feedback`; its states ./model.ts.
export { SendFeedback } from "./send-feedback";
export type { SendFeedbackProps } from "./send-feedback";
export type { FeedbackContext, FeedbackPhase } from "./model";
