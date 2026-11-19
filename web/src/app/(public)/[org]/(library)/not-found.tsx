import { headers } from "next/headers";

import { StateBlock } from "@/hi2vi/states";
import { optionalIdentity } from "@/lib/auth-guards";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";
import { signInFrom } from "@/lib/public-library/model";

import { libraryNotFound } from "./parts";

/**
 * Library not found (`PublicLibrary.dc.html`, Not found; frame.md F71; D249-7z), inside the layout's
 * frame: an address with no `@` (any unknown one-segment address, `/nope`), an unknown org, and an org
 * that shows this reader nothing public. A visitor reads the visitor's words and **Sign in**; a
 * signed-in reader the member's words and **Back to Library**, with no rail item current.
 */
export default async function PublicLibraryNotFound() {
  const [ctx, path] = await Promise.all([
    optionalIdentity(),
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
  ]);
  return (
    <StateBlock
      state={libraryNotFound(
        ctx
          ? { viewer: "member" }
          : { viewer: "visitor", signInHref: signInFrom(path) },
      )}
    />
  );
}
