import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, productsRepo } from '@/lib/db';
import { freshDatabase } from '@/lib/db/test-helpers';
import { I18nProvider } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';
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
