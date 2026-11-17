import { LegacyPage } from "@/hi2vi/shell/legacy-page";

// P65 — one piece of feedback is an old page inside the hi2vi Shell until its own slice rebuilds it:
// the old-page boundary (`LegacyPage`) keeps its own look and stops the system at it; its not-found
// renders inside it too. The item's own boundary (no shared `feedback/layout.tsx`), so the list and
// the item are rebuilt apart. Delete this file and the item renders system markup.
export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegacyPage>{children}</LegacyPage>;
}
