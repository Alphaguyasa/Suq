'use client';

import { useState } from 'react';

const WIDTH = 500;
const HEIGHT = 140;
const PAD = 6;

/**
 * Daily takings across a period. One series, 2px stroke, 8px hit targets.
 * Empty days are present as zeroes rather than skipped, so a quiet Tuesday
 * looks like a quiet Tuesday and not like a shorter week.
 */
export function LineChart({
  points,
  labelFor,
  formatValue,
  ariaLabel,
}: {
  points: { date: string; total: number }[];
  labelFor: (date: string) => string;
  formatValue: (value: number) => string;
  ariaLabel: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  if (points.length === 0) return null;

  const values = points.map((point) => point.total);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const x = (index: number) =>
    points.length === 1 ? WIDTH / 2 : (index / (points.length - 1)) * (WIDTH - PAD * 2) + PAD;
  const y = (value: number) => HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.total)}`).join(' ');
  const baselineY = y(0);

  const shown = selected;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex min-h-6 items-baseline justify-between gap-3">
        <span className="num text-xs text-muted">
          {shown === null ? '' : labelFor(points[shown]?.date ?? '')}
        </span>
        <span className="num text-sm font-semibold">
          {shown === null ? '' : formatValue(points[shown]?.total ?? 0)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => setSelected(null)}
      >
        {min < 0 ? (
          <line
            x1="0"
            x2={WIDTH}
            y1={baselineY}
            y2={baselineY}
            stroke="var(--color-rule)"
            strokeWidth="1"
          />
        ) : null}

        <path
          d={path}
          fill="none"
          stroke="var(--color-birr-data)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point, index) => (
          <g key={point.date}>
            {shown === index ? (
              <circle
                cx={x(index)}
                cy={y(point.total)}
                r="4"
                fill="var(--color-birr-data)"
                stroke="var(--color-paper)"
                strokeWidth="2"
              />
            ) : null}
            <circle
              cx={x(index)}
              cy={y(point.total)}
              r="10"
              fill="transparent"
              onPointerEnter={() => setSelected(index)}
              onClick={() => setSelected(index)}
            >
              <title>{`${labelFor(point.date)} · ${formatValue(point.total)}`}</title>
            </circle>
          </g>
        ))}
      </svg>

      <div className="flex justify-between">
        <span className="num text-[10px] text-muted">{labelFor(points[0]?.date ?? '')}</span>
        <span className="num text-[10px] text-muted">
          {labelFor(points[points.length - 1]?.date ?? '')}
        </span>
      </div>
    </figure>
  );
}
