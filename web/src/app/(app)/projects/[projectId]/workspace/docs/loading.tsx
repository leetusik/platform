"use client";

import { useParams } from "next/navigation";

import { DocsList } from "@/sikstack/workspace/docs/list";
import { placeHrefs } from "@/sikstack/workspace/docs/model";
import { WsNav } from "@/sikstack/workspace/frame/nav";
import type { WsSyncLine } from "@/sikstack/workspace/frame/sync-model";

const LOADING: WsSyncLine = { state: "fresh", text: "", cls: "", version: "" };

/**
 * The docs while they load (`Docs.dc.html`, Loading): the Workspace head with its places and the sync line as a
 * bar; panel **Docs** keeps its head (no count) and its column heads over five skeleton rows; no Retired panel.
 */
export default function WorkspaceDocsLoading() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="column">
      <WsNav
        current="docs"
        line={LOADING}
        hrefs={placeHrefs(projectId)}
        loading
      />
      <DocsList state={{ kind: "loading" }} />
    </div>
  );
}
