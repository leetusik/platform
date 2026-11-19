import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { json } from "@/lib/feedback/format";

import { Absent } from "./marks";

/**
 * Facts (`Facts.dc.html`, frame.md F127): label over value, in pairs that wrap by the width they have
 * (12em at least). The board's `dl.facts` is the system's `dl.facts.is-grid` (D238-rm: the Workspace's
 * `.facts` is its own, content-wide pairs). Children are `Fact`s.
 */
export function Facts({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <dl className={cx("facts is-grid", className)}>{children}</dl>;
}

const absent = (value: ReactNode) =>
  value === null || value === undefined || value === false || value === "";

/**
 * Fact: `div.fact > dt + dd`. No value draws the dash (F124): every label stays, so one piece of
 * feedback reads as the next. `wide` (`.is-wide`) gives a long value a line of its own (Trigger
 * message, Target text, a raw JSON block). `lang` marks the value's language on the `dd`.
 */
export function Fact({
  label,
  children,
  wide = false,
  lang,
}: {
  label: string;
  children?: ReactNode;
  wide?: boolean;
  lang?: string;
}) {
  return (
    <div className={cx("fact", wide && "is-wide")}>
      <dt>{label}</dt>
      <dd lang={lang}>{absent(children) ? <Absent /> : children}</dd>
    </div>
  );
}

/**
 * Text the caller wrote, keeping its line breaks at the one measure (frame.md F127, `.keep-lines`,
 * 72ch at most). `lead` is the one text a page is for, a piece of feedback's message, at the head
 * step (`p.lead.keep-lines`). Bound as text, never as markup.
 */
export function KeepLines({
  text,
  lead = false,
  lang,
}: {
  text: string;
  lead?: boolean;
  lang?: string;
}) {
  return (
    <p className={cx(lead && "lead", "keep-lines")} lang={lang}>
      {text}
    </p>
  );
}

/**
 * Raw JSON (`Json.dc.html`, frame.md F126): the mono face in a box that scrolls both ways inside itself,
 * at most sixteen and a half lines tall; it takes focus so the arrow keys scroll it, and is named by its
 * label. The text is the value indented by two. An empty object or array, or none, draws nothing.
 */
export function Json({ label, value }: { label: string; value: unknown }) {
  const text = json(value);
  if (text === null) return null;
  return (
    <div className="json" tabIndex={0} role="region" aria-label={label}>
      <pre>{text}</pre>
    </div>
  );
}
