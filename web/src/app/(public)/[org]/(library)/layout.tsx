import { headers } from "next/headers";

import { REQUEST_PATH_HEADER } from "@/lib/next-path";

import { PublicLibraryFrame } from "./frame";

/**
 * The frame of `/@{org}` and every state of it (frame.md F52, F71: the frame is complete in every
 * state): the Shell for a signed-in reader, the bar's frame for a visitor (`./frame.tsx`). The page, its
 * Loading and Error (`(guarded)/`) and its Not found (here) render inside it.
 *
 * The group is split in two so an address that is no public library is refused with a real HTTP 404:
 * `(guarded)/layout.tsx` checks the `@` before any read and above the Loading boundary, and its
 * `notFound()` lands on this folder's `not-found.tsx` before anything streams. A miss the page finds by a
 * read sits under the Loading boundary: the response has begun as a 200, so Next marks it noindex (a
 * soft 404, `next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` § Status Codes; OQ6).
 */
export default async function PublicLibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = (await headers()).get(REQUEST_PATH_HEADER) ?? "/";
  return <PublicLibraryFrame path={path}>{children}</PublicLibraryFrame>;
}
