import { describe, expect, it } from 'vitest';
import type { Product, ShopSettings } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import { lowStock } from './compute';
import { reorderText } from './reorder-text';

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

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p',
    shop_id: 'shop',
    name: '',
    name_am: '',
    barcode: null,
    unit: 'pcs',
    cost_price: 0,
    sell_price: 100,
    reorder_level: 5,
    is_active: true,
    updated_at: '2026-07-31T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const sugar = product({ id: 'sugar', name: 'Sugar 1kg', name_am: 'ስኳር 1 ኪሎ', unit: 'kg', reorder_level: 10 });
const oil = product({ id: 'oil', name: '', name_am: 'ዘይት', unit: 'l', reorder_level: 4 });
const bread = product({ id: 'bread', name: 'Bread', name_am: 'ዳቦ', reorder_level: 5 });

const rows = lowStock([sugar, oil, bread], new Map([['sugar', 2.5], ['oil', 4], ['bread', 30]]));
const date = '2026-07-31T08:00:00.000Z';

describe('reorderText', () => {
  it('lists what is low, furthest below its level first, in Amharic', () => {
    const lines = reorderText({ rows, settings, t: am, lang: 'am', date }).split('\n');
    expect(lines.slice(0, 5)).toEqual([
      'ሮዳ ሱፐርማርኬት',
      'Rowda Supermarket',
      '0911234567',
      am.reports.reorderTitle,
      formatDateTime(date),
    ]);
    expect(lines.slice(6)).toEqual([
      `ስኳር 1 ኪሎ: ${am.products.onHand} 2.5 ${am.units.kg} · ${am.productForm.reorderLevel} 10`,
      `ዘይት: ${am.products.onHand} 4 ${am.units.l} · ${am.productForm.reorderLevel} 4`,
    ]);
    // Bread is well above its level.
    expect(lines.join('\n')).not.toContain('ዳቦ');
  });

  it('uses the English name in English, and the Amharic one when there is none', () => {
    const text = reorderText({ rows, settings, t: en, lang: 'en', date });
    expect(text).toContain(`Sugar 1kg: ${en.products.onHand} 2.5 ${en.units.kg} · ${en.productForm.reorderLevel} 10`);
    expect(text).toContain(`ዘይት: ${en.products.onHand} 4 ${en.units.l}`);
    expect(text).toContain(en.reports.reorderTitle);
  });

  it('leaves out shop lines that are empty', () => {
    const text = reorderText({
      rows,
      settings: { ...settings, shop_name: '', phone: '' },
      t: en,
      lang: 'en',
      date,
    });
    expect(text.split('\n').slice(0, 2)).toEqual(['ሮዳ ሱፐርማርኬት', en.reports.reorderTitle]);
  });
});
