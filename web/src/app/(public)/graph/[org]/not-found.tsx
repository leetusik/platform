import { headers } from "next/headers";

import { StateBlock } from "@/sikstack/states";
import { optionalIdentity } from "@/lib/auth-guards";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";
import { signInFrom } from "@/lib/public-library/model";

import { PublicLibraryFrame } from "@/app/(public)/[org]/(library)/frame";
import { libraryNotFound } from "@/app/(public)/[org]/(library)/parts";

/**
 * The not-found of `/graph/{org_uuid}` (a redirect to the org's library since P37-1p), reached by the
 * page's `notFound()` for a malformed id or the library read's one 404. It is the public library's own
 * Library not found (`PublicLibrary.dc.html`, Not found; D249-7z), in the frame the library's layout
 * would pick (the Shell signed in, the bar's frame signed out), since this route has no layout of its
 * own. No loading boundary sits above it, so it answers a real HTTP 404.
 */
export default async function LegacyGraphNotFound() {
  const [ctx, path] = await Promise.all([
    optionalIdentity(),
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
  ]);
  return (
    <PublicLibraryFrame path={path}>
      <StateBlock
        state={libraryNotFound(
          ctx
            ? { viewer: "member" }
            : { viewer: "visitor", signInHref: signInFrom(path) },
        )}
      />
    </PublicLibraryFrame>
  );
}
