"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PROJECT_HOME } from "@/content/project";
import { Button } from "@/hi2vi/ui";

import { LibraryPanel } from "./parts";

/**
 * The Library panel when its list did not load: the head stays, `Documents did not load.` and
 * **Try again**. Pressed, three skeleton rows while the route renders again on the server
 * (`router.refresh()`: the list is a server read, and the API client is `no-store`); then the list,
 * or this block again on a second failure.
 */
export function LibraryFailed({ count }: { count: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (pending)
    return <LibraryPanel count={count} state={{ kind: "loading" }} />;
  return (
    <LibraryPanel
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
            {PROJECT_HOME.library.retry}
          </Button>
        ),
      }}
    />
  );
}
