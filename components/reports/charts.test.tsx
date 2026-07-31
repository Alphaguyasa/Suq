import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';

/**
 * Geometry checks, not appearance checks. These catch the failures a visual
 * pass would catch — NaN attributes from a zero range, bars escaping the
 * viewBox, a path that degenerates on a single point — none of which are
 * visible in a passing typecheck.
 */
const HEIGHT = 140;
const WIDTH = 500;

function renderBars(values: number[]) {
  return render(
    <I18nProvider>
      <BarChart
        values={values}
        labelFor={(index) => `${index}:00`}
        formatValue={(value) => String(value)}
        ariaLabel="hourly"
      />
    </I18nProvider>,
  );
}

function renderLine(totals: number[]) {
  return render(
    <I18nProvider>
      <LineChart
        points={totals.map((total, index) => ({ date: `2026-07-${10 + index}`, total }))}
        labelFor={(date) => date}
        formatValue={(value) => String(value)}
        ariaLabel="daily"
      />
    </I18nProvider>,
  );
}

function numbers(element: Element, attribute: string): number[] {
  return [...element.querySelectorAll(`[${attribute}]`)].map((node) =>
    Number(node.getAttribute(attribute)),
  );
}

describe('BarChart geometry', () => {
  it('produces no NaN when every hour is zero', () => {
    const { container } = renderBars(new Array(24).fill(0));

    for (const attribute of ['x', 'y', 'width', 'height']) {
      for (const value of numbers(container, attribute)) {
        expect(Number.isFinite(value), `${attribute} is finite`).toBe(true);
      }
    }
  });

  it('keeps every bar inside the viewBox, negatives included', () => {
    const values = new Array(24).fill(0);
    values[9] = 7000;
    values[18] = 35000;
    values[19] = -35000;

    const { container } = renderBars(values);
    const bars = [...container.querySelectorAll('rect')].filter(
      (rect) => rect.getAttribute('fill') !== 'transparent',
    );

    expect(bars).toHaveLength(24);

    for (const bar of bars) {
      const y = Number(bar.getAttribute('y'));
      const height = Number(bar.getAttribute('height'));

      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + height).toBeLessThanOrEqual(HEIGHT + 0.01);
      expect(height).toBeGreaterThanOrEqual(0);
    }
  });

  it('colours negative bars differently and hangs them below the baseline', () => {
    const values = new Array(24).fill(0);
    values[10] = 5000;
    values[11] = -5000;

    const { container } = renderBars(values);
    const bars = [...container.querySelectorAll('rect')].filter(
      (rect) => rect.getAttribute('fill') !== 'transparent',
    );

    const positive = bars[10] as SVGRectElement;
    const negative = bars[11] as SVGRectElement;

    expect(positive.getAttribute('fill')).toContain('birr-data');
    expect(negative.getAttribute('fill')).toContain('ochre');
    // Direction is the secondary encoding: negative starts lower down.
    expect(Number(negative.getAttribute('y'))).toBeGreaterThan(
      Number(positive.getAttribute('y')),
    );
  });
});

describe('LineChart geometry', () => {
  it('produces a finite path for a flat series', () => {
    const { container } = renderLine([0, 0, 0]);
    const path = container.querySelector('path')?.getAttribute('d') ?? '';

    expect(path).not.toContain('NaN');
    expect(path.length).toBeGreaterThan(0);
  });

  it('centres a single point rather than dividing by zero', () => {
    const { container } = renderLine([5000]);
    const path = container.querySelector('path')?.getAttribute('d') ?? '';

    expect(path).not.toContain('NaN');
    expect(path).toContain(`M ${WIDTH / 2}`);
  });

  it('keeps all points inside the viewBox with negatives present', () => {
    const { container } = renderLine([5000, -3000, 12000, 0]);

    for (const circle of container.querySelectorAll('circle')) {
      const cy = Number(circle.getAttribute('cy'));
      const cx = Number(circle.getAttribute('cx'));

      expect(Number.isFinite(cy)).toBe(true);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(HEIGHT);
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(WIDTH);
    }
  });

  it('renders nothing at all rather than an empty axis for no data', () => {
    const { container } = renderLine([]);
    expect(container.querySelector('svg')).toBeNull();
  });
});
