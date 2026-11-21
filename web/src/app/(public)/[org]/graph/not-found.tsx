import { headers } from "next/headers";

import { StateBlock } from "@/sikstack/states";
import { optionalIdentity } from "@/lib/auth-guards";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";
import { signInFrom } from "@/lib/public-library/model";

import { PublicLibraryFrame } from "../(library)/frame";
import { libraryNotFound } from "../(library)/parts";

/**
 * The not-found of `/@{org}/graph` (a redirect to the org's library since P37-1p), reached only by the
 * page's `@` guard: this route catches every unmatched `/x/graph`. It is the public library's own
 * Library not found (`PublicLibrary.dc.html`, Not found; D249-7z), in the frame the library's layout
 * would pick (the Shell signed in, the bar's frame signed out), since this route has no layout of its
 * own. No loading boundary sits above it, so it answers a real HTTP 404.
 */
export default async function PublicGraphNotFound() {
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
