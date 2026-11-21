import type { WorkspaceRead } from "@/lib/workspace/read";
import type { WorkspaceHead } from "@/lib/workspace/types";

/**
 * The Workspace's sync facts from its own read, for an item page whose own read failed or found nothing: its back
 * row keeps the sync line in every state (frame.md F84). Null when the Workspace did not answer either.
 */
export function wsHeadOf(read: WorkspaceRead): WorkspaceHead | null {
  if (read.state === "ready")
    return { version: read.value.version, sync: read.value.sync };
  if (read.state === "unlinked" || read.state === "never") return read.head;
  return null;
}

/** An address's id as the tab may show it: letters, digits and `-`, `.`, `_` only, never other text. */
const SHOWN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * The tab's title of an item page that did not load (`<id> · sikstack`, the title's template adds the product): the
 * item's id from the address, when it looks like one; otherwise none, and the tab reads the product alone.
 */
export function wsFailedTitle(
  segment: string | null | undefined,
): string | undefined {
  if (!segment) return undefined;
  let id = segment;
  try {
    id = decodeURIComponent(segment);
  } catch {
    return undefined;
  }
  return SHOWN_ID.test(id) ? id : undefined;
}
