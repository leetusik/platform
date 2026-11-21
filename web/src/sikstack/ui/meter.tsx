/** A share in whole per cent, 0 to 100; anything else is drawn at its nearest end (not a number: 0). */
export function meterPercent(value: number): number {
  if (!Number.isFinite(value)) return value === Infinity ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export interface MeterProps {
  /** The share drawn, in per cent. */
  value: number;
  /** The line's words ("Audio prepared"): with them it is a progressbar row, the figure after the line. */
  label?: string;
}

/**
 * The thin line (`.meter`, job 07 F205): the reader's 3 px line, `--line` behind `--accent`. Bare, it is
 * hidden from assistive technology (the dock's foot: the rest says the place); with `label` it is
 * `.meter-row`, a `role="progressbar"` with its words before it and its figure after it.
 */
export function Meter({ value, label }: MeterProps) {
  const pct = meterPercent(value);
  const line = (
    <span className="meter" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </span>
  );
  if (label === undefined) return line;
  return (
    <div
      className="meter-row"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span className="meta">{label}</span>
      {line}
      <span className="meta">{pct}%</span>
    </div>
  );
}
