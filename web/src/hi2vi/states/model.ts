// The shared states' rules as pure functions (job 01 round 03-instrument, `## Build` § Shared states).
// No React and no I/O, so they are tested on their own (tests/hi2vi-states.test.ts); `StateBlock`
// renders what these return.

import { HI2VI_STATES } from "@/content/hi2vi-states";

/** One action of a state block: the boundary's retry (`button.btn`) or a link drawn as a button. */
export type StateAction =
  | { kind: "retry"; label: string; variant: "primary" | "default" }
  | {
      kind: "link";
      label: string;
      href: string;
      variant: "primary" | "default";
    };

/** What a whole-page state block shows: `h1.block-title`, `p.block-text`, its actions, `p.meta`. */
export interface StateModel {
  title: string;
  /** The block's sentence, or `null` when there is none to say. */
  text: string | null;
  actions: StateAction[];
  /** The reference line (`Reference <digest>`), or `null`. */
  reference: string | null;
}

function backToOrg(orgName: string): StateAction {
  return {
    kind: "link",
    label: HI2VI_STATES.back(orgName),
    href: HI2VI_STATES.orgHomeHref,
    variant: "default",
  };
}

/** With no org to name or go back to: the one link to the landing, "Go to hi2vi" (OQ7's words). */
function toLanding(): StateAction {
  const n = HI2VI_STATES.notFound;
  return {
    kind: "link",
    label: n.signedOutLink,
    href: n.signedOutHref,
    variant: "default",
  };
}

/**
 * Error: Try again (primary, the boundary's retry) and Back to <org name>; the reference line only
 * when the error has a digest (Next omits it for client-side throws).
 *
 * `orgName: null` is the root error (`app/error.tsx`): a throw in a layout, the `(app)` Shell's own
 * session and project reads among them, so there is no Shell and no org to name. The board draws only
 * the Error with an org; with none, Back to <org name> becomes the signed-out not-found's one link,
 * "Go to hi2vi", in the same place and style. Title, sentence, Try again and the reference stay.
 */
export function errorState({
  orgName,
  digest,
}: {
  orgName: string | null;
  digest?: string | null;
}): StateModel {
  const e = HI2VI_STATES.error;
  return {
    title: e.title,
    text: e.text,
    actions: [
      { kind: "retry", label: e.retry, variant: "primary" },
      orgName === null ? toLanding() : backToOrg(orgName),
    ],
    reference: digest ? e.reference(digest) : null,
  };
}

/**
 * Not found: its sentence and Back to <org name>. With nobody signed in there is no org to name or go
 * back to: the signed title and one link to the landing, "Go to hi2vi", in the same form as Back to
 * <org name> (the operator's answer to OQ7); no sentence.
 */
export function notFoundState({
  orgName,
}: {
  orgName: string | null;
}): StateModel {
  const n = HI2VI_STATES.notFound;
  if (orgName === null) {
    return {
      title: n.title,
      text: null,
      actions: [toLanding()],
      reference: null,
    };
  }
  return {
    title: n.title,
    text: n.text(orgName),
    actions: [backToOrg(orgName)],
    reference: null,
  };
}
