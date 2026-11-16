"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { BookBar } from "@/components/book/book-bar";
import { BookFrame } from "@/components/book/book-frame";
import { bookError } from "@/components/book/book-states";
import {
  boundaryRetry,
  StateBlock,
  type BoundaryRetryProps,
} from "@/hi2vi/states";
import { statePlace } from "@/lib/book/place";

// Error (`Book.dc.html`, preset Error; F5's whole): under the Bar, This page did not load, Try again
// (primary: it fetches the page again, `boundaryRetry`), the way back, and the reference. The boundary
// renders on the client and knows no session: the bar reads as a member's, and the way back is the list
// in `?from=`, else the Library.
export default function BookError({
  error,
  ...retry
}: BoundaryRetryProps & { error: Error & { digest?: string } }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const place = statePlace(`${pathname}${query ? `?${query}` : ""}`, true);
  return (
    <BookFrame
      state
      bar={<BookBar back={place.back} homeHref={place.homeHref} />}
    >
      <StateBlock
        state={bookError({ back: place.back, digest: error.digest })}
        onRetry={boundaryRetry(retry)}
      />
    </BookFrame>
  );
}
