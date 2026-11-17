import type { Metadata } from "next";

import { SIGN_IN_COPY } from "@/content/auth";
import { redirectIfAuthenticated } from "@/lib/auth-guards";
import { safeNextPath } from "@/lib/next-path";

import { SignInForm } from "../sign-in-form";

// /login, the screen Sign in (job 01). Server component: an already-signed-in visitor
// is sent on (to org home, or to `?next=` when one survives the guard — verified
// against knowledge, see `redirectIfAuthenticated`); everyone else gets the form.
// Reading the session cookie makes this route dynamic, so it is never prerendered.
//
// P28.S5 (D18) — `?next=` is the return address a public surface attaches when it
// sends an anonymous visitor here. It is laundered ONCE, at this boundary, by
// `safeNextPath`, which accepts same-origin relative paths only and fails closed to
// org home (`/dashboard`); the already-safe value reaches both the bounce and the form.
export const metadata: Metadata = {
  title: SIGN_IN_COPY.screens["sign-in"].title,
};

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: search params arrive as a Promise, and a repeated key is a `string[]`
  // — which `safeNextPath` rejects outright rather than picking one of.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  await redirectIfAuthenticated(next);

  return <SignInForm screen="sign-in" next={next} />;
}
