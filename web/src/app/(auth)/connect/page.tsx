import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { CONNECT_COPY } from "@/content/connect";
import { expiredView, shownCode, viewFromServer } from "@/lib/connect/model";
import { edgeAddress, readConnect } from "@/lib/knowledge/connect";
import { getSession } from "@/lib/session";
import { viewerTimeZone } from "@/lib/time-zone";

import "../connect.css";
import { ConnectColumn } from "./connect-column";

// `/connect?code=…` (job 09 *Install and connect*, round 01, `Connect.dc.html`): the page
// `/sikstack:sign-in` opens from Claude Code. It sits in the `(auth)` frame (light scheme, the
// wordmark bar) as one `.signin-col`. Server component: it reads the code's state for this
// session from the API (`GET /app/connect/{code}`, with the session's token when there is one,
// and the visitor's address for the API's per-address limit on signed-out reads) and hands the
// column its first state; the column holds the rest (connecting, the answer, the waitlist).
// A code the API does not know, or no code, is "This code no longer works". Unguarded, like
// `/login`: signed out it shows the install and the way to sign in.
export const metadata: Metadata = {
  title: CONNECT_COPY.pageTitle,
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const code = shownCode((await searchParams).code);
  let view = expiredView(code);
  if (code) {
    const read = await readConnect(code, await getSession(), edgeAddress(await headers()));
    if (read.ok) {
      view = viewFromServer(read.body, code, { timeZone: viewerTimeZone(await cookies()) });
    } else if (read.status !== 404) {
      // A refused read (the per-address limit, the API down) is not a state the page draws:
      // the app's error boundary says it, with its way to try again.
      throw new Error(`the connect read answered ${read.status}`);
    }
  }
  return <ConnectColumn initial={view} />;
}
