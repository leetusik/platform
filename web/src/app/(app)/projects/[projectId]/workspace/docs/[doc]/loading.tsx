"use client";

import { useParams } from "next/navigation";

import { WS_PLACES } from "@/content/workspace/frame";
import { DocLoading } from "@/sikstack/workspace/docs/head";
import { docsHref } from "@/lib/workspace/address";

/**
 * A doc while it loads (`Docs.dc.html`, Doc loading): the back link **Docs** with the sync line as a bar, the title a
 * bar, the three facts with bars for values, panel **Text** with six bars.
 */
export default function WorkspaceDocLoading() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="column">
      <DocLoading back={{ href: docsHref(projectId), label: WS_PLACES.docs }} />
    </div>
  );
}
