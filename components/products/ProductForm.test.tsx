import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCashier, db, productsRepo } from '@/lib/db';
import { freshDatabase } from '@/lib/db/test-helpers';
import { I18nProvider } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';
import { resetLockState, unlockAs } from '@/lib/lock/lock';
import { ProductForm } from './ProductForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

function fill(id: string, value: string) {
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
}

function renderNewForm() {
  render(
    <I18nProvider initialLang="en">
      <ProductForm />
    </I18nProvider>,
  );
  fill('f-name-am', 'ሳሙና');
  fill('f-name', 'Soap');
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: en.common.save }));
}

beforeEach(async () => {
  push.mockReset();
  await freshDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductForm', () => {
  it('rejects a negative price on the field instead of failing in the repository', async () => {
    renderNewForm();
    fill('f-sell', '-5');
    save();

    expect(await screen.findByText(en.productForm.invalidPrice)).toBeTruthy();
    expect(await db.products.count()).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });

  it('says why when storage refuses the save, keeps the form, and saves on retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const upsert = vi.spyOn(productsRepo, 'upsert').mockRejectedValueOnce(quota);

    renderNewForm();
    fill('f-sell', '25');
    save();

    expect(await screen.findByText(en.common.saveFailedQuota)).toBeTruthy();
    expect(log).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect((document.getElementById('f-name') as HTMLInputElement).value).toBe('Soap');
    // The button is usable again, not stuck on "saving".
    const button = screen.getByRole('button', { name: en.common.save }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    upsert.mockRestore();
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(screen.getByRole('alert', { hidden: true }).textContent ?? '').not.toContain(
      en.common.saveFailedQuota,
    );
    expect(await db.products.count()).toBe(1);
  });
});

describe('ProductForm price edits (ROADMAP item 32)', () => {
  async function editAs(unlocked: 'owner' | 'cashier') {
    const owner = await addCashier('Almaz', '9999', { owner: true });
    const cashier = await addCashier('Abebe', '1234');
    await unlockAs(unlocked === 'owner' ? owner : cashier);

    const product = await productsRepo.upsert({
      name: 'Soap',
      name_am: 'ሳሙና',
      barcode: null,
      unit: 'pcs',
      cost_price: 2000,
      sell_price: 2500,
      reorder_level: 0,
      is_active: true,
    });
    render(
      <I18nProvider initialLang="en">
        <ProductForm product={product} />
      </I18nProvider>,
    );
    return product;
  }

  afterEach(() => resetLockState());

  it('a cashier renames freely but needs the owner PIN to change a price', async () => {
    const product = await editAs('cashier');

    fill('f-name', 'Soap bar');
    expect(document.getElementById('f-owner-pin')).toBeNull();
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect((await db.products.get(product.id))?.name).toBe('Soap bar');

    push.mockReset();
    fill('f-sell', '30');
    await waitFor(() => expect(document.getElementById('f-owner-pin')).not.toBeNull());
    const pin = document.getElementById('f-owner-pin') as HTMLInputElement;

    // Wrong PIN: nothing written, the form stays.
    fireEvent.change(pin, { target: { value: '1234' } });
    save();
    expect(await screen.findByText(en.lock.wrongOwnerPin)).toBeTruthy();
    expect((await db.products.get(product.id))?.sell_price).toBe(2500);
    expect(push).not.toHaveBeenCalled();

    fireEvent.change(pin, { target: { value: '9999' } });
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect((await db.products.get(product.id))?.sell_price).toBe(3000);
  });

  it('the owner changes a price without being asked', async () => {
    const product = await editAs('owner');

    fill('f-sell', '30');
    save();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(document.getElementById('f-owner-pin')).toBeNull();
    expect((await db.products.get(product.id))?.sell_price).toBe(3000);
  });
});
