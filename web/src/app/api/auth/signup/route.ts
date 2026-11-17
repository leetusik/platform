import { handleCredentialRoute } from "@/lib/bff";
import { signup } from "@/lib/knowledge/auth";

// P12.S2 — BFF signup. Calls knowledge's `POST /auth/signup` server-to-server
// (which provisions the user, their tenant, and the owner membership) and seals the
// returned opaque bearer token into the httpOnly cookie, so a fresh signup lands
// authenticated exactly like a login. knowledge answers 201; the BFF normalizes to
// a 200 `{ok:true}` — the client only reads the status + the Set-Cookie. With the
// waitlist on, knowledge answers 202 with no token: the BFF answers `200 {ok:false,
// waitlisted:true}` and sets no cookie (`handleCredentialRoute`).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Looser than login (which is the stricter of the two — see login/route.ts): 10
// signups per IP per 15 minutes. Weak first layer, backed by nginx at the edge (P14).
const SIGNUP_RATE_LIMIT = 10;
const SIGNUP_RATE_WINDOW_MS = 15 * 60_000;

export async function POST(req: Request): Promise<Response> {
  return handleCredentialRoute(req, {
    limit: SIGNUP_RATE_LIMIT,
    windowMs: SIGNUP_RATE_WINDOW_MS,
    bucket: "auth-signup",
    call: signup,
    // 409 = duplicate email; 400 and 422 = backend validation (knowledge's body
    // check answers 422 for a password under 8 characters).
    // Both pass through as a bare status — the client maps them to copy, so
    // knowledge's `detail` text never reaches the browser.
    passThroughStatuses: [409, 400, 422],
  });
}
