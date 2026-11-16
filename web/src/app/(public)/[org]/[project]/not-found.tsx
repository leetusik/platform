import { headers } from "next/headers";

import { requestNonce } from "@/hi2vi/shell/data";
import { StateBlock } from "@/hi2vi/states";
import { optionalIdentity } from "@/lib/auth-guards";
import { loginHref, REQUEST_PATH_HEADER } from "@/lib/next-path";
import { publicBack } from "@/lib/project-library/place";

import {
  projectNotFound,
  PublicProjectFrame,
} from "@/app/(app)/projects/[projectId]/library/parts";

/**
 * Project not found at a public address (`ProjectLibrary.dc.html`, Visitor, private project; frame.md
 * F71; D249-7z): a private project, an unknown project, an unknown org and a two-segment address with no
 * `@` are one state, never 403. In the bar's frame, F5's block with the visitor's words and **Sign in**,
 * returning here (a reader already signed in: **Back to Library**).
 */
export default async function PublicProjectNotFound() {
  const [path, ctx, nonce] = await Promise.all([
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
    optionalIdentity(),
    requestNonce(),
  ]);
  const signInHref = ctx ? null : loginHref(path);
  return (
    <PublicProjectFrame
      nonce={nonce}
      back={publicBack(path)}
      signInHref={signInHref ?? undefined}
    >
      <StateBlock state={projectNotFound({ viewer: "visitor", signInHref })} />
    </PublicProjectFrame>
  );
}
