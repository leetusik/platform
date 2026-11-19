/**
 * hi2vi Library (`03-library` round 02, `PublicLibrary.dc.html`; `## Build` § Page: public-library;
 * frame.md F71, F321, F324) — an org's public library as data: the head (the org's name, the count),
 * one `Shelf` per public project with something to read, each with its foot link by the viewer, and
 * the list's origin every book and document link carries. Pure (no I/O): `load.ts` does the reads.
 *
 * What the address holds decides the state: an org with nothing public to read is **Not found** to a
 * visitor (and to a signed-in reader of another org: the server answers them the same) and **Nothing
 * public** to a member of that org (`listing.member`).
 */
import { LIBRARY_PAGE } from "@/content/library-page";
import type { FormatOptions } from "@/lib/format";
import type { ListOrigin } from "@/lib/library/from";
import { shelvesOf, type ShelfModel } from "@/lib/library/lists";
import type { KbReaderLibrary } from "@/lib/knowledge/reader";
import type { KbOrgLibrary } from "@/lib/knowledge/types";
import { LOGIN_PATH, loginHref } from "@/lib/next-path";
import { projectLibraryHref, publicProjectHref } from "@/lib/reader-href";

/** Who reads the page: signed in (the Shell, their own reading state) or signed out (the bar's frame). */
export type PublicViewer = "member" | "visitor";

/** One project's section and where its foot link goes. */
export interface PublicShelf {
  shelf: ShelfModel;
  /** A member of the org: `/projects/{id}/library`; anyone else: `/@{org}/{project}`. */
  moreHref: string;
}

export type PublicLibraryView =
  | {
      phase: "ready";
      orgName: string;
      /** `1 book, 41 documents`. */
      count: string;
      shelves: PublicShelf[];
      /** This list: carried on every book and document link (F324). */
      from: ListOrigin;
    }
  | { phase: "empty"; orgName: string; count: string };

/** The address's org (without its `@`), or null for an address that is no public library. */
export function publicOrgOf(segment: string): string | null {
  let org = segment;
  try {
    org = decodeURIComponent(segment);
  } catch {
    // a malformed escape: read as typed
  }
  return org.startsWith("@") && org.length > 1 ? org.slice(1) : null;
}

/**
 * Where a visitor's **Sign in** goes from `path` (the request's): sign-in returning to a public address
 * (`/@…`); from any other address (`/nope`, `/graph/{id}`, which hold no library to return to), the bare
 * sign-in.
 */
export function signInFrom(path: string): string {
  return path.startsWith("/@") ? loginHref(path) : LOGIN_PATH;
}

/** The public library's origin: `/@{org}`. */
export function publicOrigin(org: string): ListOrigin {
  return { origin: "public-library", org, place: {} };
}

/**
 * The page's view of `listing` (the org's public projects) at `/@{org}`. `state` is the signed-in
 * reader's own reading state (null for a visitor: no reading state). `ids` maps a project's name to
 * its id when the reader is a member of the org (the foot link to the member's project library).
 * `null` is Not found.
 */
export function publicLibraryView(
  listing: KbOrgLibrary,
  state: KbReaderLibrary | null,
  at: { org: string; ids: ReadonlyMap<string, string> | null },
  format: FormatOptions = {},
): PublicLibraryView | null {
  const lists = shelvesOf(listing, state, { format });
  const orgName = listing.org.name;
  if (lists.shelves.length === 0) {
    return listing.member
      ? { phase: "empty", orgName, count: LIBRARY_PAGE.countLine(0, 0) }
      : null;
  }
  const memberIds = listing.member ? at.ids : null;
  return {
    phase: "ready",
    orgName,
    count: lists.count,
    shelves: lists.shelves.map((shelf) => {
      const id = memberIds?.get(shelf.project);
      return {
        shelf,
        moreHref: id
          ? projectLibraryHref(id)
          : publicProjectHref({ org: at.org, project: shelf.project }),
      };
    }),
    from: publicOrigin(at.org),
  };
}
