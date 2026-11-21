import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { ReaderSegment } from "@/sikstack/reader";
import { requestNonce } from "@/sikstack/shell/data";
import { optionalIdentity } from "@/lib/auth-guards";
import { parseReaderCookie, READER_COOKIE } from "@/lib/reader-cookie";

// P63-fk.S12 — what a document's loading, not found and error screens need to know before (or without) the
// document, on `[chapter]/layout.tsx`'s pattern: who is reading (Not found has a member's and a visitor's
// words), the request's nonce (the reader routes' CSP) and the reader's display settings (Loading keeps the
// reader's scheme and size). The session read is the page's own (`optionalIdentity` is cached per request);
// a failure of it reads as a visitor here and leaves the page's own handling to the page.
async function viewer(): Promise<boolean> {
  try {
    return (await optionalIdentity()) !== null;
  } catch (error) {
    unstable_rethrow(error);
    return false;
  }
}

export default async function DocumentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [member, nonce, jar] = await Promise.all([
    viewer(),
    requestNonce(),
    cookies(),
  ]);
  return (
    <ReaderSegment
      member={member}
      nonce={nonce}
      settings={parseReaderCookie(jar.get(READER_COOKIE)?.value)}
    >
      {children}
    </ReaderSegment>
  );
}
