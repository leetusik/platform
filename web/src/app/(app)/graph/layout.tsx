import { LegacyPage } from "@/sikstack/shell/legacy-page";

// P58 — this route's pages are old pages inside the sikstack Shell: the old-page boundary
// (`LegacyPage`) keeps their own look and stops the system at them; their loading, error and
// not-found files render inside it too. Kept old until its own phase rebuilds it.
// A route without this file renders system markup straight into `main.app-main`.
export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegacyPage>{children}</LegacyPage>;
}
