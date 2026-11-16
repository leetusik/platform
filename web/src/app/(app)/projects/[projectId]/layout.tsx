import { LegacyPage } from "@/hi2vi/shell/legacy-page";

// P58 — this route's pages are old pages inside the hi2vi Shell: the old-page boundary
// (`LegacyPage`) keeps their own look and stops the system at them; their loading, error and
// not-found files render inside it too. Project home: kept old until S8 rebuilds it, which deletes this file.
// A route without this file renders system markup straight into `main.app-main`.
export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegacyPage>{children}</LegacyPage>;
}
