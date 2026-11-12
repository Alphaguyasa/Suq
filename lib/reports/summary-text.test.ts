import { describe, expect, it } from 'vitest';
import type { ShopSettings } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import type { ProductPerformance, SalesSummary } from './compute';
import { summaryText } from './summary-text';

const settings: ShopSettings = {
  id: 'shop',
  shop_name: 'Rowda Supermarket',
  shop_name_am: 'ሮዳ ሱፐርማርኬት',
  phone: '0911234567',
  address: '',
  receipt_footer: '',
  receipt_footer_am: '',
  printer_width: 80,
  updated_at: '2026-07-31T10:00:00.000Z',
};

const summary: SalesSummary = {
  net: 835_000,
  transactions: 42,
  averageBasket: 19_881,
  byMethod: { cash: 600_000, telebirr: 235_000, card: 0, credit: 0 },
  grossProfit: 120_050,
};

const row = (product_id: string, name_am: string, revenue: number, units = 1): ProductPerformance => ({
  product_id,
  name_am,
  revenue,
  units,
});

const top = [
  row('sugar', 'ስኳር 1 ኪሎ', 300_000),
  row('oil', 'ዘይት', 200_000),
  row('rice', 'ሩዝ', 150_000),
  row('soap', 'ሳሙና', 100_000),
];

const date = '2026-11-12T05:00:00.000Z';

describe('summaryText', () => {
  it('lists the takings, the change, the three best sellers and the low-stock count', () => {
    const text = summaryText({
      summary,
      change: 12,
      top,
      lowStockCount: 2,
      settings,
      t: en,
      periodLabel: en.reports.today,
      date,
    });

    expect(text.split('\n')).toEqual([
      'ሮዳ ሱፐርማርኬት',
      'Rowda Supermarket',
      'Sales summary · Today',
      formatDateTime(date),
      '--------------------',
      'Net sales: 8,350.00 ETB (+12% vs previous)',
      'Transactions: 42',
      'Average basket: 198.81',
      'Gross profit: 1,200.50',
      '--------------------',
      'Top products',
      '1. ስኳር 1 ኪሎ: 3,000.00',
      '2. ዘይት: 2,000.00',
      '3. ሩዝ: 1,500.00',
      '--------------------',
      'Low stock: 2',
    ]);
  });

  it('shows a fall without a plus sign and leaves the change out with no baseline', () => {
    const base = { summary, top, lowStockCount: 0, settings, t: en, periodLabel: en.reports.week, date };

    expect(summaryText({ ...base, change: -5 })).toContain('Net sales: 8,350.00 ETB (-5% vs previous)');
    const noBaseline = summaryText({ ...base, change: null });
    expect(noBaseline).toContain('Net sales: 8,350.00 ETB\n');
    expect(noBaseline).not.toContain('vs previous');
    expect(noBaseline).not.toContain('Low stock');
  });

  it('a day with no sales says so in two lines and names no best sellers', () => {
    const empty: SalesSummary = {
      net: 0,
      transactions: 0,
      averageBasket: 0,
      byMethod: { cash: 0, telebirr: 0, card: 0, credit: 0 },
      grossProfit: 0,
    };
    const text = summaryText({
      summary: empty,
      change: null,
      top: [],
      lowStockCount: 0,
      settings,
      t: en,
      periodLabel: en.reports.today,
      date,
    });

    expect(text).toContain('Net sales: 0.00 ETB');
    expect(text).toContain('Transactions: 0');
    expect(text).not.toContain('Average basket');
    expect(text).not.toContain('Top products');
  });

  it('skips best sellers whose revenue is zero (free or fully discounted items)', () => {
    const text = summaryText({
      summary,
      change: null,
      top: [row('sugar', 'ስኳር', 300_000), row('gift', 'ስጦታ', 0, 3)],
      lowStockCount: 0,
      settings,
      t: en,
      periodLabel: en.reports.today,
      date,
    });

    expect(text).toContain('1. ስኳር: 3,000.00');
    expect(text).not.toContain('ስጦታ');
  });

  it('uses the Amharic labels and currency when the till is in Amharic', () => {
    const text = summaryText({
      summary,
      change: 12,
      top,
      lowStockCount: 1,
      settings: { ...settings, shop_name: '' },
      t: am,
      periodLabel: am.reports.today,
      date,
    });

    expect(text.split('\n')[0]).toBe('ሮዳ ሱፐርማርኬት');
    expect(text).not.toContain('Rowda');
    expect(text).toContain('የሽያጭ ማጠቃለያ · ዛሬ');
    expect(text).toContain('ጠቅላላ ሽያጭ: 8,350.00 ብር (+12% ካለፈው ጋር)');
    expect(text).toContain('ዝቅተኛ ክምችት: 1');
  });
});
