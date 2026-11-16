import { FullWidthExit } from "@/app/(public)/documents/[id]/full-width-exit";
import { SKIP_TO_CONTENT } from "@/content";
import { loadShellData, requestNonce } from "@/hi2vi/shell/data";
import { LegacyPage } from "@/hi2vi/shell/legacy-page";
import { ShellOrgNameProvider } from "@/hi2vi/shell/org-name";
import { Shell } from "@/hi2vi/shell/shell";
import { ToastRegion } from "@/hi2vi/shell/toast";
import { Legacy } from "@/hi2vi/ui/boundary";
import { UiRoot } from "@/hi2vi/ui/root";
import type { KbIdentity } from "@/lib/knowledge/types";
import { reviewDue } from "@/lib/library/due";
import { ORG_ROUTE } from "@/lib/session";

import "@/hi2vi/shell/shell.css";

/**
 * The signed-in app's frame: the hi2vi Shell (P58; job 01 round 03-instrument, the org rail per job 03
 * round 02, F320), behind the export every signed-in route already renders, so they all get it at once.
 *
 *   UiRoot > .page > .app > .app-frame > [Shell: header.top + nav.rail] + main.app-main#main-content
 *                                                                          ├─ the page
 *                                                                          └─ .toast-region (last child)
 *
 * A SERVER component: the identity, the org's projects and the Review count are read here and handed to
 * the client `Shell` as plain data; the session token never crosses to the client. The rail and the
 * current project follow the path in the client, so the frame persists across client navigation.
 *
 * `legacy` (default on) puts the page inside `LegacyPage`, the old-page boundary: the `(public)` shells,
 * the versions page and the not-founds get it this way. The `(app)` layout passes
 * `legacy={false}` and lets each old route folder's own `layout.tsx` wrap its pages, so a route turns
 * into a system page by deleting that one file (org home S7, project home S8).
 *
 * On a reader path the request carries a nonce CSP; `UiRoot`'s scheme script takes its nonce.
 */
export async function AppShell({
  identity,
  fullWidth,
  legacy = true,
  children,
}: {
  identity: KbIdentity;
  /**
   * Round 06 §4.4 — the chrome-less document view (`?view=full`): the bar and the rail are hidden by
   * CSS (`shell.css`), the old page carries `data-kb-view="full"` for `kb-docview.css`, and the exit
   * pill (`position: fixed`) is mounted outside the old page and pins to the screen. Nothing unmounts.
   */
  fullWidth?: boolean;
  /** Wrap the page in the old-page boundary (default). `false`: the route decides, per folder. */
  legacy?: boolean;
  children: React.ReactNode;
}) {
  const [due, nonce, data] = await Promise.all([
    reviewDue(),
    requestNonce(),
    loadShellData(identity),
  ]);
  const active = identity.tenant ?? identity.tenants[0] ?? null;
  const org = active
    ? { id: active.id, name: active.name }
    : { id: "", name: "—" };

  return (
    <UiRoot nonce={nonce}>
      {/* The skip link keeps the old `.kb-skip` look: the system has no skip-link class yet. */}
      <Legacy>
        <a className="kb-skip" href={SKIP_TO_CONTENT.href}>
          {SKIP_TO_CONTENT.label}
        </a>
      </Legacy>
      <div className="page">
        <div className="app" data-view={fullWidth ? "full" : undefined}>
          <div className="app-frame">
            <Shell
              org={org}
              orgs={data.orgs}
              projects={data.projects}
              email={identity.user.email}
              due={due}
              orgRoute={ORG_ROUTE}
            />
            <main id="main-content" className="app-main">
              <ShellOrgNameProvider name={org.name}>
                {legacy ? (
                  <LegacyPage fullWidth={fullWidth}>{children}</LegacyPage>
                ) : (
                  children
                )}
              </ShellOrgNameProvider>
              <ToastRegion />
            </main>
          </div>
        </div>
      </div>
      {fullWidth ? (
        <Legacy>
          <FullWidthExit />
        </Legacy>
      ) : null}
    </UiRoot>
  );
}
