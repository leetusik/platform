import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { Bar } from "@/sikstack/library";
import { requestNonce } from "@/sikstack/shell/data";
import { UiRoot } from "@/sikstack/ui";
import { optionalIdentity } from "@/lib/auth-guards";
import { signInFrom } from "@/lib/public-library/model";

import { PublicViewerProvider } from "./viewer";

/**
 * The public library's two frames (frame.md F52; `## Build` § Page: public-library), chosen by who reads:
 *
 * - **Signed in**: the Shell (`AppShell`, the page's own markup straight into `main.app-main`), whose
 *   wordmark and rail's Library lead to the Library.
 * - **Signed out** (a visitor, D256-4n): `.ui > .page > .app.bare > Bar + main.app-main`. The Bar has no
 *   way back and no tools, is not sticky: the wordmark, leading to the landing, and **Sign in**, leading
 *   to sign-in and returning to this address.
 *
 * Used by the library's layout (so the page, Loading, Error and Not found all render inside it) and by
 * the two old graph routes' not-founds, which have no layout of their own. `path` is the request's.
 * `optionalIdentity()` is `cache()`d: the page's own call shares its `/auth/me`.
 */
export async function PublicLibraryFrame({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const ctx = await optionalIdentity();
  if (ctx)
    return (
      <AppShell identity={ctx.identity} legacy={false}>
        <PublicViewerProvider viewer="member">{children}</PublicViewerProvider>
      </AppShell>
    );
  const nonce = await requestNonce();
  return (
    <UiRoot nonce={nonce}>
      <div className="page">
        <div className="app bare">
          <Bar
            back=""
            tools=""
            viewer="visitor"
            sticky={false}
            homeHref="/"
            signInHref={signInFrom(path)}
          />
          <main id="main-content" className="app-main">
            <PublicViewerProvider viewer="visitor">
              {children}
            </PublicViewerProvider>
          </main>
        </div>
      </div>
    </UiRoot>
  );
}
