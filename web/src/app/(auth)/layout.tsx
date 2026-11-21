import type { Metadata } from "next";
import Link from "next/link";

import { SIGN_IN_COPY } from "@/content/auth";
import { UiRoot } from "@/sikstack/ui";

import { AuthEmailProvider } from "./auth-email";
import "./signin.css";

// `/login`, `/signup` and `/connect` (job 01 *Sign in*, round 03-instrument; job 09 for
// `/connect`, which sits in this frame): the app's light scheme
// (frame:Q4), a top bar holding only the wordmark (the Shell's bar with nobody signed in:
// the account's slot kept, hidden, so the wordmark sits where the Shell has it, F33), and
// `main` with the 26em column the pages render. Deliberately UNGUARDED: the session gate
// lives in the sibling `(app)` group; a signed-in visitor is sent on by each page.
//
// The layout holds the email typed (`AuthEmailProvider`), so moving between the two
// screens carries it without putting it in the URL.
//
// `robots: { index: false, follow: false }` keeps the whole auth subtree out of
// search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UiRoot scheme="light">
      <div className="page">
        <div className="app">
          <header className="top">
            <div className="top-row signin-row">
              <Link
                href="/"
                className="mark signin-mark"
                aria-label={SIGN_IN_COPY.wordmarkLabel}
              >
                {SIGN_IN_COPY.wordmark}
              </Link>
              <div
                className="top-end"
                aria-hidden="true"
                style={{ visibility: "hidden" }}
              >
                <span className="account">
                  <span className="avatar">A</span>
                </span>
              </div>
            </div>
          </header>
          <main id="main-content" className="app-main">
            <AuthEmailProvider>{children}</AuthEmailProvider>
          </main>
        </div>
      </div>
    </UiRoot>
  );
}
