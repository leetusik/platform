import { DISPLAY, type DisplayTheme } from "@/content/library-frame";
import { cx } from "@/lib/cx";

import { Choice } from "./choice";

/**
 * Display (`Display.dc.html`, frame.md F56, F62): the body of the Display sheet. Text size as five
 * **A**s, each at its own step, with `3 of 5, default` under it; Theme as a choice (System, Light, Dark,
 * Sepia), with `System follows this device: light now.` while System is picked (its line keeps its
 * place, hidden, otherwise); where the choice is kept. A change applies at once (`onSize`, `onTheme`);
 * there is no Save. `deviceScheme` is the scheme the device gives now.
 */
export interface DisplayProps {
  size: number;
  theme: DisplayTheme;
  deviceScheme?: "light" | "dark";
  onSize?: (n: number) => void;
  onTheme?: (theme: DisplayTheme) => void;
}

export function Display({
  size,
  theme,
  deviceScheme = "light",
  onSize,
  onTheme,
}: DisplayProps) {
  const note = (n: number) => DISPLAY.sizeNote[n] ?? "";
  return (
    <div className="display">
      <fieldset className="field">
        <legend className="label">{DISPLAY.textSize}</legend>
        <Choice
          even
          value={size}
          onChange={onSize}
          options={DISPLAY.sizes.map((px, i) => ({
            value: i + 1,
            className: "display-size",
            ariaLabel: DISPLAY.sizeLabel(i + 1, note(i + 1)),
            content: (
              <span aria-hidden="true" style={{ fontSize: `${px}px` }}>
                {DISPLAY.sizeLetter}
              </span>
            ),
          }))}
        />
        <p className="hint">{DISPLAY.sizeHint(size, note(size))}</p>
      </fieldset>
      <fieldset className="field">
        <legend className="label">{DISPLAY.theme}</legend>
        <Choice
          even
          value={theme}
          onChange={onTheme}
          options={DISPLAY.themes.map((t) => ({
            value: t.key,
            content: t.label,
          }))}
        />
        <p className={cx("hint", theme !== "system" && "is-off")}>
          {DISPLAY.system(deviceScheme)}
        </p>
      </fieldset>
      <p className="meta">{DISPLAY.kept}</p>
    </div>
  );
}
