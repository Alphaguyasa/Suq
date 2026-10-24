import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { AuthFailureError } from '@/lib/supabase/errors';

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  currentUser: vi.fn(async () => null),
}));
const shop = vi.hoisted(() => ({ adoptShopFromMembership: vi.fn() }));

vi.mock('@/lib/supabase/auth', () => auth);
vi.mock('@/lib/sync/shop', () => shop);
vi.mock('@/lib/supabase/client', () => ({ isSupabaseConfigured: () => true }));

const { default: SignInPage } = await import('./page');

function submit() {
  render(
    <I18nProvider initialLang="am">
      <SignInPage />
    </I18nProvider>,
  );
  fireEvent.change(screen.getByLabelText(am.auth.email, { exact: false }), { target: { value: 'a@b.et' } });
  fireEvent.change(screen.getByLabelText(am.auth.password, { exact: false }), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: am.auth.signIn }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sign-in errors', () => {
  it('says "wrong email or password" in Amharic, not Supabase\'s English', async () => {
    auth.signIn.mockRejectedValue(new AuthFailureError('invalidCredentials', 'Invalid login credentials'));
    submit();

    expect(await screen.findByText(am.auth.errors.invalidCredentials)).toBeTruthy();
    expect(screen.queryByText(/Invalid login credentials/)).toBeNull();
  });

  it('explains a failed shop lookup as a sync problem, not as a success notice', async () => {
    auth.signIn.mockResolvedValue({ id: 'u1', email: 'a@b.et' });
    shop.adoptShopFromMembership.mockRejectedValue(new Error('TypeError: Failed to fetch'));
    submit();

    expect(await screen.findByText(am.syncSheet.errors.network)).toBeTruthy();
    expect(screen.getByTestId('shop-error')).toBeTruthy();
  });
});
