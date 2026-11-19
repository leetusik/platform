/**
 * Where a public project's states (loading, Project not found, Error) send the reader, from the address
 * alone: they have no read to name the org by. The Bar's way back is the org's public library, named by
 * the address's org (`/@{org}/…`) until its name is read; an address with no org goes to the Library.
 * Pure: the server states pass the request's path, the error boundary the browser's.
 */
import { LIBRARY_ORIGIN, wayBack } from "@/lib/library/from";

export function publicBack(path: string): { href: string; label: string } {
  const seg = /^\/@([^/?#]+)/.exec(path)?.[1];
  let org: string | null = null;
  if (seg) {
    try {
      org = decodeURIComponent(seg);
    } catch {
      org = null;
    }
  }
  return org
    ? wayBack({ origin: "public-library", org, place: {} })
    : wayBack(LIBRARY_ORIGIN);
}
