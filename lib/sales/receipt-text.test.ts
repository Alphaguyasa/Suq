import { describe, expect, it } from 'vitest';
import type { Sale, SaleItem, ShopSettings } from '@/lib/db';
import { am } from '@/lib/i18n/am';
import { en } from '@/lib/i18n/en';
import { receiptText } from './receipt-text';

const settings: ShopSettings = {
  id: 'shop',
  shop_name: 'Rowda Supermarket',
  shop_name_am: 'ሮዳ ሱፐርማርኬት',
  phone: '0911234567',
  address: '',
  receipt_footer: 'See you soon',
  receipt_footer_am: '',
  printer_width: 80,
  updated_at: '2026-07-31T10:00:00.000Z',
};

const sale: Sale = {
  id: 'sale-1',
  shop_id: 'shop',
  device_id: 'device',
  receipt_no: 'A1-000142',
  subtotal: 14000,
  discount: 1000,
  total: 13000,
  payment_method: 'cash',
  cashier_name: 'መሠረት',
  voided_by: null,
  voids_sale_id: null,
  cash_received: 25000,
  created_at: '2026-07-31T10:15:00.000Z',
  synced_at: null,
};

const items: SaleItem[] = [
  {
    id: 'item-1',
    shop_id: 'shop',
    sale_id: 'sale-1',
    product_id: 'p-1',
    name_snapshot: 'ቡና 500 ግራም',
    unit_price: 3500,
    qty: 2,
    line_total: 7000,
    created_at: '2026-07-31T10:15:00.000Z',
  },
  {
    id: 'item-2',
    shop_id: 'shop',
    sale_id: 'sale-1',
    product_id: 'p-2',
    name_snapshot: 'ሾላ ፓስታ',
    unit_price: 7000,
    qty: 1,
    line_total: 7000,
    created_at: '2026-07-31T10:15:00.000Z',
  },
];

describe('receiptText', () => {
  it('holds everything the printed receipt holds, in Amharic', () => {
    const text = receiptText({ sale, items, settings, t: am });
    const lines = text.split('\n');

    expect(lines[0]).toBe('ሮዳ ሱፐርማርኬት');
    expect(lines).toContain('Rowda Supermarket');
    expect(lines).toContain('A1-000142');
    expect(lines).toContain(`${am.receipt.cashier}: መሠረት`);
    expect(lines).toContain('ቡና 500 ግራም');
    expect(lines).toContain('  2 × 35.00 = 70.00');
    expect(lines).toContain(`${am.sell.subtotal}: 140.00`);
    expect(lines).toContain(`${am.sell.discount}: -10.00`);
    expect(lines).toContain(`${am.sell.total}: 130.00 ብር`);
    expect(lines).toContain(`${am.receipt.paymentMethod}: ${am.payment.cash}`);
    expect(lines).toContain(`${am.sell.received}: 250.00`);
    expect(lines).toContain(`${am.sell.change}: 120.00`);
    // No Amharic footer set: the default thanks, then the English footer.
    expect(lines.slice(-2)).toEqual([am.receipt.thankYou, 'See you soon']);
  });

  it('follows the UI language', () => {
    const text = receiptText({ sale, items, settings, t: en });

    expect(text).toContain('Total: 130.00 ETB');
    expect(text).toContain('Payment: Cash');
  });

  it('leaves out empty shop details instead of printing blank lines', () => {
    const text = receiptText({ sale, items, settings, t: am });

    expect(text).not.toMatch(/\n\n/);
  });

  it('has no cash rows or discount for a telebirr sale without discount', () => {
    const text = receiptText({
      sale: { ...sale, payment_method: 'telebirr', cash_received: null, discount: 0, total: 14000 },
      items,
      settings,
      t: am,
    });

    expect(text).toContain(`${am.receipt.paymentMethod}: ${am.payment.telebirr}`);
    expect(text).not.toContain(am.sell.received);
    expect(text).not.toContain(am.sell.change);
    expect(text).not.toContain(am.sell.discount);
  });

  it('stamps a voided sale and a void row names the original', () => {
    const voidRow: Sale = {
      ...sale,
      id: 'void-1',
      receipt_no: 'A1-000143',
      voids_sale_id: sale.id,
      subtotal: -14000,
      discount: -1000,
      total: -13000,
      cash_received: null,
    };

    expect(receiptText({ sale, items, settings, t: am, voidedBy: voidRow })).toContain(am.receipt.voidedStamp);

    const text = receiptText({ sale: voidRow, items, settings, t: am, original: sale });
    expect(text).toContain(am.receipt.voidedStamp);
    expect(text).toContain(`${am.sales.original}: A1-000142`);
    expect(text).toContain(`${am.sell.total}: -130.00 ብር`);
  });
});
