import type { ReactNode } from "react";

import { Legacy } from "@/hi2vi/ui/boundary";

/**
 * An old page inside the new Shell (decided as drawn: Library, Feedback, Documents, Review and the
 * reader keep their old content styling until their own phases rebuild them).
 *
 * The `Legacy` boundary stops the system at the page; inside it the page gets back the surroundings it
 * was built for: `.kb-app` (the old paper, ink and face, the `kbapp` container, the dark block that
 * follows the system setting, the focus floor) with the light `data-md-color-scheme` and
 * `data-kb-scheme="auto"`, and `.kb-app-main` (the `kbmain` container and its padding). `shell.css`
 * makes it fill the main column edge to edge and drops `.kb-app`'s own 100dvh height.
 *
 * Because `.kb-app` is a size container it is also the containing block of the page's
 * `position: fixed` parts (the review's reader bar), so they stay in the main column, under the Shell.
 *
 * A route switches to system markup by not rendering this: an `(app)` route folder's `layout.tsx`
 * wraps its pages in it; delete that file and the page renders straight into `main.app-main`.
 */
export function LegacyPage({
  fullWidth,
  children,
}: {
  /** The chrome-less document view (`?view=full`): the old `kb-docview.css` rules key off this. */
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <Legacy
      className="kb-app kb-legacy-page"
      data-md-color-scheme="default"
      data-kb-scheme="auto"
      data-kb-view={fullWidth ? "full" : undefined}
    >
      <div className="kb-app-main">{children}</div>
    </Legacy>
  );
}
