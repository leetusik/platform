/**
 * The deferred jobs pages' reads (frame.md F47): the list reads the Workspace once; a job reads its own route,
 * then the Workspace once only when it draws a row of another record (the phase it was promoted to, the agenda
 * item it belongs to). Each answers the read's own state; a 401 is thrown by the read.
 */
import "server-only";

import {
  readJob,
  readWorkspace,
  type Read,
  type WorkspaceRead,
} from "@/lib/workspace/read";
import type { Job, WithHead } from "@/lib/workspace/types";

import { needsWorkspace } from "./job-model";

/** The list: the Workspace's lists, its deferred jobs among them. */
export function loadDeferredList(
  token: string,
  project: string,
): Promise<WorkspaceRead> {
  return readWorkspace(token, project);
}

export interface JobLoad {
  job: Read<WithHead<Job>>;
  /** The Workspace, read only for the job's rows of other records; null when not read. */
  workspace: WorkspaceRead | null;
}

/** One job, and the Workspace when its page draws a phase's or an item's row. */
export async function loadJob(
  token: string,
  project: string,
  job: string,
): Promise<JobLoad> {
  const read = await readJob(token, project, job);
  if (read.state !== "ready" || !needsWorkspace(read.value))
    return { job: read, workspace: null };
  return { job: read, workspace: await readWorkspace(token, project) };
}
