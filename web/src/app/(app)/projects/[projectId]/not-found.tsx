import Link from "next/link";

import { PROJECT_HOME } from "@/content/project";
import { Block, BlockText, BlockTitle, buttonClass } from "@/hi2vi/ui";
import { requireIdentity } from "@/lib/auth-guards";

// Project home's Not found (`ProjectHome.dc.html`, Not found): an id that is no project of the active
// org (missing, another org's or malformed: the project read's 404, 400 or 422) renders the page
// block under the Shell. `Back to <org>` is one string (a `.btn` is a flex row: two text nodes would
// sit a gap apart), to org home.
export default async function ProjectNotFound() {
  const { identity } = await requireIdentity();
  const org = identity.tenant?.name ?? "—";
  const w = PROJECT_HOME.notFound;
  return (
    <div className="column">
      <Block page>
        <BlockTitle>{w.title}</BlockTitle>
        <BlockText>{w.text(org)}</BlockText>
        <Link href="/dashboard" className={buttonClass()}>
          {w.back(org)}
        </Link>
      </Block>
    </div>
  );
}
