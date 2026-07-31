'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { addCashier, db, ensureDevice, ensureSettings, isValidPin, updateSettings } from '@/lib/db';
import { useBilingual } from '@/lib/i18n';
import { parseProductCsv } from '@/lib/seed/csv';
import { importProducts } from '@/lib/seed/import';

const TOTAL_STEPS = 4;

/**
 * The flow you walk a shop owner through, so each step asks for one thing and
 * says why it matters. Nothing here is skippable except the import, because
 * a till without a shop name prints a nameless receipt and a till without a
 * device code collides with the one on the next counter.
 */
export default function SetupPage() {
  const { t, other } = useBilingual();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [shopNameAm, setShopNameAm] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [prefix, setPrefix] = useState('A1');
  const [cashierName, setCashierName] = useState('');
  const [pin, setPin] = useState('');
  const [importSummary, setImportSummary] = useState<string>();
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function next() {
    setError(undefined);

    if (step === 1) {
      if (!shopNameAm.trim() && !shopName.trim()) return setError(t.common.required);

      await ensureSettings();
      await updateSettings({
        shop_name: shopName.trim(),
        shop_name_am: shopNameAm.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      return setStep(2);
    }

    if (step === 2) {
      const cleaned = prefix.trim().toUpperCase();
      if (!cleaned) return setError(t.common.required);

      const device = await ensureDevice();
      await db.device_meta.update(device.id, { device_prefix: cleaned });
      return setStep(3);
    }

    if (step === 3) {
      if (!cashierName.trim()) return setError(t.common.required);
      if (!isValidPin(pin)) return setError(t.settings.pinHint);

      await addCashier(cashierName, pin);
      return setStep(4);
    }

    router.push('/');
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setImportErrors([]);
    try {
      const { products, errors } = parseProductCsv(await file.text());
      const { created, skipped } = await importProducts(products);

      setImportSummary(t.setup.imported(created + skipped));
      setImportErrors(errors);
    } catch {
      setError(t.setup.importFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="ethiopic text-xs text-muted">{t.setup.stepOf(step, TOTAL_STEPS)}</span>
        <h1 className="ethiopic text-2xl font-semibold">{t.setup.title}</h1>

        <div className="mt-2 flex gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-ink' : 'bg-rule'}`}
            />
          ))}
        </div>
      </header>

      {step === 1 ? (
        <section className="flex flex-col gap-5">
          <h2 className="ethiopic text-lg font-semibold">{t.setup.shopStep}</h2>

          <Field htmlFor="s-name-am" label={t.settings.shopNameAm} sublabel={other.settings.shopNameAm} error={error}>
            <TextInput
              id="s-name-am"
              autoFocus
              value={shopNameAm}
              onChange={(event) => setShopNameAm(event.target.value)}
              className="ethiopic"
            />
          </Field>

          <Field htmlFor="s-name" label={t.settings.shopName} sublabel={other.settings.shopName}>
            <TextInput id="s-name" value={shopName} onChange={(event) => setShopName(event.target.value)} />
          </Field>

          <Field htmlFor="s-phone" label={t.settings.phone} sublabel={other.settings.phone}>
            <TextInput
              id="s-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="num"
            />
          </Field>

          <Field htmlFor="s-address" label={t.settings.address} sublabel={other.settings.address}>
            <TextInput
              id="s-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="ethiopic"
            />
          </Field>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-5">
          <h2 className="ethiopic text-lg font-semibold">{t.setup.deviceStep}</h2>

          <Field
            htmlFor="s-prefix"
            label={t.settings.devicePrefix}
            sublabel={other.settings.devicePrefix}
            hint={t.settings.devicePrefixHint}
            error={error}
          >
            <TextInput
              id="s-prefix"
              autoFocus
              maxLength={4}
              value={prefix}
              onChange={(event) => setPrefix(event.target.value.toUpperCase())}
              className="num text-center text-xl"
            />
          </Field>

          <p className="num rounded-lg border border-rule p-3 text-center text-lg">
            {prefix.trim().toUpperCase() || 'A1'}-000001
          </p>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-col gap-5">
          <h2 className="ethiopic text-lg font-semibold">{t.setup.cashierStep}</h2>

          <Field htmlFor="s-cashier" label={t.settings.cashierName} sublabel={other.settings.cashierName} error={error}>
            <TextInput
              id="s-cashier"
              autoFocus
              value={cashierName}
              onChange={(event) => setCashierName(event.target.value)}
              className="ethiopic"
            />
          </Field>

          <Field htmlFor="s-pin" label={t.lock.pin} sublabel={other.lock.pin} hint={t.settings.pinHint}>
            <TextInput
              id="s-pin"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              className="num w-28 text-center text-xl"
            />
          </Field>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="flex flex-col gap-4">
          <h2 className="ethiopic text-lg font-semibold">{t.setup.importStep}</h2>
          <p className="ethiopic text-sm text-muted">{t.setup.importHint}</p>
          <p className="text-xs text-muted">{t.setup.importFormat}</p>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleFile(event)}
            disabled={busy}
            className="ethiopic min-h-touch w-full rounded-lg border border-rule p-3 text-sm"
          />

          {importSummary ? (
            <p className="ethiopic text-sm font-medium text-birr">{importSummary}</p>
          ) : null}

          {importErrors.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-lg border border-ochre/40 bg-ochre/10 p-3 text-xs text-ochre">
              {importErrors.slice(0, 5).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center gap-3">
        {step > 1 ? (
          <Button type="button" variant="quiet" onClick={() => setStep((current) => current - 1)}>
            <span className="ethiopic">{t.setup.back}</span>
          </Button>
        ) : null}

        <Button type="button" variant="money" disabled={busy} onClick={() => void next()} className="flex-1">
          <span className="ethiopic">{step === TOTAL_STEPS ? t.setup.finish : t.setup.next}</span>
        </Button>
      </div>
    </div>
  );
}
