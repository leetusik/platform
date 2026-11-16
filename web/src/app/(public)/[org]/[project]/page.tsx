import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PROJECT_LIBRARY } from "@/content/project-library";
import { HI2VI_STATES } from "@/content/hi2vi-states";
import { requestNonce } from "@/hi2vi/shell/data";
import { optionalIdentity } from "@/lib/auth-guards";
import type { FormatOptions } from "@/lib/format";
import { readProjectPlace } from "@/lib/library/list-place";
import { loginHref } from "@/lib/next-path";
import { loadPublicProjectOnce } from "@/lib/project-library/load";
import {
  projectLibraryView,
  VISITOR_SOURCE,
} from "@/lib/project-library/model";
import { publicLibraryHref, publicProjectHref } from "@/lib/reader-href";
import { viewerTimeZone } from "@/lib/time-zone";

import {
  ProjectHead,
  ProjectParts,
  PublicProjectFrame,
} from "@/app/(app)/projects/[projectId]/library/parts";

/**
 * A public project's library, a visitor's (`ProjectLibrary.dc.html`, the visitor; frame.md F52, F321):
 * `/@{org}/{project}` in the bar's frame. The head (no way back of its own: the Bar's is the org's
 * public library), Books, Documents (no search, no Delete, no reading state), or Nothing to read. The
 * page is the address's (`?page=…`); every book and document opened here carries this list on (F324).
 *
 * The record draws this address for a visitor only: anyone, signed in or not, reads the visitor's page
 * here (a signed-in reader without Sign in). A private project, an unknown project and an unknown org
 * are one miss, Project not found (`notFound()`). An address without the `@` is no public address:
 * the guard rejects it before any read. The static `(public)/[org]/graph` segment wins over a project
 * named `graph` (its own route, a redirect to the org's library).
 */
type Params = { org: string; project: string };
type Search = Record<string, string | string[] | undefined>;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The address's org (without its `@`) and project; `notFound()` for anything else. */
function addressOf(params: Params): { org: string; project: string } {
  const org = safeDecode(params.org);
  const project = safeDecode(params.project);
  // THE GUARD: our public namespace is `@`-prefixed. Reject before reading the session or upstream.
  if (!org.startsWith("@") || org.length < 2 || project === "") notFound();
  return { org: org.slice(1), project };
}

async function readOnce(params: Params) {
  const at = addressOf(params);
  const ctx = await optionalIdentity();
  const read = await loadPublicProjectOnce(ctx?.token, at.org, at.project);
  if (!read) notFound();
  return { at, read, signedIn: !!ctx };
}

/** `notFound()`'s throw: Next marks it with this digest. */
const isNotFound = (error: unknown) =>
  typeof (error as { digest?: unknown })?.digest === "string" &&
  (error as { digest: string }).digest.startsWith(
    "NEXT_HTTP_ERROR_FALLBACK;404",
  );

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  try {
    const { read } = await readOnce(await params);
    return { title: read.project };
  } catch (error) {
    // the page renders the miss or the failure itself
    return {
      title: isNotFound(error)
        ? PROJECT_LIBRARY.notFound.title
        : HI2VI_STATES.error.title,
    };
  }
}

export default async function PublicProjectPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { at, read, signedIn } = await readOnce(await params);
  const place = readProjectPlace(await searchParams);
  const [jar, nonce] = await Promise.all([cookies(), requestNonce()]);
  const format: FormatOptions = { timeZone: viewerTimeZone(jar) };
  const view = projectLibraryView(
    read.listing,
    null,
    read.project,
    { viewer: "visitor", org: at.org },
    place,
    VISITOR_SOURCE,
    format,
  );
  const here = publicProjectHref(
    { org: at.org, project: read.project },
    { page: view.docs.page },
  );
  return (
    <PublicProjectFrame
      nonce={nonce}
      back={{ href: publicLibraryHref(at.org), label: read.orgName }}
      signInHref={signedIn ? undefined : loginHref(here)}
    >
      <div className="column">
        <ProjectHead view={view} viewer="visitor" />
        <ProjectParts view={view} />
      </div>
    </PublicProjectFrame>
  );
}
