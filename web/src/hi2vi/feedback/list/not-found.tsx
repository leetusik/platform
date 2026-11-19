import { notFoundState, StateBlock } from "@/hi2vi/states";
import { requireIdentity } from "@/lib/auth-guards";

/**
 * Not found under either list route (the system's Not found, `States.dc.html`): an id that is no project
 * of the active org at `/projects/{id}/feedback`. The list's own wrong addresses are No such view, drawn
 * by the page itself.
 */
export async function FeedbackListNotFound() {
  const { identity } = await requireIdentity();
  return (
    <StateBlock
      state={notFoundState({ orgName: identity.tenant?.name ?? "—" })}
    />
  );
}
