import { AppShell } from "@/components/app-shell";
import { requireIdentity } from "@/lib/auth-guards";

// P30.S24 — the review route is signed in only. The guard sits in the LAYOUT, above the
// segment's `loading.tsx`: a redirect from the page itself would come after the loading shell
// had streamed (an HTTP 200 carrying the skeleton), and the build prompt says a signed-out
// request renders nothing of the queue, not even a skeleton, and is redirected to
// `/login?next=/review` before any review data is read.
//
// P58 — Review sits inside the hi2vi Shell (decided as drawn), its content behind the
// old-page boundary (`AppShell`'s default) until its own phase rebuilds it. The boundary is
// a size container, so the review's `position: fixed` reader bar stays in the main column.
export default async function ReviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { identity } = await requireIdentity();
  return <AppShell identity={identity}>{children}</AppShell>;
}
