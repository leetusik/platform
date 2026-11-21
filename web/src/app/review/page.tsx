import type { Metadata } from "next";
import { cookies } from "next/headers";

import { REVIEW } from "@/content/review";
import { ReviewFrame } from "@/sikstack/review";
import { accountOf } from "@/sikstack/review/saved-line";
import { requireIdentity } from "@/lib/auth-guards";
import { parseReaderCookie, READER_COOKIE } from "@/lib/reader-cookie";
import { loadReviewContinue, loadReviewQueue } from "@/lib/review/actions";
import { endKind } from "@/lib/review/model";

// P30.S24 — `/review`: the signed-in reader's spaced-review queue; since P64-3y.S7 in Review's focused frame
// (job 07-listen-review, round 01, frame.md F201: `ReviewFrame`), in the reader's family, outside the Shell.
// Signed in only (`require_user`): a signed-out visitor is redirected to `/login?next=/review` BEFORE any
// review data is read or rendered (`layout.tsx` guards the segment above its loading shell; the page asks
// again, which is cached), and review state is private: noindex, never shared.
//
// The first queue is read here, so the first paint already holds the cards; the island rates,
// suspends and re-reads through server actions. A fault reading it is the designed "failed"
// state inside the frame (Try again re-reads), not the segment's error boundary.
export const metadata: Metadata = {
  title: REVIEW.metaTitle,
  robots: { index: false, follow: false },
};

export default async function ReviewPage() {
  const { identity } = await requireIdentity();
  const settings = parseReaderCookie(
    (await cookies()).get(READER_COOKIE)?.value,
  );
  const initial = await loadReviewQueue();
  const kind = initial.ok
    ? endKind({
        cards: initial.data.cards.length,
        counts: initial.data.counts,
        limit_reached: initial.data.limit_reached,
        profile: initial.data.profile,
        next_due_at: initial.data.next_due_at,
      })
    : null;
  // The end states offer Continue reading; read it now when the page opens on one.
  const next =
    kind !== null && kind !== "card" && kind !== "empty"
      ? await loadReviewContinue()
      : null;
  return (
    <ReviewFrame
      initial={initial}
      settings={settings}
      initialNext={next}
      account={accountOf(identity)}
    />
  );
}
