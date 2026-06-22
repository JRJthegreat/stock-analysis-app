'use client';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Pre-formatted current value to show on the right of the label. */
  display: string;
}

/**
 * A native range input styled to the dark theme. Purely presentational: it
 * reports values through `onChange`; the parent owns state and the (pure, sync)
 * engine recompute. The accent "filled" portion is a gradient driven by value.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: SliderProps) {
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const pct = Math.max(0, Math.min(100, ratio * 100));

  return (
    <div className="my-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="text-[15px] font-bold text-fg">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="slider-input w-full"
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)`,
        }}
      />
    </div>
  );
}
