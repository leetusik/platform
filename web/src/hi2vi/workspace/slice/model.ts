import { WS_GLOSSARY, WS_RISK, WS_STOP } from "@/content/workspace/frame";
import { WS_SLICE } from "@/content/workspace/slice";
import type { FactLink } from "@/hi2vi/workspace/frame";
import { mdSections } from "@/hi2vi/workspace/md";
import type { Slice, Verdict } from "@/lib/workspace/types";

export { slicePhaseOf } from "./address";

/**
 * A slice's page, its pure half (design job 02: `Slice.dc.html`, `SliceHead`, `SliceVerdict`, `SliceCommits`;
 * frame.md F44, F84, F86, F305): what the head says under the title, the facts, the verdict's fields, whether
 * the plan earns its Sections list, and the commits. No React, no I/O.
 */

const NONE = WS_GLOSSARY.none;
const L = WS_GLOSSARY.labels;

/** A slice waits on the operator, or is blocked, and its stop is stored. */
export function sliceStopped(slice: Pick<Slice, "status" | "stop">): boolean {
  return (
    !!slice.stop && (slice.status === "pending" || slice.status === "blocked")
  );
}

function text(value: string | null | undefined): string | null {
  return value && value.trim() ? value : null;
}

/**
 * The one sentence under the title, and a stop's words under it. A stopped slice says its stop's `what`
 * (null today: the store keeps no sentence, so the sentence is left out) and its `words` as written; any
 * other slice says its outcome. Nothing at all: null, and the head draws no sentence.
 */
export function sliceLead(
  slice: Pick<Slice, "status" | "stop" | "outcome">,
): { text: string | null; words: string | null } | null {
  const stopped = sliceStopped(slice);
  const lead = stopped ? text(slice.stop?.what) : text(slice.outcome);
  const words = stopped ? text(slice.stop?.words) : null;
  return lead || words ? { text: lead, words } : null;
}

/** One fact of the head: a plain value, or links (Depends on). */
export interface SliceFact {
  label: string;
  text?: string;
  links?: FactLink[];
}

/**
 * The head's facts (F44): for a stopped slice **Stop** and **Since** first; then **Risk**, **Depends on**
 * (one link a slice, its short id), **Started**, **Completed**. A date not yet come and an empty list read `—`.
 */
export function sliceFacts(
  slice: Pick<
    Slice,
    "status" | "stop" | "risk" | "deps" | "started" | "completed" | "phase"
  >,
  date: (value: string | null | undefined) => string,
  depHref: (full: string) => string,
): SliceFact[] {
  const out: SliceFact[] = [];
  if (sliceStopped(slice) && slice.stop) {
    const kind = slice.stop.kind;
    out.push({
      label: L.slice.stop,
      text: kind ? (WS_STOP[kind] ?? kind) : NONE,
    });
    out.push({ label: L.slice.since, text: date(slice.stop.since) });
  }
  out.push({
    label: L.slice.risk,
    text: slice.risk ? (WS_RISK[slice.risk] ?? slice.risk) : NONE,
  });
  out.push(
    slice.deps.length
      ? {
          label: L.slice.dependsOn,
          links: slice.deps.map((id) => ({
            id,
            href: depHref(`${slice.phase}.${id}`),
          })),
        }
      : { label: L.slice.dependsOn, text: NONE },
  );
  out.push({ label: L.slice.started, text: date(slice.started) });
  out.push({ label: L.slice.completed, text: date(slice.completed) });
  return out;
}

/**
 * **Files changed** (F86, the read model's gap): a number when the stored value is one (`7`), else `—`. The
 * store keeps prose (`` `server/retry.py`; `tests/test_retry.py` ``), never counted here.
 */
export function verdictFiles(
  files: string | number | null | undefined,
): string {
  if (typeof files === "number")
    return Number.isFinite(files) ? files.toLocaleString("en-US") : NONE;
  const value = (files ?? "").trim();
  return /^\d+$/.test(value) ? Number(value).toLocaleString("en-US") : NONE;
}

/** A verdict's short fact as the workspace wrote it (`high`, `opus`), `—` when the block has none. */
export function verdictValue(value: string | null | undefined): string {
  return text(value) ?? NONE;
}

/**
 * The verdict's sentences, in order: Summary, Validation, Deviations, Doc impact. A field with no text is left
 * out; Summary is left out when it only repeats the slice's outcome, which the head shows.
 */
export function verdictFields(
  verdict: Pick<Verdict, "summary" | "validation" | "deviations" | "docImpact">,
  outcome: string | null | undefined,
): { label: string; text: string }[] {
  const v = L.verdict;
  const same = (a: string, b: string | null | undefined) =>
    a.trim() === (b ?? "").trim();
  const all: [string, string | null][] = [
    [v.summary, verdict.summary],
    [v.validation, verdict.validation],
    [v.deviations, verdict.deviations],
    [v.docImpact, verdict.docImpact],
  ];
  const out: { label: string; text: string }[] = [];
  for (const [label, value] of all) {
    const t = text(value);
    if (!t) continue;
    if (label === v.summary && same(t, outcome)) continue;
    out.push({ label, text: t });
  }
  return out;
}

/** What the Result panel holds: the result, the done slice's one sentence, or no panel at all. */
export function resultPart(
  slice: Pick<Slice, "result" | "status">,
): "result" | "none" | null {
  if (slice.result) return "result";
  return slice.status === "done" ? "none" : null;
}

/** A plan earns its Sections list from five sections: first-step headings after the title (F84). */
export function planOutline(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return mdSections(plan, { dropTitle: true }).length >= WS_SLICE.outlineFrom;
}

/** A slice's commit (F305): the repo, the full and short SHA, the subject line and its address on GitHub. */
export interface SliceCommit {
  repo: string;
  sha: string;
  short: string;
  subject: string;
  url: string;
}

const str = (v: unknown): v is string => typeof v === "string" && v !== "";

/**
 * A slice's commits from its record (F305, OQ1). The read model stores none today, so this is nearly always
 * empty, and `SliceCommits` then draws nothing; an entry lacking a field, or whose address is not an `https`
 * one, is not drawn.
 */
export function sliceCommits(record: unknown): SliceCommit[] {
  const raw =
    record && typeof record === "object" && "commits" in record
      ? (record as { commits: unknown }).commits
      : null;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c): SliceCommit[] => {
    if (!c || typeof c !== "object") return [];
    const { repo, sha, short, subject, url } = c as Record<string, unknown>;
    if (!str(repo) || !str(sha) || !str(subject) || !str(url)) return [];
    if (!url.startsWith("https://")) return [];
    return [
      { repo, sha, short: str(short) ? short : sha.slice(0, 7), subject, url },
    ];
  });
}
