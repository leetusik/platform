"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PROJECT_HOME } from "@/content/project";
import { Button } from "@/hi2vi/ui";

import { FeedbackPanel } from "./parts";

/**
 * The Feedback panel when its list or its month's count did not load (D247-4x, the Library panel's
 * shape): the head stays, `Feedback did not load.` and **Try again**. Pressed, three skeleton rows
 * while the route renders again on the server (`router.refresh()`: both are server reads, and the
 * API client is `no-store`); then the list, or this block again on a second failure.
 */
export function FeedbackFailed({ count }: { count: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (pending)
    return <FeedbackPanel count={count} state={{ kind: "loading" }} />;
  return (
    <FeedbackPanel
      count={count}
      state={{
        kind: "failed",
        retry: (
          <Button
            onClick={() => {
              startTransition(() => {
                router.refresh();
              });
            }}
          >
            {PROJECT_HOME.feedback.retry}
          </Button>
        ),
      }}
    />
  );
}
