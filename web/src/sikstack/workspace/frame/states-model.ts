import { SIKSTACK_STATES } from "@/content/sikstack-states";
import { WS_STATES, type WsItemKind } from "@/content/workspace/frame";
import type { StateAction, StateModel } from "@/sikstack/states";

/** An item page's own way back: where it goes and its destination's name (frame.md F36). */
export interface WsBack {
  href: string;
  label: string;
}

const backAction = (back: WsBack): StateAction => ({
  kind: "link",
  label: WS_STATES.back(back.label),
  href: back.href,
  variant: "default",
});

/**
 * An item's page that names nothing (frame.md F49): `Phase not found`, `This phase doesn’t exist, or it isn’t
 * part of platform.` and the item's own way back, `Back to Backlog`. Drawn by `StateBlock` under the back row.
 */
export function wsNotFoundState(
  kind: WsItemKind,
  project: string,
  back: WsBack,
): StateModel {
  return {
    title: WS_STATES.notFound.title(kind),
    text: WS_STATES.notFound.text(kind, project),
    actions: [backAction(back)],
    reference: null,
  };
}

/**
 * An item's page that failed (frame.md F49): F5's app error, **Try again** and the item's own way back, the
 * reference only when the error has one. Drawn by `StateBlock` with the boundary's retry, under the back row.
 */
export function wsErrorState(back: WsBack, digest?: string | null): StateModel {
  const e = SIKSTACK_STATES.error;
  return {
    title: e.title,
    text: e.text,
    actions: [
      { kind: "retry", label: WS_STATES.retry, variant: "primary" },
      backAction(back),
    ],
    reference: digest ? e.reference(digest) : null,
  };
}
