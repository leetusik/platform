import type { ReactNode } from "react";

import { UiRoot } from "@/sikstack/ui";
import type { ReaderSettings } from "@/lib/reader-cookie";

import { DueHead } from "./due-head";
import { Focus } from "./focus";
import { frameScheme } from "./model";
import { CardSkeleton, ReviewFailed } from "./states";

/**
 * The route's own Loading and Error (`app/review/loading.tsx`, `error.tsx`), in the focused frame the page draws
 * (F221): the bar whole with an empty line, then the column. No `"use client"`: the loading file is a server
 * component; the error boundary is a client one and draws `ReviewRouteFailed` there.
 */
function Frame({
  settings,
  loading,
  children,
}: {
  settings: ReaderSettings;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <UiRoot>
      <div className="page">
        <div
          className="app bare focus"
          data-scheme={frameScheme(settings.theme)}
          data-size={settings.size}
          lang="en"
        >
          <Focus progress={0} loading={loading} />
          <main
            className="app-main focus-main"
            id="main-content"
            aria-busy={loading ? "true" : undefined}
          >
            <div className="focus-col">{children}</div>
            <div className="toast-region" role="status" aria-live="polite" />
          </main>
        </div>
      </div>
    </UiRoot>
  );
}

/** Loading: the bar whole, `DueHead loading`, the card's skeleton, `aria-busy`. */
export function ReviewLoading({ settings }: { settings: ReaderSettings }) {
  return (
    <Frame settings={settings} loading>
      <DueHead
        counts={{ due: 0, nw: 0, done: 0 }}
        rows={[]}
        open={false}
        note=""
        saved={null}
        loading
      />
      <CardSkeleton />
    </Frame>
  );
}

/** Failed: the bar whole, `h1` Review alone, then the failure with its reference; Try again re-fetches. */
export function ReviewRouteFailed({
  settings,
  reference,
  onRetry,
}: {
  settings: ReaderSettings;
  reference: string | null;
  onRetry: () => void;
}) {
  return (
    <Frame settings={settings} loading={false}>
      <ReviewFailed reference={reference} onRetry={onRetry} />
    </Frame>
  );
}
