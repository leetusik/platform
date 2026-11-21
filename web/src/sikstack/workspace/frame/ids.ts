/**
 * A workspace id inside a sentence never breaks across lines (frame.md F80): the ids the workspace writes
 * (`P57-4q`, `P-7kq2`, `P57-4q.S1`, `P57-4q.DECOMP`, `D141-4r`, `D-09e2`, `A7-m3`) hold a hyphen, where a line
 * may otherwise break. A short id with no hyphen (`P12`) cannot break and is left as text.
 */
const ID = /(?<![\w.-])[PDA]\d*-[a-z0-9]{2,4}(?:\.[A-Z][A-Z0-9]*)?(?![\w-])/g;

export interface WsTextPart {
  text: string;
  id: boolean;
}

/** A sentence cut into its ids and the text between them; joined back, the parts are the sentence. */
export function splitIds(text: string): WsTextPart[] {
  const out: WsTextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(ID)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), id: false });
    out.push({ text: m[0], id: true });
    last = at + m[0].length;
  }
  if (last < text.length || out.length === 0)
    out.push({ text: text.slice(last), id: false });
  return out;
}
