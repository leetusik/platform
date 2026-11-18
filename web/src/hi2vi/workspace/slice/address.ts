/** The phase a full slice id belongs to (`P8-q4.S1` → `P8-q4`): the address's, before any read. */
export function slicePhaseOf(full: string): string {
  const cut = full.lastIndexOf(".");
  return cut > 0 ? full.slice(0, cut) : full;
}

/** A route segment as an id: decoded once, kept as it stands when it is no valid escape. */
export function segmentId(segment: string | string[] | undefined): string {
  const raw = typeof segment === "string" ? segment : "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
