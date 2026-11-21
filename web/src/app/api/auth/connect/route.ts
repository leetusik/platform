import { z } from "zod";

import { json } from "@/lib/bff";
import { approveConnect, declineConnect } from "@/lib/knowledge/connect";
import { ApiError } from "@/lib/knowledge/client";
import {
  asOrgId,
  assertSameOrigin,
  openSession,
  ORG_COOKIE,
  orgCookieOptions,
  readSessionCookie,
} from "@/lib/session";

// The connect page's two writes (job 09, `/connect?code=…`): Connect (`approve`) and Don't
// connect (`decline`), relayed to the API's `POST /app/connect/{code}/approve|decline`
// (`server/installs_api.py`) with the session's token, which never reaches the browser. Under
// `/api/auth/` because the edge sends only that part of `/api/` to the web app.
//
// The ordered checks, cheapest first: JSON only (415), same origin (403), a session (401), the
// body's shape (422). The API's meaningful statuses pass through bare, so the page maps them
// (410 the code no longer works, 403 another account owns the install, 401 signed out, 400 a
// bad org); anything else is a 502. Approve answers `{ok, project: {id, name}}` and makes the
// org it connected in the active one, so the way on (the project's Workspace) opens there.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  code: z.string().min(1).max(40),
  action: z.enum(["approve", "decline"]),
  orgId: z.string().max(64).nullable().optional(),
});

const PASS_THROUGH = [400, 401, 403, 410];

export async function POST(req: Request): Promise<Response> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return json(415, { ok: false });
  }
  if (!assertSameOrigin(req)) {
    return json(403, { ok: false });
  }
  const token = openSession(readSessionCookie(req));
  if (!token) return json(401, { ok: false });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json(422, { ok: false });
  const { code, action } = parsed.data;
  const orgId = parsed.data.orgId ? asOrgId(parsed.data.orgId) : null;
  if (parsed.data.orgId && !orgId) return json(422, { ok: false });

  try {
    if (action === "decline") {
      await declineConnect(token, code);
      return json(200, { ok: true });
    }
    const approval = await approveConnect(token, code, orgId);
    const res = json(200, {
      ok: true,
      project: { id: approval.project.id, name: approval.project.name },
    });
    const connectedOrg = asOrgId(approval.org_id);
    if (connectedOrg) res.cookies.set(ORG_COOKIE, connectedOrg, orgCookieOptions());
    return res;
  } catch (error) {
    if (error instanceof ApiError) {
      return json(PASS_THROUGH.includes(error.status) ? error.status : 502, {
        ok: false,
      });
    }
    return json(500, { ok: false });
  }
}
