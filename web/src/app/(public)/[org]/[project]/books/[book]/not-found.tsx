import { headers } from "next/headers";

import { BookBar } from "@/components/book/book-bar";
import { BookFrame } from "@/components/book/book-frame";
import { bookNotFound } from "@/components/book/book-states";
import { requestNonce } from "@/hi2vi/shell/data";
import { StateBlock } from "@/hi2vi/states";
import { optionalIdentity } from "@/lib/auth-guards";
import { statePlace } from "@/lib/book/place";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";

// Book not found (`Book.dc.html`, presets Not found and Not found, visitor; frame.md F71): a missing book,
// a private book's address and one in another org are the same state, 404 and never 403. Under the Bar,
// F5's block with the page's own words: a member goes back where they came from, a visitor is offered
// Sign in, returning here.
export default async function BookNotFound() {
  const [path, ctx, nonce] = await Promise.all([
    headers().then((h) => h.get(REQUEST_PATH_HEADER) ?? "/"),
    optionalIdentity(),
    requestNonce(),
  ]);
  const place = statePlace(path, !!ctx);
  return (
    <BookFrame
      nonce={nonce}
      state
      bar={
        <BookBar
          back={place.back}
          homeHref={place.homeHref}
          visitor={place.visitor}
          signInHref={place.signInHref}
        />
      }
    >
      <StateBlock
        state={bookNotFound({
          signedIn: !!ctx,
          back: place.back,
          signInHref: place.signInHref,
        })}
      />
    </BookFrame>
  );
}
