import { StateBlock } from "@/sikstack/states";
import { requireIdentity } from "@/lib/auth-guards";

import { projectNotFound } from "./parts";

/**
 * Project not found, a member's (`ProjectLibrary.dc.html`, Not found; frame.md F71): an id that is no
 * project of the active org (missing, another org's or malformed) renders F5's block in the Shell,
 * with no rail item current, and **Back to Library**.
 */
export default async function ProjectLibraryNotFound() {
  const { identity } = await requireIdentity();
  return (
    <StateBlock
      state={projectNotFound({
        viewer: "member",
        orgName: identity.tenant?.name ?? "—",
      })}
    />
  );
}
