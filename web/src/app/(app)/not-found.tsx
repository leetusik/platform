import { notFoundState, StateBlock } from "@/sikstack/states";
import { requireIdentity } from "@/lib/auth-guards";

/**
 * Not found for a signed-in page that calls `notFound()` (job 01 round 03-instrument, Shared states:
 * Not found), where no route folder has its own. It renders inside `(app)/layout.tsx`'s `AppShell`,
 * into `main.app-main` under `.ui` (above the folders' `LegacyPage` layouts); no rail item is current
 * because the Shell follows the path. An address that matches no route at all is the root
 * `app/not-found.tsx`'s, which draws the same block.
 *
 * `requireIdentity` is `cache()`d: this shares the layout's one `/auth/me` read.
 */
export default async function AppNotFound() {
  const { identity } = await requireIdentity();
  const org = identity.tenant ?? identity.tenants[0] ?? null;
  return <StateBlock state={notFoundState({ orgName: org?.name ?? "—" })} />;
}
