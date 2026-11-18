import "server-only";

import { cache } from "react";

import { listProjects } from "@/lib/knowledge/app";
import { readSlice, readWorkspace } from "@/lib/workspace/read";
import type { Slice, WithHead, WorkspaceHead } from "@/lib/workspace/types";

/**
 * What a slice's page reads (one read when the slice is there): the slice's own route, which carries the
 * Workspace's sync facts. Only when the slice is not found does the page read more, for what its Not found
 * says: the project's name (`… isn’t part of platform.`) and the sync line of its back row, which a 404 does
 * not carry. Cached per request, so the tab title and the page share the read.
 */
export type SliceLoad =
  | { state: "ready"; slice: WithHead<Slice> }
  | { state: "not-found"; project: string; head: WorkspaceHead | null }
  /** The project is no project of the active org: the project's own Not found. */
  | { state: "no-project" }
  | { state: "error" };

async function load(
  token: string,
  project: string,
  full: string,
): Promise<SliceLoad> {
  const read = await readSlice(token, project, full);
  if (read.state === "ready") return { state: "ready", slice: read.value };
  if (read.state === "error") return { state: "error" };
  const [projects, ws] = await Promise.all([
    listProjects(token).catch(() => null),
    readWorkspace(token, project),
  ]);
  if (projects === null) return { state: "error" };
  const named = projects.find((p) => p.id === project);
  if (!named) return { state: "no-project" };
  const head =
    ws.state === "ready"
      ? { version: ws.value.version, sync: ws.value.sync }
      : ws.state === "unlinked" || ws.state === "never"
        ? ws.head
        : null;
  return { state: "not-found", project: named.name, head };
}

export const loadSliceOnce = cache(load);
