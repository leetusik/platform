import { cookies } from "next/headers";

import { ReviewLoading } from "@/sikstack/review/route-states";
import { parseReaderCookie, READER_COOKIE } from "@/lib/reader-cookie";

// P64-3y.S7 — Loading in Review's focused frame (job 07 frame.md F221): the bar whole with an empty line,
// the head's counts a skeleton and the card's skeleton, in the reader's Display settings (`kb_reader`).
export default async function ReviewLoadingPage() {
  const settings = parseReaderCookie(
    (await cookies()).get(READER_COOKIE)?.value,
  );
  return <ReviewLoading settings={settings} />;
}
