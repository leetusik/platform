import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";

import { WS_STATES } from "@/content/workspace/frame";
import { WS_SLICE } from "@/content/workspace/slice";
import {
  WsItemFailed,
  wsNotFoundState,
  wsSyncLine,
} from "@/hi2vi/workspace/frame";
import {
  SliceMissing,
  SlicePage,
  sliceCommits,
  slicePhaseOf,
} from "@/hi2vi/workspace/slice";
import { segmentId } from "@/hi2vi/workspace/slice/address";
import { loadSliceOnce } from "@/hi2vi/workspace/slice/load";
import { requireIdentity } from "@/lib/auth-guards";
import {
  decodeWorkspaceFrom,
  sliceHref,
  wayBack,
} from "@/lib/workspace/address";
import { dates } from "@/lib/workspace/model";
import { viewerTimeZone } from "@/lib/time-zone";

/**
 * A slice at its own address (`Slice.dc.html`): `/projects/<id>/workspace/slices/<full id>`, in the Shell with
 * the rail's Workspace current. One read, the slice's own route, which carries the Workspace's sync line. The
 * back link reads the phase's id and leads to the phase, carrying the backlog's page on (`?from=`).
 *
 * Not found is drawn here, under the back row; an id that is no project of the active org is the project's Not
 * found; a failed read is the page's own Error under the back row with the sync line (Try again re-fetches), and a
 * render that throws is the route's (`error.tsx`). The tab title is the slice's full id and name, through the
 * site's template, or its id alone when it did not load (the read is shared, `loadSliceOnce`).
 */
type Params = { projectId: string; sliceId: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { projectId, sliceId: segment } = await params;
  const sliceId = segmentId(segment);
  try {
    const { token } = await requireIdentity();
    const load = await loadSliceOnce(token, projectId, sliceId);
    const title =
      load.state === "ready"
        ? [load.slice.full, load.slice.name].filter(Boolean).join(" ")
        : load.state === "not-found"
          ? WS_STATES.notFound.title("slice")
          : sliceId;
    return { title, robots: { index: false } };
  } catch (error) {
    unstable_rethrow(error);
    return { robots: { index: false } };
  }
}

export default async function SliceRoute({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { projectId, sliceId: segment } = await params;
  const sliceId = segmentId(segment);
  const from = decodeWorkspaceFrom((await searchParams).from, projectId);
  const { token } = await requireIdentity();
  const timeZone = viewerTimeZone(await cookies());
  const load = await loadSliceOnce(token, projectId, sliceId);
  if (load.state === "no-project") notFound();
  const phase =
    load.state === "ready" ? load.slice.phase : slicePhaseOf(sliceId);
  const way = wayBack(projectId, { kind: "slice", phase }, from);
  const back = { href: way.href, label: phase };

  // a failed read is the page's own Error, its back row keeping the sync line (F49, F84)
  if (load.state === "error")
    return (
      <WsItemFailed
        back={back}
        backLabel={WS_SLICE.back(back.label)}
        line={
          load.head
            ? wsSyncLine(load.head.sync, load.head.version, { timeZone })
            : null
        }
      />
    );

  if (load.state === "not-found") {
    return (
      <SliceMissing
        back={back}
        line={
          load.head
            ? wsSyncLine(load.head.sync, load.head.version, { timeZone })
            : null
        }
        state={wsNotFoundState("slice", load.project, back)}
      />
    );
  }

  const slice = load.slice;
  const day = dates(timeZone);
  return (
    <SlicePage
      slice={slice}
      commits={sliceCommits(slice)}
      back={back}
      line={wsSyncLine(slice.workspace.sync, slice.workspace.version, {
        timeZone,
      })}
      date={day.date}
      depHref={(full) => sliceHref(projectId, full, way.list)}
    />
  );
}
