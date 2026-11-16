import { LibraryContinue } from "@/hi2vi/library/lists";
import { requireIdentity } from "@/lib/auth-guards";
import { publicLibraryHref } from "@/lib/reader-href";

import { LibraryReadingData, ViewsLoading } from "./client-parts";
import { LibraryHead } from "./parts";

/**
 * The library while it loads (`Library.dc.html` Loading): the head stands (the session knows the org;
 * `requireIdentity` is the layout's cached read), Continue reading's skeleton, the toolbar's count as
 * a bar, then the view's skeleton; Your reading data stands.
 */
export default async function LibraryLoading() {
  const { identity } = await requireIdentity();
  const slug = identity.tenant?.slug?.trim() || null;
  return (
    <div className="column">
      <LibraryHead publicHref={slug ? publicLibraryHref(slug) : null} />
      <div className="library-parts">
        <LibraryContinue loading />
        <ViewsLoading />
        <LibraryReadingData />
      </div>
    </div>
  );
}
