import { describe, expect, it } from 'vitest';
import type { ShopSettings } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import { cashUpText } from './cashup-text';
import type { CashUp, SalesSummary } from './compute';

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
  net: 452050,
  transactions: 37,
  averageBasket: 12218,
  byMethod: { cash: 300000, telebirr: 152050, card: 0, credit: 0 },
  grossProfit: 90000,
};

const date = '2026-07-31T00:00:00.000Z';

function drawer(counted: number | null): CashUp {
  const expected = 50000 + 300000;
  return {
    openingFloat: 50000,
    cashSales: 300000,
    expected,
    counted,
    variance: counted === null ? null : counted - expected,
  };
}

describe('cashUpText', () => {
  it('lists takings by method and the drawer, in English', () => {
    const text = cashUpText({
      cashUp: drawer(345000),
      summary,
      settings,
      t: en,
      periodLabel: en.reports.today,
      date,
    });

    expect(text.split('\n')).toEqual([
      'ሮዳ ሱፐርማርኬት',
      'Rowda Supermarket',
      'Cash-up · Today',
      formatDateTime(date),
      '--------------------',
      'Net sales: 4,520.50 ETB',
      'Transactions: 37',
      'Cash: 3,000.00',
      'Telebirr: 1,520.50',
      '--------------------',
      'Opening float: 500.00',
      'Cash sales: 3,000.00',
      'Expected in drawer: 3,500.00',
      'Counted: 3,450.00',
      'Variance: 50.00 short',
    ]);
  });

  it('leaves out counted and variance until the drawer is counted', () => {
    const text = cashUpText({
      cashUp: drawer(null),
      summary,
      settings,
      t: am,
      periodLabel: am.reports.today,
      date,
    });

    expect(text).toContain(`${am.reports.expectedDrawer}: 3,500.00`);
    expect(text).not.toContain(am.reports.countedDrawer);
    expect(text).not.toContain(am.reports.variance);
    expect(text).toContain(`${am.reports.cashUp} · ${am.reports.today}`);
  });

  it('says balanced when the count matches, and over when there is extra', () => {
    const base = { summary, settings, t: en, periodLabel: en.reports.today, date };
    expect(cashUpText({ ...base, cashUp: drawer(350000) })).toContain('\nBalanced');
    expect(cashUpText({ ...base, cashUp: drawer(351000) })).toContain('Variance: 10.00 over');
  });

  it('skips empty shop names', () => {
    const text = cashUpText({
      cashUp: drawer(null),
      summary,
      settings: { ...settings, shop_name_am: '', shop_name: '' },
      t: en,
      periodLabel: en.reports.week,
      date,
    });

    expect(text.split('\n')[0]).toBe('Cash-up · This week');
  });
});
