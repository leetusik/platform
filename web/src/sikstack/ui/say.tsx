import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { Status, type StatusState } from "./marks";

export interface SayProps {
  /** `p` where the line stands alone, `span` inside a control (the dock's open button). */
  as?: "p" | "span";
  state?: StatusState;
  word: ReactNode;
  /** The rest after the word, in `--ink-2`; the caller's string, its middle dots included. */
  rest?: ReactNode;
  className?: string;
}

/**
 * The state word and its rest (`.say`, job 07 F203, F204): the word in one of the system's status shapes,
 * then its rest on the same baseline, wrapping under the word before anything is cut.
 */
export function Say({ as = "p", state, word, rest, className }: SayProps) {
  const Tag = as;
  return (
    <Tag className={cx("say", className)}>
      <Status state={state}>{word}</Status>
      {rest === undefined ? null : <span className="say-rest">{rest}</span>}
    </Tag>
  );
}
