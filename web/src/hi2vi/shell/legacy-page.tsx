import type { ReactNode } from "react";

import { Legacy } from "@/hi2vi/ui/boundary";

/**
 * An old page inside the new Shell (decided as drawn: Library, Feedback, Documents and the reader
 * keep their old content styling until their own phases rebuild them; Review stays out, see below).
 *
 * The `Legacy` boundary stops the system at the page; inside it the page gets back the surroundings it
 * was built for: `.kb-app` (the old paper, ink and face, the `kbapp` container, the dark block that
 * follows the system setting, the focus floor) with the light `data-md-color-scheme` and
 * `data-kb-scheme="auto"`, and `.kb-app-main` (the `kbmain` container and its padding). `shell.css`
 * makes it fill the main column edge to edge and drops `.kb-app`'s own 100dvh height.
 *
 * The box does not contain the page's `position: fixed` parts: they are placed against the window, over
 * the Shell's bar and rail (a size container, `.kb-app`'s `container-type`, is no containing block for
 * them). So no old page with screen-fixed parts goes inside the Shell: `/review` (its reader bar, sheets,
 * scrim and toast) renders without it until its own phase rebuilds it (`app/review/layout.tsx`).
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
