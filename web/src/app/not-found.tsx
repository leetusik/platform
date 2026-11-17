import { AppShell } from "@/components/app-shell";
import { notFoundState, StateBlock } from "@/hi2vi/states";
import { UiRoot } from "@/hi2vi/ui";
import { optionalIdentity } from "@/lib/auth-guards";

/**
 * The root not-found (job 01 round 03-instrument, Shared states: Not found): every address that matches
 * no route, and a `notFound()` from any segment without a nearer `not-found.tsx` (the `(public)` pages
 * that have none of their own).
 *
 * - Signed in: the Shell stays, as on every signed-in page, and the block reads "Page not found",
 *   "This page doesn’t exist, or it isn’t part of <org name>." and Back to <org name>; no rail item is
 *   current (the Shell follows the path, and an unknown path is no rail item's).
 * - Signed out: there is no Shell to keep and no org to name, so the same block holds its signed title
 *   and one link to the landing, "Go to hi2vi" (the operator's answer to OQ7), inside its own `UiRoot`.
 *
 * Before P58 there was no root not-found: Next's default 404 page answered both cases.
 */
export default async function RootNotFound() {
  const context = await optionalIdentity();
  if (context) {
    const { identity } = context;
    const org = identity.tenant ?? identity.tenants[0] ?? null;
    return (
      <AppShell identity={identity} legacy={false}>
        <StateBlock state={notFoundState({ orgName: org?.name ?? "—" })} />
      </AppShell>
    );
  }
  return (
    <UiRoot>
      <div className="page">
        <div className="app">
          <main id="main-content" className="app-main">
            <StateBlock state={notFoundState({ orgName: null })} />
          </main>
        </div>
      </div>
    </UiRoot>
  );
}
