/**
 * Copy's behaviour (`Copy.dc.html`, frame.md F1), pure so it can be tested without a DOM: a press
 * writes the text to the clipboard; a write that lands shows `Copied` for 2 s, then the rest label;
 * a write that is refused (no clipboard outside a secure context, `NotAllowedError`) shows the failure
 * line and never `Copied`. Only the latest press counts.
 */
export type CopyResult = "rest" | "copied" | "failed";

export const COPIED_MS = 2000;

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/** The clipboard write: `copied` when it landed, `failed` for a refusal or a missing clipboard. */
export async function writeToClipboard(
  text: string,
  clipboard: ClipboardLike | undefined,
): Promise<"copied" | "failed"> {
  try {
    if (!clipboard) return "failed";
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** One Copy control's state: `press` copies, `onChange` hears each result, `dispose` drops a pending timer. */
export function copyMachine(
  onChange: (result: CopyResult) => void,
  timers: Timers = realTimers,
) {
  let timer: unknown = null;
  let press = 0;
  return {
    async press(text: string, clipboard: ClipboardLike | undefined) {
      const id = ++press;
      if (timer !== null) timers.clear(timer);
      timer = null;
      const result = await writeToClipboard(text, clipboard);
      if (id !== press) return;
      onChange(result);
      if (result === "copied") {
        timer = timers.set(() => {
          timer = null;
          if (id === press) onChange("rest");
        }, COPIED_MS);
      }
    },
    dispose() {
      press += 1;
      if (timer !== null) timers.clear(timer);
      timer = null;
    },
  };
}

/** The block form's button name: `Copy install command` from `Install command` (`LandingCode.dc.html`). */
export function blockCopyLabel(what: string): string {
  return `Copy ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
}
