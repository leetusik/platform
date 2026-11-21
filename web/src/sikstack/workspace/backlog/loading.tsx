"use client";

import { useParams } from "next/navigation";

import {
  agendaHref,
  backlogHref,
  deferredHref,
  docsHref,
} from "@/lib/workspace/address";

import { WsNav } from "../frame/nav";

import { BacklogNowLoading, BacklogPhasesLoading } from "./parts";

const NO_LINE = { state: "fresh", text: "", cls: "", version: "" } as const;

/**
 * The backlog while it loads (F49, `Backlog.dc.html` Loading): `WsNav` stands with the sync line as a bar, Now
 * and Phases keep their heads and labels and hold skeletons. It reads nothing; the project comes from the
 * address, for the four places' links.
 */
export function BacklogLoading() {
  const params = useParams<{ projectId: string }>();
  const project = params?.projectId ?? "";
  return (
    <div className="column">
      <WsNav
        current="backlog"
        line={NO_LINE}
        loading
        hrefs={{
          agenda: agendaHref(project),
          backlog: backlogHref(project),
          deferred: deferredHref(project),
          docs: docsHref(project),
        }}
      />
      <BacklogNowLoading />
      <BacklogPhasesLoading />
    </div>
  );
}
