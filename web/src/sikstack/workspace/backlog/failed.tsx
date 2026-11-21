"use client";

import { useRouter } from "next/navigation";

import { BACKLOG } from "@/content/workspace/backlog";
import { useWsRetry } from "@/sikstack/workspace/frame";

import {
  BacklogNowFailed,
  BacklogNowLoading,
  BacklogPhasesLoading,
} from "./parts";

/**
 * The backlog when its read failed (F49): Now keeps its head, `The backlog did not load.` and **Try again**; the
 * Phases part is not drawn. Pressed, the parts load (`router.refresh()`: the read is the server's, `no-store`),
 * then the page, or this block again on a second failure; meanwhile `WsNav`'s sync line is its bar (F40).
 */
export function BacklogFailed() {
  const router = useRouter();
  const [pending, startTransition] = useWsRetry();
  if (pending)
    return (
      <>
        <BacklogNowLoading />
        <BacklogPhasesLoading />
      </>
    );
  return (
    <BacklogNowFailed
      retry={
        <button
          type="button"
          className="btn"
          onClick={() => {
            startTransition(() => {
              router.refresh();
            });
          }}
        >
          {BACKLOG.now.retry}
        </button>
      }
    />
  );
}
