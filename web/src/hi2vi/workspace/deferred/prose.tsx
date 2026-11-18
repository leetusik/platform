import type { ReactNode } from "react";

import { WsProse } from "@/hi2vi/workspace/frame/prose";
import type { JobRow } from "@/lib/workspace/types";

/** Each job's trigger as the server draws it, by job id. */
export type JobTriggers = Readonly<Record<string, ReactNode>>;

/**
 * The Deferred jobs list's triggers drawn as the Markdown they are (`WsProse`, inline: frame.md F46, F80), for the
 * client list that cannot carry the Markdown renderer. A job with no trigger has no entry.
 */
export function jobTriggers(
  jobs: readonly Pick<JobRow, "id" | "trigger">[],
): JobTriggers {
  const out: Record<string, ReactNode> = {};
  for (const job of jobs)
    if (job.trigger) out[job.id] = <WsProse text={job.trigger} />;
  return out;
}
