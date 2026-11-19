"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PublicViewer } from "@/lib/public-library/model";

/**
 * Who reads the public library, as its frame decided (the layout: the Shell for a signed-in reader, the
 * bar's frame for a visitor), for the states that take no props of their own: Loading draws a state
 * column for a member only, and Error offers a member **Back to Library**.
 */
const ViewerContext = createContext<PublicViewer>("visitor");

export function PublicViewerProvider({
  viewer,
  children,
}: {
  viewer: PublicViewer;
  children?: ReactNode;
}) {
  return (
    <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
  );
}

export function usePublicViewer(): PublicViewer {
  return useContext(ViewerContext);
}
