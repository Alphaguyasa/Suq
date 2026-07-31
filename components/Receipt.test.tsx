import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Sale, SaleItem, ShopSettings } from '@/lib/db';
import { I18nProvider } from '@/lib/i18n';
import { Receipt } from './Receipt';

/** Longer than any 80mm line. It must wrap, not clip and not push the money off. */
const LONG_NAME = 'የተፈጨ ቡና ልዩ ዓይነት 500 ግራም በጥቁር ማሸጊያ የተዘጋጀ';

const settings: ShopSettings = {
  id: 'shop',
  shop_name: 'Rowda Supermarket',
  shop_name_am: 'ሮዳ ሱፐርማርኬት',
  phone: '0911234567',
  address: 'ቦሌ፣ አዲስ አበባ',
  receipt_footer: '',
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
  // 250.00 received against a 130.00 total gives 120.00 change — deliberately
  // distinct from the 70.00 line totals so the assertions cannot collide.
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
    name_snapshot: LONG_NAME,
    unit_price: 3500,
    qty: 2,
    line_total: 7000,
  },
  {
    id: 'item-2',
    shop_id: 'shop',
    sale_id: 'sale-1',
    product_id: 'p-2',
    name_snapshot: 'ሾላ ፓስታ 500 ግራም',
    unit_price: 7000,
    qty: 1,
    line_total: 7000,
  },
];

function renderReceipt(props: Partial<Parameters<typeof Receipt>[0]> = {}) {
  return render(
    <I18nProvider>
      <Receipt sale={sale} items={items} settings={settings} {...props} />
    </I18nProvider>,
  );
}

describe('Receipt', () => {
  it('renders a long Amharic name in full rather than truncating it', () => {
    renderReceipt();

    const name = screen.getByText(LONG_NAME);
    expect(name).toBeInTheDocument();
    // Wrapping, not clipping: no ellipsis or nowrap on the name.
    expect(name.className).toContain('break-words');
    expect(name.className).not.toContain('truncate');
  });

  it('keeps the money column from shrinking when the name wraps', () => {
    renderReceipt();

    // Both line totals are 70.00; each must still be present and unshrunk.
    const totals = screen.getAllByText('70.00');
    expect(totals.length).toBeGreaterThanOrEqual(2);
    for (const cell of totals) {
      expect(cell.className).toContain('shrink-0');
    }
  });

  it('shows subtotal, discount and total', () => {
    renderReceipt();

    expect(screen.getByText('140.00')).toBeInTheDocument();
    expect(screen.getByText('-10.00')).toBeInTheDocument();
    expect(screen.getByText('130.00')).toBeInTheDocument();
  });

  it('shows change given, so a reprint is still correct', () => {
    renderReceipt();

    expect(screen.getByText('250.00')).toBeInTheDocument();
    expect(screen.getByText('120.00')).toBeInTheDocument();
  });

  it('omits the cash rows entirely for a non-cash sale', () => {
    renderReceipt({
      sale: { ...sale, payment_method: 'telebirr', cash_received: null },
    });

    expect(screen.queryByText('250.00')).not.toBeInTheDocument();
    expect(screen.getByText('ቴሌብር')).toBeInTheDocument();
  });

  it('stamps a voided sale', () => {
    const voidRow: Sale = { ...sale, id: 'void-1', voids_sale_id: sale.id, total: -13000 };
    renderReceipt({ voidedBy: voidRow });

    expect(screen.getByText('*** ተሰርዟል ***')).toBeInTheDocument();
  });

  it('emits the page size for the configured paper width', () => {
    const { container } = renderReceipt({ settings: { ...settings, printer_width: 58 } });

    // jsdom resolves mm to px in computed style, so assert the authored value.
    const sheet = container.querySelector('[data-print-sheet]');
    expect(sheet?.getAttribute('style')).toContain('58mm');
  });
});
