import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { cache, Suspense } from "react";

import { WS_PLACES, WS_STATES } from "@/content/workspace/frame";
import {
  DocBackRow,
  DocLoading,
  DocPage,
  DocStateBlock,
  docView,
} from "@/hi2vi/workspace/docs";
import { DocTop } from "@/hi2vi/workspace/docs/top";
import { wsFailedTitle } from "@/hi2vi/workspace/frame/failed-model";
import { WsItemFailed } from "@/hi2vi/workspace/frame/failed";
import {
  wsNotFoundState,
  type WsBack,
} from "@/hi2vi/workspace/frame/states-model";
import {
  wsSyncLine,
  type WsSyncLine,
} from "@/hi2vi/workspace/frame/sync-model";
import { requireIdentity } from "@/lib/auth-guards";
import { getProject } from "@/lib/knowledge/app";
import { ApiError } from "@/lib/knowledge/client";
import { viewerTimeZone } from "@/lib/time-zone";
import {
  decodeWorkspaceFrom,
  docsHref,
  wayBack,
  type WorkspaceList,
} from "@/lib/workspace/address";
import { dates } from "@/lib/workspace/model";
import { readDoc, readWorkspace, type Read } from "@/lib/workspace/read";
import type { Doc, WithHead } from "@/lib/workspace/types";

/**
 * One doc (`Docs.dc.html`; F35, F84, F85): `…/workspace/docs/<doc>`, or an earlier version of it at
 * `?version=<stored id>`. A doc is one read, `GET …/workspace/docs/<doc>`, its sync line included. An earlier
 * version reads the doc at that version (its text) and at its latest (the current version the notice names, and
 * the earlier version's own summary, which only the latest's list of versions carries), the two at once.
 *
 * A doc the workspace does not hold, or a version it does not hold, is **Doc not found**; a read that failed is
 * F49's error. Both sit under the back row, which keeps the sync line: on those paths alone the page reads the
 * Workspace (its sync facts) and the project (its name, for the sentence). A project that is not the org's is
 * the route's Not found. Each page's reads are `cache`d, so its tab title costs none.
 *
 * The doc's body sits in a boundary keyed on the version it shows: opening an earlier version (or going back to
 * the latest) changes only the search, so without it the old view would stay up for the whole read. Under a new
 * key the page draws the Doc loading form at once (its way back reads **Docs**: the doc's title is not known
 * before the read) and lands at the page's top (`DocTop`).
 */
type Params = { projectId: string; doc: string };
type Search = Record<string, string | string[] | undefined>;

const readDocOnce = cache(
  (token: string, project: string, doc: string, version: string | null) =>
    readDoc(token, project, doc, version),
);

function versionOf(search: Search): string | null {
  const v = search.version;
  return typeof v === "string" && v.length > 0 ? v : null;
}

type Loaded =
  | { state: "ready"; latest: WithHead<Doc>; shown: WithHead<Doc> }
  | { state: "not-found" }
  | { state: "error" };

/** The doc, and the version the address names; a version that is the latest is the doc itself. */
async function load(
  token: string,
  project: string,
  doc: string,
  version: string | null,
): Promise<Loaded> {
  const [latest, shown]: Read<WithHead<Doc>>[] = await Promise.all(
    version === null
      ? [readDocOnce(token, project, doc, null)]
      : [
          readDocOnce(token, project, doc, null),
          readDocOnce(token, project, doc, version),
        ],
  );
  const reads = shown ? [latest, shown] : [latest];
  if (reads.some((r) => r.state === "not-found")) return { state: "not-found" };
  if (latest.state !== "ready" || (shown && shown.state !== "ready"))
    return { state: "error" };
  return {
    state: "ready",
    latest: latest.value,
    shown: shown && shown.state === "ready" ? shown.value : latest.value,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const { projectId, doc } = await params;
  try {
    const { token } = await requireIdentity();
    const loaded = await load(
      token,
      projectId,
      doc,
      versionOf(await searchParams),
    );
    if (loaded.state === "not-found")
      return { title: WS_STATES.notFound.title("doc") };
    if (loaded.state === "error") return { title: wsFailedTitle(doc) };
    const { latest, shown } = loaded;
    return {
      title:
        shown.version !== latest.version
          ? docView(projectId, latest, shown, dates("UTC")).heading
          : latest.title,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {};
  }
}

/** On a page that drew no doc: the Workspace's sync facts and the project's name, read at once. */
async function around(
  token: string,
  project: string,
  zone: string,
): Promise<{ line: WsSyncLine | null; name: string }> {
  const [ws, name] = await Promise.all([
    readWorkspace(token, project),
    getProject(token, project).then(
      (p) => p.name,
      (error: unknown) => {
        if (
          error instanceof ApiError &&
          (error.status === 404 || error.status === 400)
        )
          notFound();
        if (error instanceof ApiError && error.status === 401) throw error;
        return project;
      },
    ),
  ]);
  if (ws.state === "not-found") notFound();
  const head =
    ws.state === "ready"
      ? { version: ws.value.version, sync: ws.value.sync }
      : ws.state === "error"
        ? null
        : ws.head;
  return {
    line: head ? wsSyncLine(head.sync, head.version, { timeZone: zone }) : null,
    name,
  };
}

export default async function WorkspaceDocPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { projectId, doc } = await params;
  const search = await searchParams;
  const version = versionOf(search);
  const from: WorkspaceList | null = decodeWorkspaceFrom(
    search.from,
    projectId,
  );
  return (
    <Suspense
      key={version ?? ""}
      fallback={
        <div className="column">
          <DocTop />
          <DocLoading
            back={{ href: docsHref(projectId), label: WS_PLACES.docs }}
          />
        </div>
      }
    >
      <DocBody projectId={projectId} doc={doc} version={version} from={from} />
    </Suspense>
  );
}

/** The doc at the version the address names, read inside the page's keyed boundary. */
async function DocBody({
  projectId,
  doc,
  version,
  from,
}: {
  projectId: string;
  doc: string;
  version: string | null;
  from: WorkspaceList | null;
}) {
  const { token } = await requireIdentity();
  const zone = viewerTimeZone(await cookies());
  const loaded = await load(token, projectId, doc, version);

  if (loaded.state !== "ready") {
    const way = wayBack(projectId, { kind: "doc" }, from);
    const back: WsBack = { href: way.href, label: WS_PLACES.docs };
    const { line, name } = await around(token, projectId, zone);
    if (loaded.state === "error")
      return (
        <WsItemFailed
          back={back}
          backLabel={WS_STATES.back(back.label)}
          line={line}
        />
      );
    const state = wsNotFoundState("doc", name, back);
    return (
      <div className="column">
        <header className="page-top">
          <DocBackRow
            back={back}
            ariaLabel={WS_STATES.back(back.label)}
            line={line}
          />
        </header>
        <DocStateBlock state={state} />
      </div>
    );
  }

  const { latest, shown } = loaded;
  const earlier = shown.version !== latest.version;
  const way = wayBack(
    projectId,
    earlier ? { kind: "doc-version", doc: latest.id } : { kind: "doc" },
    from,
  );
  const back: WsBack = {
    href: way.href,
    label: way.to === "doc" ? latest.title : WS_PLACES.docs,
  };
  const view = docView(projectId, latest, shown, dates(zone), way.list);
  return (
    <div className="column">
      <DocPage
        view={view}
        back={back}
        line={wsSyncLine(shown.workspace.sync, shown.workspace.version, {
          timeZone: zone,
        })}
      />
    </div>
  );
}
