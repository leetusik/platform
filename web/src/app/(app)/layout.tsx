import { AppShell } from "@/components/app-shell";
import { requireIdentity } from "@/lib/auth-guards";

// P12.S2 — the authenticated route group. EVERYTHING under `(app)` is server-gated
// here: `requireIdentity()` unseals the session cookie (redirecting to /login when
// it is absent/invalid/expired) and confirms the token is still live at knowledge
// via a bearer-injected `GET /auth/me`, so the body only renders for a real session.
//
// The `(app)` group is invisible in the URL, so this wraps /dashboard, /projects/[id],
// /library, /documents, /feedback and /graph. Reading the cookie makes the whole
// subtree dynamic — never prerendered, never cached across users. `requireIdentity`
// is `cache()`d, so a page that also calls it shares this layout's single /auth/me
// round-trip.
//
// P58 — the hi2vi Shell. This layout is shared and persists across client navigation, so
// it cannot choose per route between system markup and the old-page boundary:
// `legacy={false}` hands that choice to each route folder. An old route's folder has a
// `layout.tsx` that wraps its pages in `LegacyPage`; a rebuilt route has none and renders
// system markup straight into `main.app-main`.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { identity } = await requireIdentity();

  return (
    <AppShell identity={identity} legacy={false}>
      {children}
    </AppShell>
  );
}
