/**
 * Choice (frame.md F58): one of a few, each a `.btn` with `aria-pressed`; the pressed one is filled with
 * `--ink`. Exactly the option whose value is the chosen one is pressed; with no match, none is. Pure,
 * so a node test reaches it.
 */
export interface ChoiceOption<Value extends string | number> {
  value: Value;
}

export function choicePressed<Option extends ChoiceOption<string | number>>(
  options: readonly Option[],
  value: Option["value"] | null | undefined,
): (Option & { pressed: boolean })[] {
  return options.map((option) => ({
    ...option,
    pressed: option.value === value,
  }));
}
