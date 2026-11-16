"use client";

import {
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
} from "react";

/**
 * The `.ui` root: where the hi2vi system applies (`src/hi2vi/styles/`, its README).
 *
 * - One root a page, outermost: the system's classes go on its descendants, never on the root itself
 *   (inside `@scope (.ui)` a bare selector matches descendants only), so a page is
 *   `UiRoot > .page > .app > .app-frame …`, a sign-in screen `UiRoot > …`.
 * - Its scheme is its own `data-scheme`: `light`, or `dark` when the system setting asks for dark. An
 *   inline script sets it before the first paint on a full load; the setting, read as an external store,
 *   keeps it after hydration and on a client navigation (which runs no inline script), and follows a
 *   change of the setting. There is no control.
 *   `scheme="light"` pins light (the sign-in screens, frame:Q4). It never touches the old pages'
 *   `data-md-color-scheme`.
 * - A route under a nonce CSP (the reader's) passes `nonce`, or its first paint is light until hydration.
 */
export type UiScheme = "system" | "light";

const DARK = "(prefers-color-scheme: dark)";
const SCHEME_SCRIPT = `(function(){try{var e=document.currentScript.parentElement;if(window.matchMedia("${DARK}").matches)e.setAttribute("data-scheme","dark")}catch(_){}})();`;

export interface UiRootProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "className"
> {
  scheme?: UiScheme;
  nonce?: string;
  children?: ReactNode;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DARK);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const prefersDark = () => window.matchMedia(DARK).matches;
const serverPrefersDark = () => false;

export function UiRoot({
  scheme = "system",
  nonce,
  children,
  ...rest
}: UiRootProps) {
  const systemDark = useSyncExternalStore(
    subscribe,
    prefersDark,
    serverPrefersDark,
  );
  const dark = scheme === "system" && systemDark;

  return (
    <div
      {...rest}
      className="ui"
      data-scheme={dark ? "dark" : "light"}
      suppressHydrationWarning
    >
      {scheme === "system" && (
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: SCHEME_SCRIPT }}
        />
      )}
      {children}
    </div>
  );
}
