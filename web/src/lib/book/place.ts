/**
 * Where the book page's states (loading, Book not found, Error) send the reader, from the address alone:
 * they have no book read to name the list by. The way back is the list in `?from=` (F324) when it is the
 * book's own by its address (`/@{org}/{project}/…`, P63-fk.F4), else, for a visitor, the org's public
 * library taken from the address, else the Library; its label is the address's slug, never `from`'s text.
 * Pure, and free of `next/headers`: the server states pass the request's path, the error boundary the
 * browser's.
 */
import {
  decodeFrom,
  itemWayBack,
  LIBRARY_ORIGIN,
  wayBack,
} from "@/lib/library/from";
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
  const at = url ? /^\/@([^/]+)(?:\/([^/]+))?/.exec(url.pathname) : null;
  const org = at?.[1] ? decoded(at[1]) : null;
  const project = at?.[2] ? decoded(at[2]) : null;
  const way = itemWayBack(from ? decodeFrom(from) : null, {
    member: signedIn,
    orgs: [org],
    project,
  });
  const back = way
    ? { href: way.href, label: way.label }
    : wayBack(LIBRARY_ORIGIN);
  return {
    back,
    homeHref: signedIn || !org ? LIBRARY_HREF : publicLibraryHref(org),
    signInHref: loginHref(url ? `${url.pathname}${url.search}` : "/"),
    visitor: !signedIn,
  };
}

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
