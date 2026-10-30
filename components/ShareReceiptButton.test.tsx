import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { am } from '@/lib/i18n/am';
import { ShareReceiptButton } from './ShareReceiptButton';

const t = am;

function renderButton() {
  return render(
    <I18nProvider>
      <ShareReceiptButton title="A1-000001" text="receipt body" />
    </I18nProvider>,
  );
}

function stubNavigator(props: { share?: unknown; clipboard?: unknown }) {
  // jsdom has neither API; define them on the instance so each test starts clean.
  Object.defineProperty(navigator, 'share', { value: props.share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: props.clipboard, configurable: true });
}

async function tap() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t.sales.share }));
  });
}

afterEach(() => {
  stubNavigator({});
  vi.restoreAllMocks();
});

describe('ShareReceiptButton', () => {
  it('opens the share sheet with the receipt text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });
    renderButton();

    await tap();

    expect(share).toHaveBeenCalledWith({ title: 'A1-000001', text: 'receipt body' });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('says nothing when the cashier closes the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    renderButton();

    await tap();

    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('copies instead when sharing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const share = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    renderButton();

    await tap();

    expect(writeText).toHaveBeenCalledWith('receipt body');
    expect(screen.getByRole('status')).toHaveTextContent(t.sales.copied);
  });

  it('copies to the clipboard where there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    renderButton();

    await tap();

    expect(writeText).toHaveBeenCalledWith('receipt body');
    expect(screen.getByRole('status')).toHaveTextContent(t.sales.copied);
  });

  it('says so when the copy is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderButton();

    await tap();

    expect(screen.getByRole('status')).toHaveTextContent(t.sales.shareFailed);
  });

  it('is not shown when the browser can neither share nor copy', () => {
    stubNavigator({});
    renderButton();

    expect(screen.queryByRole('button', { name: t.sales.share })).not.toBeInTheDocument();
  });

  it('uses the label and copied message it is given', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });
    render(
      <I18nProvider>
        <ShareReceiptButton
          title="cash-up"
          text="cash-up body"
          label={t.reports.shareCashUp}
          copiedMessage={t.reports.cashUpCopied}
        />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.reports.shareCashUp }));
    });

    expect(writeText).toHaveBeenCalledWith('cash-up body');
    expect(screen.getByRole('status')).toHaveTextContent(t.reports.cashUpCopied);
  });
});
