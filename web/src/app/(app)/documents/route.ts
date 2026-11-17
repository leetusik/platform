import { NextResponse } from "next/server";

import { listProjects } from "@/lib/knowledge/app";
import { loginHref } from "@/lib/next-path";
import { openSession, readSessionCookie } from "@/lib/session";

import { documentsRedirect, readOldList } from "./legacy";

/**
 * P63 (operator decision 4) — `/documents`, the old flat list, retired into the Library: a 307 to
 * All documents with the same search and project (`legacy.ts`), answered by this handler before any
 * page renders. The project's name is the one read, and only when the old address names a project:
 *
 * - no `project`: straight to `/library?view=all…`; a signed-out reader is sent to sign in by the
 *   Library's own guard and comes back to that address;
 * - a `project` and no session: to sign in, and back to this address, which then resolves it;
 * - a `project` and a session: the reader's projects give its name; an unknown id, or a read that
 *   fails, leaves the filter off (the Library's own reads say the rest).
 *
 * Every `Location` is relative (behind the edge `req.url` may carry the internal host; the org
 * switch route does the same).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function temporary(location: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const old = readOldList(url.searchParams);
  if (!old.project) return temporary(documentsRedirect(old, null));

  const token = openSession(readSessionCookie(req));
  if (!token) return temporary(loginHref(`${url.pathname}${url.search}`));

  let name: string | null = null;
  try {
    const projects = await listProjects(token);
    name = projects.find((p) => p.id === old.project)?.name ?? null;
  } catch {
    name = null;
  }
  return temporary(documentsRedirect(old, name));
}
