"use client";

import { PublicLibraryLoading } from "../parts";
import { usePublicViewer } from "../viewer";

/**
 * The public library while it loads (`PublicLibrary.dc.html`, Loading): the frame complete, the head's
 * bars, one shelf of six skeleton rows (a state column for a member only). It reads nothing: the viewer
 * is the frame's.
 */
export default function PublicLibraryLoadingPage() {
  return <PublicLibraryLoading viewer={usePublicViewer()} />;
}
