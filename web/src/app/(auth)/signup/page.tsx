import type { Metadata } from "next";

import { SIGN_IN_COPY } from "@/content/auth";
import { redirectIfAuthenticated } from "@/lib/auth-guards";
import { safeNextPath } from "@/lib/next-path";

import { SignInForm } from "../sign-in-form";

// /signup, the screen Create account (job 01). Same shape as /login: send an
// already-signed-in visitor on, otherwise render the form. Dynamic (reads the cookie).
//
// P30.S11 (D18) — sign-up is a sign-in success path too: a visitor sent to /login with
// a return address who follows "Create account" keeps it (the link carries `?next=`),
// and lands there once the account exists. Laundered once here, exactly like /login.
// With the waitlist on, a new account has no session: the form shows the waitlist state.
export const metadata: Metadata = {
  title: SIGN_IN_COPY.screens["sign-up"].title,
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  await redirectIfAuthenticated(next);

  return <SignInForm screen="sign-up" next={next} />;
}
