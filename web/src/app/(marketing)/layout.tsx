import type { Metadata } from "next";

import { SITE } from "@/content";
import { LANDING } from "@/content/marketing";

// The public route group: the landing at `/` (src/sikstack/landing/). It is public, has no auth gate and
// indexes (the `(auth)` subtree sets robots noindex). The landing renders its own `.ui` root, which
// follows the system scheme; the title is absolute, so the root's " · knowledge" template stays off it.
export const metadata: Metadata = {
  title: { absolute: LANDING.meta.title },
  description: LANDING.meta.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: LANDING.meta.title,
    description: LANDING.meta.description,
    url: SITE.url,
    siteName: LANDING.meta.siteName,
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
