import { notFound } from "next/navigation";

import { publicOrgOf } from "@/lib/public-library/model";

/**
 * The public library's guard (D249-7z): our public namespace is `@`-prefixed, so an address without the
 * `@` (`/nope`) is no public library and is refused here, before any session or API read and above this
 * folder's `loading.tsx`. Nothing has streamed yet, so its `notFound()` answers a real HTTP 404 with the
 * parent folder's Library not found (`../not-found.tsx`).
 */
export default async function PublicLibraryGuard({
  params,
  children,
}: {
  params: Promise<{ org: string }>;
  children: React.ReactNode;
}) {
  if (publicOrgOf((await params).org) === null) notFound();
  return children;
}
