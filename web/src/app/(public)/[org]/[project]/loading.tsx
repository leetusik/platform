import { headers } from "next/headers";

import { requestNonce } from "@/sikstack/shell/data";
import { loginHref, REQUEST_PATH_HEADER } from "@/lib/next-path";
import { getSession } from "@/lib/session";

import {
  ProjectLoading,
  PublicProjectFrame,
} from "@/app/(app)/projects/[projectId]/library/parts";

import { publicBack } from "@/lib/project-library/place";

/**
 * A public project's library while it loads (`ProjectLibrary.dc.html`, Loading, a visitor): the Bar
 * complete (its way back from the address: the org's public library, named by the address until the
 * org's name is read), then the page's skeletons. It reads no project; a session cookie tells a
 * signed-in reader (no Sign in).
 */
export default async function PublicProjectLoading() {
  const [path, session, nonce] = await Promise.all([
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
    getSession(),
    requestNonce(),
  ]);
  return (
    <PublicProjectFrame
      nonce={nonce}
      back={publicBack(path)}
      signInHref={session ? undefined : loginHref(path)}
    >
      <ProjectLoading viewer="visitor" />
    </PublicProjectFrame>
  );
}
