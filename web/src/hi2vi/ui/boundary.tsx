import type { HTMLAttributes } from "react";

/** The attribute that stops the system: put on the wrapper of old content inside a `.ui` root. */
export const LEGACY_BOUNDARY = "data-ui-legacy";

/**
 * The old-page boundary (`src/hi2vi/styles/boundary.css`). Old content (the `kb-*` pages, Tailwind
 * utilities) inside a `.ui` root goes in here: no system rule reaches it, and it inherits what it would
 * inherit as a child of `<body>`. S4's shell wraps the main column's old page in it.
 */
export function Legacy({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} {...{ [LEGACY_BOUNDARY]: "" }}>
      {children}
    </div>
  );
}
