/**
 * The browser storage behind the end's kept saved line (frame.md F241; the rules are `./saved-line`'s). The only
 * impure part: storage that is absent (the server render, a locked-down browser) or throws (private mode, a full
 * quota, a blocked origin) reads as empty and writes nothing; it never breaks the page.
 */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readKept(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeKept(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Storage refused the write: the line is simply not kept.
  }
}

export function dropKept(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Storage refused: nothing to drop.
  }
}
