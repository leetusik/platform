import { headers } from "next/headers";

import { BookBar } from "@/components/book/book-bar";
import { BookFrame } from "@/components/book/book-frame";
import { BookLoading } from "@/components/book/book-states";
import { requestNonce } from "@/hi2vi/shell/data";
import { statePlace } from "@/lib/book/place";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";
import { getSession } from "@/lib/session";

// The book page while it loads (`Book.dc.html`, preset Loading): the Bar complete, the skeleton in the
// page's own elements. It reads no book: the way back comes from the address (`?from=`, else the Library,
// or a visitor's public library), and a session cookie is enough to tell a visitor.
export default async function BookLoadingRoute() {
  const [path, session, nonce] = await Promise.all([
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
    getSession(),
    requestNonce(),
  ]);
  const place = statePlace(path, !!session);
  return (
    <BookFrame
      nonce={nonce}
      bar={
        <BookBar
          back={place.back}
          homeHref={place.homeHref}
          visitor={place.visitor}
          signInHref={place.signInHref}
        />
      }
    >
      <BookLoading />
    </BookFrame>
  );
}
