import type { ReactNode } from "react";

import { Legacy } from "@/hi2vi/ui";

import "@/app/reader-fonts.css";
import "@/app/reader.css";

/**
 * Listen in its old look on the new book page (operator decision 3 of P63-fk: where the signed book places
 * Listen, the existing control keeps working in its old look until P64-3y). The control, the dock and the
 * player are the reader's (`lx-*`, `reader.css`), which read their tokens from a reader root, so each is
 * mounted behind the old-page boundary (`Legacy`) in a reader root of its own. That root follows the
 * device's scheme, as the page around it does; it is laid out as its content only (no page height, no
 * ground of its own), so the head's row and the window keep the board's places.
 */
export function ListenHost({ children }: { children: ReactNode }) {
  return (
    <Legacy className="book-listen">
      <div
        className="rd-root rd-size-3"
        data-md-color-scheme="default"
        data-theme-choice="system"
        lang="en"
        style={{ minHeight: 0, flex: "none", background: "transparent" }}
      >
        {children}
      </div>
    </Legacy>
  );
}
