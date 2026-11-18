/**
 * One deferred job's figures (`DeferredJob.dc.html`, frame.md F44, F48), pure so a node test reaches them:
 *
 * - **Promoted to**: the phase the job was promoted to, from the Workspace's phase rows (by full or short id);
 *   none when the job was not promoted or the Workspace holds no such phase (the panel is left out).
 * - **Agenda item**: the item the job belongs to and the state it reads (`itemState`); none when the agenda no
 *   longer holds it.
 * - **Source**: a slice's full id is a link to that slice; any other stored source is its own text.
 * - The rows of other records come from one Workspace read, made only when the job names one of them.
 *
 * Deliberately free of `server-only`.
 */
import { itemState, phaseLookup } from "@/lib/workspace/model";
import type {
  AgendaItem,
  ItemState,
  JobRow,
  PhaseRow,
  Workspace,
} from "@/lib/workspace/types";

/** A slice's full id as the workspace writes one (`P56-t8.S3`, `P57-4q.DECOMP`, `P12.REVIEW`). */
const SLICE_ID = /^P[0-9A-Za-z-]*\.[A-Z]+[0-9]*$/;

/** Whether a stored source is a slice's full id (a link), not prose. */
export function isSliceId(source: string | null | undefined): boolean {
  return typeof source === "string" && SLICE_ID.test(source);
}

/** Whether the job draws a row of another record, so the page reads the Workspace once for it. */
export function needsWorkspace(
  job: Pick<JobRow, "promotedTo" | "agenda">,
): boolean {
  return Boolean(job.promotedTo || job.agenda);
}

/** The phase a job was promoted to, among the Workspace's phases. */
export function promotedPhase(
  job: Pick<JobRow, "promotedTo">,
  phases: readonly PhaseRow[],
): PhaseRow | null {
  if (!job.promotedTo) return null;
  return (
    phases.find((p) => p.id === job.promotedTo) ??
    phases.find((p) => p.short === job.promotedTo) ??
    null
  );
}

/** The agenda item a job belongs to, with the state it reads. */
export function jobItem(
  job: Pick<JobRow, "agenda">,
  ws: Pick<Workspace, "agenda" | "phases">,
): { item: AgendaItem; state: ItemState } | null {
  if (!job.agenda) return null;
  const item = ws.agenda.find((i) => i.id === job.agenda);
  if (!item) return null;
  return { item, state: itemState(item, phaseLookup(ws.phases)) };
}
