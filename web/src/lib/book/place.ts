/**
 * Where the book page's states (loading, Book not found, Error) send the reader, from the address alone:
 * they have no book read to name the list by. The way back is the list in `?from=` (F324), else, for a
 * visitor, the org's public library taken from the address (`/@{org}/…`), else the Library. Pure, and free
 * of `next/headers`: the server states pass the request's path, the error boundary the browser's.
 */
import { decodeFrom, wayBack } from "@/lib/library/from";
import { loginHref } from "@/lib/next-path";
import { LIBRARY_HREF, publicLibraryHref } from "@/lib/reader-href";

export interface StatePlace {
  back: { href: string; label: string };
  homeHref: string;
  signInHref: string;
  visitor: boolean;
}

export function statePlace(path: string, signedIn: boolean): StatePlace {
  let url: URL | null = null;
  try {
    url = new URL(path.startsWith("/") ? path : "/", "https://book.invalid");
  } catch {
    url = null;
  }
  const from = url?.searchParams.get("from") ?? "";
  const seg = url ? /^\/@([^/]+)/.exec(url.pathname)?.[1] : undefined;
  let org: string | null = null;
  if (seg) {
    try {
      org = decodeURIComponent(seg);
    } catch {
      org = null;
    }
  }
  const back =
    !from && !signedIn && org
      ? wayBack({ origin: "public-library", org, place: {} })
      : wayBack(decodeFrom(from));
  return {
    back,
    homeHref: signedIn || !org ? LIBRARY_HREF : publicLibraryHref(org),
    signInHref: loginHref(url ? `${url.pathname}${url.search}` : "/"),
    visitor: !signedIn,
  };
}
