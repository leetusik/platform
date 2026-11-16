"use client";

import { useSyncExternalStore } from "react";

/**
 * The active org's name as the Shell shows it, for the error boundary's "Back to <org name>".
 *
 * An `error.tsx` takes no props but `error` and its retry, and the Shell exposes no context, so the name
 * is read from the Shell's own org switcher label (`.top .crumbs .switch-label`, the first one: the
 * org's; the project switcher comes after it). The Shell is never replaced by the boundary, so the
 * label is there whenever this block is. Before hydration (a server-rendered error) there is no DOM to
 * read, and the name is the Shell's own placeholder for a missing org, `—`.
 */
const SELECTOR = ".app-frame > .top .crumbs .switch-label";
const PLACEHOLDER = "—";

function subscribe(): () => void {
  return () => {};
}

function readOrgName(): string {
  const label = document.querySelector(SELECTOR)?.textContent?.trim();
  return label ? label : PLACEHOLDER;
}

const serverOrgName = () => PLACEHOLDER;

export function useShellOrgName(): string {
  return useSyncExternalStore(subscribe, readOrgName, serverOrgName);
}
