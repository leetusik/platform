"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The active org's name, given by the Shell to whatever renders in its main column: the shared
 * states' "Back to <org name>" (an `error.tsx` takes no props but `error` and its retry).
 *
 * `AppShell` (a server component) wraps `main.app-main`'s content in the provider with the same name
 * the org switcher shows, so a server-rendered error names the org in its first HTML and never
 * reads the placeholder. Outside the Shell the name is the Shell's own placeholder for a missing
 * org, `—`.
 */
const PLACEHOLDER = "—";

const ShellOrgNameContext = createContext<string>(PLACEHOLDER);

export function ShellOrgNameProvider({
  name,
  children,
}: {
  name: string;
  children?: ReactNode;
}) {
  return (
    <ShellOrgNameContext.Provider value={name || PLACEHOLDER}>
      {children}
    </ShellOrgNameContext.Provider>
  );
}

export function useShellOrgName(): string {
  return useContext(ShellOrgNameContext);
}
