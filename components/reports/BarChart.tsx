'use client';

import { useState } from 'react';

const WIDTH = 500;
const HEIGHT = 140;
const GAP = 2; // surface gap between adjacent bars
const RADIUS = 4; // rounded data-end

/**
 * Hourly takings. One series, so no legend — the heading names it.
 *
 * Negative bars (a refund hour) are ochre and hang below the baseline, so
 * they are distinguished by direction as well as by hue. That secondary
 * encoding is what makes the pair safe for colour-blind readers rather than
 * relying on the 8.7 ΔE alone.
 */
export function BarChart({
  values,
  labelFor,
  formatValue,
  ariaLabel,
}: {
  values: number[];
  labelFor: (index: number) => string;
  formatValue: (value: number) => string;
  ariaLabel: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const barWidth = (WIDTH - GAP * (values.length - 1)) / values.length;
  const baselineY = (max / span) * HEIGHT;

  const peak = values.indexOf(max);
  const shown = selected ?? (max > 0 ? peak : null);

  return (
    <figure className="flex flex-col gap-2">
      {/* Readout instead of a floating tooltip: this runs on a tablet, where
          there is no hover and a tooltip under a fingertip is invisible. */}
      <div className="flex min-h-6 items-baseline justify-between gap-3">
        <span className="num text-xs text-muted">{shown === null ? '' : labelFor(shown)}</span>
        <span className="num text-sm font-semibold">
          {shown === null ? '' : formatValue(values[shown] ?? 0)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => setSelected(null)}
      >
        <line
          x1="0"
          x2={WIDTH}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-rule)"
          strokeWidth="1"
        />

        {values.map((value, index) => {
          const x = index * (barWidth + GAP);
          const height = (Math.abs(value) / span) * HEIGHT;
          const y = value >= 0 ? baselineY - height : baselineY;
          const active = shown === index;

          return (
            <g key={index}>
              <rect
                x={x}
                y={value >= 0 ? y : baselineY}
                width={barWidth}
                height={Math.max(height, value === 0 ? 0 : 1)}
                rx={RADIUS}
                fill={value < 0 ? 'var(--color-ochre)' : 'var(--color-birr-data)'}
                opacity={shown === null || active ? 1 : 0.45}
              />
              {/* Hit target spanning the full height, bigger than the mark. */}
              <rect
                x={x - GAP / 2}
                y={0}
                width={barWidth + GAP}
                height={HEIGHT}
                fill="transparent"
                onPointerEnter={() => setSelected(index)}
                onClick={() => setSelected(index)}
              >
                <title>{`${labelFor(index)} · ${formatValue(value)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between">
        {[0, 6, 12, 18, values.length - 1].map((index) => (
          <span key={index} className="num text-[10px] text-muted">
            {labelFor(index)}
          </span>
        ))}
      </div>
    </figure>
  );
}
