import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_META_ID, db, productsRepo } from '@/lib/db';
import { freshDatabase } from '@/lib/db/test-helpers';
import { I18nProvider } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';
import { PriceHistory } from './PriceHistory';

beforeEach(async () => {
  await freshDatabase();
});

function renderFor(productId: string) {
  render(
    <I18nProvider initialLang="en">
      <PriceHistory productId={productId} />
    </I18nProvider>,
  );
}

describe('PriceHistory', () => {
  it('says so when the price never changed', async () => {
    const product = await productsRepo.upsert({ name: 'Tea', name_am: 'ሻይ', cost_price: 500, sell_price: 800 });
    renderFor(product.id);
    expect(await screen.findByText(en.priceHistory.empty)).toBeTruthy();
  });

  it('shows the old and new sell price and who changed it, but not an unchanged cost', async () => {
    await db.device_meta.update(DEVICE_META_ID, { cashier_name: 'Almaz' });
    const product = await productsRepo.upsert({ name: 'Tea', name_am: 'ሻይ', cost_price: 500, sell_price: 800 });
    await productsRepo.upsert({ ...product, sell_price: 1000 });

    renderFor(product.id);
    const list = await screen.findByTestId('price-history');
    expect(list.textContent).toContain(en.priceHistory.sell);
    expect(list.textContent).toContain('8.00');
    expect(list.textContent).toContain('10.00');
    expect(list.textContent).toContain(en.priceHistory.by('Almaz'));
    expect(list.textContent).not.toContain(en.priceHistory.cost);
  });
});
