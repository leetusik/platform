"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SIGN_IN_COPY } from "@/content/auth";
import { CONNECT_COPY } from "@/content/connect";

/**
 * The top bar's wordmark (`a.mark.signin-mark`, to `/`). The connect page's reads `sikstack`
 * (job 09, F510: only the text changed); `/login` and `/signup` keep theirs until the rename.
 * A client part, so a move from `/signup` to `/connect` inside the layout updates it.
 */
export function AuthWordmark() {
  const connect = (usePathname() ?? "").startsWith("/connect");
  const copy = connect ? CONNECT_COPY : SIGN_IN_COPY;
  return (
    <Link href="/" className="mark signin-mark" aria-label={copy.wordmarkLabel}>
      {copy.wordmark}
    </Link>
  );
}
