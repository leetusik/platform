import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { choicePressed } from "./choice-model";

/**
 * Choice (`Choice.dc.html`, frame.md F58): `div.choice[role=group]` of `.btn[aria-pressed]`; the pressed
 * one is filled with `--ink`. `even` (`.is-even`) makes the choices equal widths. It wraps at 320 px and
 * is never a joined segmented bar. Used for text size, theme, the bar's language and the library's
 * view. With no `label` it is no group of its own (Display's, inside a `fieldset` that names it).
 */
export interface ChoiceItem<Value extends string | number> {
  value: Value;
  /** What the button shows; the option's words, or Display's `A`. */
  content: ReactNode;
  /** The button's full name where it shows less (`EN` is `English`). */
  ariaLabel?: string;
  lang?: string;
  className?: string;
}

export interface ChoiceProps<Value extends string | number> {
  /** The group's name: `View`, `Show`, `Language`, `Theme`. */
  label?: string;
  options: readonly ChoiceItem<Value>[];
  value: Value | null | undefined;
  onChange?: (value: Value) => void;
  even?: boolean;
  className?: string;
}

export function Choice<Value extends string | number>({
  label,
  options,
  value,
  onChange,
  even = false,
  className,
}: ChoiceProps<Value>) {
  return (
    <div
      className={cx("choice", even && "is-even", className)}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {choicePressed(options, value).map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={cx("btn", option.className)}
          aria-pressed={option.pressed}
          aria-label={option.ariaLabel}
          lang={option.lang}
          onClick={onChange ? () => onChange(option.value) : undefined}
        >
          {option.content}
        </button>
      ))}
    </div>
  );
}
